# 배포 아키텍처 확정을 위한 인프라 협의 문서

프론트는 **Vercel**, 백엔드/실시간 계층은 **인프라 nginx(`i15a405.p.ssafy.io`)** 뒤에 배포되는 구성을 가정한다. AI 인식 서버(`ai/game-server`)의 프로덕션 배치가 아직 확정되지 않아, 아래 항목을 인프라 담당과 확정해야 다음 단계(배포)를 진행할 수 있다.

## 0. 배경 — 지금까지 검증된 것 / 안 된 것

검증됨
- AI 인식 서버: 단위 16/16, 아티팩트 SHA 4건 일치, 단일·1:1 동시(세션 격리) 스모크, env 미설정 시 baseline 로드.
- 배포 백엔드: 라이브(api-docs/actuator), 인증 enforcement, **1:1 SIGN_DUEL 오케스트레이션 해피패스 e2e 13/13 PASS**(모사 클라이언트).
- 계약 정합성(git 대조, 브라우저 불필요):
  - **프론트 브랜치 확정**: 배포 백엔드 실시간 계약(native WS `/ws/game-rooms/{id}?ticket=`, `SIGNAL`·`PEER_*`·`GAME_STARTED`, `sse-ticket`/`realtimeTicket`)을 구현한 프론트는 **`feature/khstemp-game-ai-integration` 유일**. 다른 브랜치(`frontend`, `feature/game-mediapipe-integration`)는 대전 실시간 미구현. khstemp 자체 문서에 "STOMP 미사용, ticket 기반 native WebSocket" 명시. `.env.example`의 STOMP `VITE_MATCH_*`는 미사용 잔재.
  - **프론트↔AI 서버 메시지 계약 일치**: 프론트가 `LANDMARK_FRAME`/`GET_CAPABILITIES` 송신, `CAPABILITIES/PREDICTION/SIGN_CONFIRMED/HAND_RELEASED/ERROR` 처리 → AI 서버 `messages.py` 출력 타입과 일치.

미검증(배포 전 필수)
- 실제 사람 플레이(카메라→MediaPipe→WebRTC 영상→인식) — 브라우저 2대 수동.
- 프론트엔드 빌드/설정(이 브랜치에 소스 없음), 백엔드 엣지케이스·게임 로직 전수.
- 프로덕션 AI 인식 서버 배치·노출.

## 1. 핵심 제약 (먼저 합의)

- Vercel은 HTTPS 서빙 → 프론트에서 나가는 **모든 연결은 `https://` / `wss://`** 여야 한다(브라우저 mixed-content 차단). 특히 AI 인식 서버는 현재 `ws://localhost:8765`(평문)이라, **반드시 nginx TLS 뒤 `wss://`로 노출**해야 한다.

## 2. AI 인식 서버 호스팅 (가장 중요)

- [ ] AI 서버를 **어디에** 띄우나? (백엔드와 같은 호스트의 프로세스 / 별도 컨테이너 / 별도 인스턴스)
- [ ] 누가 배포·기동·재시작을 관리하나? (systemd 유닛 / docker-compose / k8s)
- [ ] 바인딩: 같은 호스트면 `127.0.0.1:8765` 유지(외부 미노출), **컨테이너/별도 호스트면 `0.0.0.0` 바인딩 필요** → `app/main.py`의 `HOST`가 현재 `"localhost"`로 하드코딩이라 조정 필요.
- [ ] 컨테이너화 자산: 예전 `feature/AI-013-ai-server-container`("feat: AI 서버 Docker 배포 준비")가 있는지, 이걸 프로덕션에 쓸지.
- [ ] 런타임: **Python 3.11 또는 3.12** + `scikit-learn==1.9.0`(1.9.0은 3.11+ 필요). 배포 이미지/호스트 파이썬 버전 확인.
- [ ] 리소스: TensorFlow(TFLite) 로드 상시 메모리, CPU. baseline 저지연이지만 상시 프로세스 자원 산정.

## 3. nginx 리버스 프록시 (WebSocket + TLS)

- [ ] AI 인식 서버용 `wss://` location 추가 가능한지, 경로는 무엇으로 할지(예: `/ai-ws/`).
  ```nginx
  location /ai-ws/ {
      proxy_pass http://127.0.0.1:8765/;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 3600s;   # 장시간 연결 유지
  }
  ```
- [ ] 게임방 시그널링 WS(`/api/ws/game-rooms/{id}`)와 SSE(`/api/game-rooms/subscribe`)도 동일하게 업그레이드/버퍼링/타임아웃이 프록시 설정에 반영돼 있는지(SSE는 `proxy_buffering off` 필요).
- [ ] 최종 프론트 접속 URL 확정: API `https://i15a405.p.ssafy.io/api`, AI `wss://i15a405.p.ssafy.io/ai-ws/` (경로 합의값).

## 4. CORS / Origin

- [ ] 백엔드 CORS가 **Vercel 도메인**(프로덕션 + preview 도메인)을 허용하는지. 아니면 API 호출이 브라우저에서 막힌다.
- [ ] 인증 헤더(Authorization: Bearer)·자격증명 포함 요청 허용 설정 확인.

## 5. WebRTC (TURN/STUN)

- [ ] `GET /api/webrtc/ice-servers`가 반환하는 STUN/**TURN** 서버가 실제로 떠 있고 자격증명이 유효한지(관련 인프라 브랜치: `Infra-587/589/590/592` coturn).
- [ ] **서로 다른 네트워크(대칭 NAT 포함)**에서 TURN 릴레이로 1:1 영상이 성립하는지 — 같은 LAN에서만 되는 함정 주의.

## 6. 프론트(Vercel) 설정

- [ ] Vercel 환경변수의 API base·AI ws URL이 `https`/`wss` 인프라 엔드포인트를 가리키는지(localhost 금지).
- [ ] 프론트 빌드/배포 파이프라인 및 도메인 확정.

## 7. 운영/정리

- [ ] AI 서버 헬스체크·로그·재시작 정책(프로세스 죽으면 대전 중 인식 중단).
- [ ] 단일 프로세스 asyncio 서버의 **동시 방 수용량**(1:1 다수 동시 진행 시) 산정, 필요 시 다중 워커/인스턴스.
- [ ] e2e 하네스를 프로덕션에 돌릴 경우 생기는 `game_results` 테스트 행 정리 방침(유저는 자동 withdraw로 랭킹 제외되나 결과 행은 잔존) → 가능하면 **스테이징 대상 실행**.

## 8. 확정 후 검증 방법

wss 경로가 정해지면 로컬(네트워크 가능 환경)에서:
```bash
python ai/game-server/scripts/e2e_sign_duel.py \
  --base-url https://i15a405.p.ssafy.io/api \
  --ai-ws  wss://i15a405.p.ssafy.io/ai-ws/
```
→ 백엔드 1:1 흐름 + AI 서버 `CAPABILITIES`까지 통과 후, 브라우저 2대로 런북 B(실제 카메라·WebRTC·TURN) 수동 검증을 마치면 "1:1 배포 가능" 판정.
