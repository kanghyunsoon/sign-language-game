# 성능 측정 하니스 (k6)

로컬 전용 부하 측정 스크립트. **CI에 넣지 않는다** — 매 빌드마다 돌릴 성질이 아니고, 수동 실행 + 기준선 파일 비교로 쓴다.

## 이 디렉터리에 없는 것 — 의도적이다

**측정 환경(docker compose, nginx 설정, `.env`)은 이 리포지터리에 포함하지 않는다.** 로컬 머신 사양·경로·cpuset에 묶인 파일이라 공유해도 그대로 쓸 수 없고, 운영 compose와 혼동될 위험이 있다. 각자 로컬에 두고 이 디렉터리를 마운트해서 쓴다. 필요한 것은 아래 세 개뿐이다.

| 파일 | 역할 |
|---|---|
| `docker-compose.perf.yml` | mysql 8.4 + backend + (nginx) + k6 + node 컨테이너. 앱 스택에 `cpuset: "0-3"`, 부하 생성기에 `"4-7"` |
| `.env.perf` | `SUHWA_REPO`(이 워크트리 경로), DB 비밀번호, `JWT_SECRET`, 튜닝 노브 |
| `nginx/perf.nginx.conf` | 실시간 시나리오만 경유. WS 업그레이드·SSE 버퍼링·`proxy_read_timeout` 검증용 |

compose는 이 디렉터리를 읽기 전용으로 마운트한다 — `perf/k6` → `/scripts`, `perf/node` → `/app`. **이미지 빌드가 없다**: k6는 `grafana/k6`, node 스크립트는 표준 라이브러리만 쓰므로 `node:22-alpine`을 그대로 쓴다.

## 구성

```
k6/lib/       config(노브) · api(엔드포인트) · metrics(커스텀 지표) · tokens(계정 풀) · lifecycle(방 흐름)
k6/s0-smoke.js        하니스 자체 검증. 여기서 실패하면 부하를 걸지 않는다
k6/s1-auth.js         BCrypt CPU 상한 (constant-arrival-rate)
k6/s3-room-churn.js   방 생명주기 churn (ramping-arrival-rate)
k6/s4-fanout.js       실시간 팬아웃 — 핵심 측정
node/swarm.mjs        로비 SSE 구독자 팜 + 전달 지연 prober
node/sample-metrics.mjs   actuator 메트릭 → CSV
tools/seed.sh · seed.sql  계정·콘텐츠·배경 WAITING 방 시딩
tools/mint-tokens.mjs     토큰 사전 발급 → k6/data/tokens.json
```

## 실행

```bash
# 1) 스택 기동 (compose 파일이 있는 로컬 디렉터리에서)
docker compose -f docker-compose.perf.yml --env-file .env.perf up -d --build

# 2) 데이터 시딩 — 계정 200개, 배경 WAITING 방 0개
USERS=200 WAITING_ROOMS=0 ./tools/seed.sh

# 3) 토큰 사전 발급 (BCrypt 비용을 측정에서 분리하기 위해)
USERS=200 node tools/mint-tokens.mjs

# 4) 스모크 — 반드시 먼저
docker compose --profile load run --rm k6 run /scripts/s0-smoke.js

# 5) 기준선. 샘플러를 함께 띄운다
docker compose --profile load up -d sampler
RATE=20 DURATION=4m docker compose --profile load run --rm k6 run /scripts/s3-room-churn.js

# 6) 팬아웃 격자 — 구독자 수를 바꿔가며 같은 부하를 준다
SUBSCRIBERS=200 docker compose --profile load up -d sse-swarm
RATE=20 DURATION=2m SUBSCRIBERS=200 WAITING_ROOMS=0 \
  docker compose --profile load run --rm k6 run /scripts/s4-fanout.js
```

## 설계상 알아야 할 것

- **한 VU가 두 플레이어를 연기한다.** k6의 VU는 격리돼 있어 "A가 만든 방 코드를 B가 받는" 조율이 안 된다. 서버는 요청이 몇 개 클라이언트에서 오는지 신경 쓰지 않으므로 부하 특성은 동일하다.
- **409는 실패가 아니다.** `@Version` 낙관적 락 충돌은 정상 동작이다. `responseCallback`으로 `http_req_failed`에서 빼고 `expected_4xx` 카운터로 따로 센다.
- **티켓은 1회용 + TTL 30초다.** 미리 만들어두면 만료된다. 방 WS 티켓은 별도 API가 없고 create/join 응답에 동봉된다.
- **팬아웃 비용은 O(구독자 수 × WAITING 방 수)다.** `SseEmitter.send(data)`가 emitter마다 스냅샷을 다시 직렬화한다. 구독자만 늘리면 실제 규모를 놓치므로 배경 WAITING 방도 축으로 둔다.
- **s3 단독 수치는 하한이다.** SSE 구독자 0 · WS 세션 0이면 팬아웃이 빈 루프다. 진짜 비용은 s4에서 나온다.
- **소스 코드는 측정을 위해 고치지 않는다.** 메트릭 노출은 compose의 `MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE` 환경변수로 켜고, 지연 백분위는 k6가 직접 잰다. 풀 크기·힙·확인 대기 시간도 이미 전부 환경변수다.
