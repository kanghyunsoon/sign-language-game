# 수어의 달인

웹캠으로 한국 수어(KSL)를 인식해 학습과 게임으로 익히는 웹 서비스입니다.
브라우저에서 손·상체 랜드마크를 추출해 서버의 인식 모델로 보내고, 확정된 예측을
학습 피드백과 게임 입력으로 사용합니다.

SSAFY 15기 공통 프로젝트(A405) · 2026-07-16 ~ 2026-08-21 · 6명 · 커밋 1130개

---

## 무엇을 하는 서비스인가

| 영역 | 내용 |
| --- | --- |
| 학습 | 지문자·숫자·단어를 카드로 학습하고, 웹캠으로 직접 만들어 맞았는지 즉시 확인 |
| 솔로 프링글수 | 제시된 지문자를 손으로 만들면 그 글자가 물리 블록으로 떨어져 쌓인다. 결승선에 닿으면 종료, 경과 시간으로 랭킹 |
| 1:1 프링글수 | 두 사람이 같은 목표 글자를 두고 경쟁. 먼저 인식한 사람의 보드에만 블록이 떨어지고, 3연속 성공 시 상대 블록을 빼앗는다 |
| 지문자 턴 배틀 | 자모를 기술 카드로 쓰는 턴제 대전. 자모 종류별로 공격·방어·결계·공명·필살기 역할이 다르고 3원 상성이 있다 |
| 성장 | 출석·정답 기록으로 펫이 성장하고, 오답은 복습 대상으로 쌓인다 |

게임 진행은 **서버가 중계하지 않습니다.** 백엔드는 방 생성·참가·결과 저장만 REST로
제공하고, 실제 대전은 WebRTC DataChannel P2P로 돌아갑니다. 시그널링만 서버를 거칩니다.

---

## 인식 모델

세 가지 모델이 각각 독립한 WebSocket 서버로 떠 있습니다.

| 대상 | 클래스 | 모델 | 지표 |
| --- | --- | --- | --- |
| 지문자 | 자모 31개 | dual-head 앙상블 (feature_v2 55차원 + feature_v3 78차원, 확률 평균) | 정확도 98.4%, 최저 클래스 recall 70.5% |
| 숫자 | 1~10 + none (11) | scikit-learn Extra Trees, feature_v3 78차원, 프레임 단위 | `ai/number/models/number-10-v1/manifest.json` |
| 단어 | 단어 21개 + wrong | ONNX Runtime int8, 시퀀스 48프레임 × 300차원, pose 정규화 + 물리량 가드 + 수형 규칙 | `ai/word/models/ksl-word-v7/` |

**정확도는 클래스별로 고르지 않습니다.** 지문자 31자모 중 일부는 신뢰할 수 없는
수준이어서, 프론트엔드가 모델 예측을 그대로 게임 입력으로 쓰지 않고 별도의 확정
단계를 둡니다. 그 경계는 `ai/contracts/recognition/readiness.json`의
`confirmationAuthority` 필드에 계약으로 박아 두었습니다.

---

## 디렉터리 구조

```
frontend/   React 19 + TypeScript + Vite. 학습 UI, 게임 모듈, 브라우저 랜드마크 추출
backend/    Spring Boot 4. 인증·방·결과·랭킹·성장 REST API + WebSocket 시그널링
  suhwa/      애플리케이션 소스
  specs/      기능 명세와 API 계약(OpenAPI)
ai/
  fingerspelling/  지문자 학습 파이프라인 (데이터 → 피처 → 학습 → 평가)
  game-server/     지문자 인식 서버 (배포본)
  number/          숫자 인식 서버
  word/            단어 인식 서버
  models/          학습된 모델 아티팩트와 매니페스트
  contracts/       인식 확정 계약 — 프론트엔드와 AI의 경계
infra/
  compose/         서비스별 Docker Compose 정의 (`local.yml` 은 로컬 전체 스택)
  coturn/          STUN/TURN 서버 설정
  monitoring/      Prometheus + Grafana 구성
  scripts/         DB 백업, 인증서 갱신
  systemd/         백업 타이머 유닛
docs/       포트폴리오·기술 문서
```

---

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| 프론트엔드 | React 19, TypeScript, Vite, matter-js(2D 물리), PixiJS 8(WebGL) |
| 손 인식 | @mediapipe/tasks-vision — 손 21점 + 포즈 33점, Web Worker 실행 + 메인 스레드 폴백 |
| 실시간 | WebRTC DataChannel(게임 진행), WebRTC mesh(영상, 최대 4인), WebSocket(시그널링), SSE(로비) |
| 백엔드 | Spring Boot 4, Java 17, Gradle, MySQL 8.4, Flyway, JJWT, springdoc OpenAPI |
| AI 서버 | Python 3.11, TensorFlow, scikit-learn, ONNX Runtime, websockets |
| 인프라 | Docker Compose, Nginx 리버스 프록시, coturn, Prometheus, Grafana |
| 테스트 | Vitest(프론트), JUnit(백엔드), pytest(AI) |

상태 관리 라이브러리, 애니메이션 라이브러리, WebRTC 래퍼, HTTP 클라이언트를 쓰지
않았습니다. 게임 모듈이 호스트 앱의 `package.json`을 오염시키지 않는 것이 병합
조건이어서, 표준 API와 얇은 어댑터로 구현했습니다.

### 규모

| | 소스 | 테스트 |
| --- | --- | --- |
| 프론트엔드 | 614 파일 (ts/tsx) | 161 파일 |
| 백엔드 | 192 파일 (java) | 67 파일 |
| AI | 118 파일 (py) | 26 파일 |

---

## 서비스 구성

프론트엔드는 Vercel, 나머지는 EC2 한 대에 Docker로 올리고 Nginx가 앞에서 분배합니다.

| 서비스 | 내부 바인딩 | 외부 경로 |
| --- | --- | --- |
| 백엔드 | `127.0.0.1:8080` | `/api/` |
| 지문자 AI | `127.0.0.1:8765` | `/ai/ws` |
| 숫자 AI | `127.0.0.1:8766` | `/number` |
| 단어 AI | `127.0.0.1:8767` | `/word` |
| MySQL | 외부 미공개 | 백엔드 내부 연결 |
| coturn | host network | `3478`, `5349`, `49160-49200/udp` |

---

## 실행 방법

### 1) 전체 스택 한 번에 (Docker, 권장)

프런트·백엔드·MySQL·AI 3종을 한 번에 올립니다. 접속 경로를 nginx 하나로 모아
운영과 같은 "프런트와 API가 같은 오리진" 구조로 띄우기 때문에, 환경변수 설정이나
CORS 조정 없이 그대로 동작합니다.

필요한 것: Docker Desktop(또는 Docker Engine) + Compose v2. 그 외 준비물은 없습니다.
Node·JDK·Python을 로컬에 설치하지 않아도 됩니다.

```bash
docker compose -f infra/compose/local.yml up -d --build
```

첫 빌드는 이미지를 처음 만들기 때문에 5~10분, 이후에는 캐시가 재사용됩니다.
프런트엔드 빌드 중 MediaPipe 손·포즈 모델(약 13MB)을 내려받으므로 네트워크가 필요합니다.
지문자 인식 이미지는 TensorFlow를 포함해 약 3.5GB입니다.

빌드가 끝나면 **http://localhost:8081** 로 접속합니다.

> 반드시 `localhost` 로 접속하세요. 브라우저는 `localhost` 와 HTTPS만 보안 컨텍스트로
> 취급하므로, LAN IP(`http://192.168.x.x:8081`)로 열면 웹캠 접근이 차단됩니다.

| 경로 | 연결 대상 | 직접 접근 |
| --- | --- | --- |
| `http://localhost:8081` | 프런트엔드 (nginx) | — |
| `/api/**` | 백엔드 REST·SSE·게임방 WebSocket | `http://localhost:8080` |
| `/api/swagger-ui/index.html` | API 문서 | `http://localhost:8080/swagger-ui/index.html` |
| `/ai/ws` | 지문자 인식 WebSocket | `ws://localhost:8765` |
| `/number` | 숫자 인식 WebSocket | `ws://localhost:8766` |
| `/word` | 단어 인식 WebSocket | `ws://localhost:8767` |

로그인은 회원가입으로 계정을 만들면 됩니다(이메일 형식, 비밀번호 8자 이상, 닉네임 2~10자).
DB는 빈 상태로 시작하고 Flyway가 스키마를 v11까지 자동 적용합니다.

상태 확인과 종료:

```bash
docker compose -f infra/compose/local.yml ps            # 상태 (AI 3종은 healthy 로 표시)
docker compose -f infra/compose/local.yml logs -f backend
docker compose -f infra/compose/local.yml down          # 중지 (DB 데이터는 볼륨에 남음)
docker compose -f infra/compose/local.yml down -v       # 중지 + DB까지 삭제
```

만든 이미지까지 지우려면:

```bash
docker rmi sudal-frontend:local sudal-backend:local sudal-ai:local sudal-number-ai:local sudal-word-ai:local
```

막히는 지점:

| 증상 | 원인과 조치 |
| --- | --- |
| 카메라가 안 잡힌다 | `127.0.0.1`·LAN IP가 아니라 `localhost` 로 접속. 브라우저 카메라 권한 허용 여부도 확인 |
| 포트 충돌 | 8081·8080·8765·8766·8767을 쓴다. `infra/compose/local.yml` 의 `ports` 왼쪽 값을 바꾸면 된다(8081을 바꾸면 단어 인식 주소도 함께 바꿔야 한다 — 아래 참고) |
| `local-backend` 가 안 뜬다 | MySQL healthcheck 통과를 기다리는 중일 수 있다(첫 기동은 30초 이상). `logs -f backend` 로 Flyway 마이그레이션 로그를 확인 |
| 1:1 대전에서 상대가 안 붙는다 | coturn(TURN)은 이 스택에 없다. 같은 머신의 두 탭·두 브라우저는 host candidate로 연결되지만, 서로 다른 네트워크 간 relay 경로는 확인할 수 없다 |
| `EOFError: stream ends after 0 bytes` 로그 | Docker healthcheck가 TCP 소켓만 열고 닫아서 나는 정상 로그다 |

단어 인식 주소만 코드 기본값이 배포 호스트로 고정돼 있어서 빌드 시점에 주입합니다
(`infra/compose/local/frontend.Dockerfile` 의 `VITE_WORD_AI_WEBSOCKET_URL`). 웹 포트를
8081에서 바꾸면 이 값도 같이 바꿔 다시 빌드해야 합니다. API와 지문자·숫자 주소는
`window.location` 기준 상대값이라 포트를 바꿔도 그대로 따라갑니다.

### 2) 파트별 개별 실행 (개발용)

코드를 고치면서 HMR·디버거를 쓰려면 파트별로 띄웁니다.

```bash
# 프런트엔드 — http://localhost:5173 (postinstall이 MediaPipe 에셋을 자동 배치한다)
cd frontend && npm ci && npm run dev

# 백엔드 — JDK 17과 MySQL이 필요하다. 환경변수는 backend/suhwa/env.sample 참고
#   (DB_*, 그리고 JWT_SECRET은 32바이트 이상이어야 기동한다)
#   bootRun은 Flyway가 켜져 있어 빈 DB라도 V1~V11을 알아서 적용한다(테스트는 다르다 — 아래 참고)
cd backend/suhwa && ./gradlew bootRun

# 지문자 인식 서버 — ws://localhost:8765
cd ai/game-server && pip install -r requirements.txt && python -m app.main

# 숫자 인식 서버 — ws://localhost:8766/number
cd ai/number && pip install -r requirements.txt && python -m server.main

# 단어 인식 서버 — ws://localhost:8767/word
cd ai/word && pip install -r server/requirements.txt && python -m server.main
```

프런트 환경변수는 `frontend/.env.example` 을 복사해 씁니다. 주의할 점:

- **숫자 인식**은 `VITE_AI_WEBSOCKET_URL` 의 경로만 `/number` 로 바꿔 주소를 만듭니다
  (`aiRecognition.ts`). 즉 개발 기본값 `ws://localhost:8765` 에서는 `ws://localhost:8765/number`
  가 되어 지문자 서버로 붙습니다. 숫자·단어 연습까지 함께 확인하려면 프록시가 필요하므로
  위 Docker 스택을 쓰는 편이 낫습니다.
- **단어 인식**은 `VITE_WORD_AI_WEBSOCKET_URL` 을 지정하지 않으면 배포 서버로 붙습니다.
  로컬 서버를 쓸 때는 `ws://localhost:8767/word` 를 넣어 주세요.
- 백엔드를 5173에서 직접 호출하려면 백엔드의 `CORS_ALLOWED_ORIGINS` 에
  `http://localhost:5173` 이 들어 있어야 합니다(`env.sample` 기본값에 포함).

AI 서버 옵션(인식 게이트 임계값, 랜드마크 스무딩, 진단 로그)의 의미는 각 값에 주석으로
붙여 두었습니다. `infra/compose/ai.yml` 과 `ai/game-server/README.md` 를 함께 보세요.

### 테스트

세 파트를 마지막으로 함께 돌린 결과입니다.

| 대상 | 결과 |
| --- | --- |
| 프런트엔드 (Vitest) | 161개 파일 821개 통과 |
| 백엔드 (JUnit) | 66개 클래스 264개 통과 |
| AI 지문자 서버 | 109개 통과 |
| AI 숫자 서버 | 37개 통과 |

#### 프런트엔드

```bash
cd frontend && npm ci && npm test
cd frontend && npx tsc -b        # 타입체크만
```

#### 백엔드

준비물이 두 개 있습니다. **JDK 17**과 **스키마가 적용된 MySQL**입니다.

통합 테스트는 대부분 `@SpringBootTest`이고 `application.yaml`의 datasource를 그대로
씁니다(기본값 `localhost:3306`, `root`, 빈 비밀번호). 그리고 `build.gradle`이 테스트
태스크에서 `spring.flyway.enabled=false`로 마이그레이션을 **끕니다** — 테스트가 개발자
DB에 마이그레이션을 적용해버리는 것을 막기 위한 의도된 설정입니다. 그래서 빈 DB로
돌리면 `Table 'suhwa.game_rooms' doesn't exist`로 60여 개가 무너집니다. 스키마를 미리
넣어 둬야 합니다.

스키마의 단일 원천은 Flyway 마이그레이션입니다.

| 위치 | 내용 |
| --- | --- |
| `backend/suhwa/src/main/resources/db/migration/V*.sql` | **현재 스키마의 원천.** `V1`~`V11`(V3 없음), 전부 적용하면 테이블 9개 |
| `backend/suhwa/scripts/schema.sql` | spec 001 시절의 옛 스냅샷. `game_results`·`test_sessions`가 없고 폐기된 `game_sessions`가 남아 있다. 테스트 DB 준비에 쓰지 말 것 |

> **새 볼륨에 배포할 때 주의.** `infra/compose/backend.yml`은 `/opt/sudal/schema.sql`을
> MySQL 초기화 스크립트로 마운트합니다. 여기에 위의 옛 스냅샷을 넣으면, 애플리케이션의
> `baseline-on-migrate: true` 때문에 Flyway가 이미 스키마가 있다고 보고 `V1`을 건너뛰어
> `game_results`가 만들어지지 않고 `V6`에서 기동이 실패합니다. **빈 DB로 시작해 Flyway가
> `V1`부터 적용하게 두는 편이 안전합니다**(로컬 스택 `infra/compose/local.yml`이 그 방식).

컨테이너로 준비해서 돌리는 전체 절차입니다(3306이 이미 쓰이고 있어도 되도록 33306에
띄웁니다).

```bash
# 1. 테스트용 MySQL
docker run -d --name suhwa-test-mysql -p 127.0.0.1:33306:3306 \
  -e MYSQL_ROOT_PASSWORD=testpw -e MYSQL_DATABASE=suhwa mysql:8.4

# 2. 마이그레이션 적용 (번호 순서를 지킨다)
cd backend/suhwa
for v in 1 2 4 5 6 7 8 9 10 11; do
  docker exec -i suhwa-test-mysql mysql -uroot -ptestpw suhwa \
    < src/main/resources/db/migration/V${v}__*.sql
done

# 3. 실행
DB_HOST=127.0.0.1 DB_PORT=33306 DB_NAME=suhwa DB_USERNAME=root DB_PASSWORD=testpw \
JWT_SECRET=local_only_dummy_jwt_secret_value_change_me_32plus \
  ./gradlew test

# 4. 정리
docker rm -f -v suhwa-test-mysql
```

`FlywayMigrationTest`와 동시성 테스트 4개는 Testcontainers로 자기 DB를 직접 띄우므로
Docker 데몬이 필요합니다(위 절차를 따르면 이미 충족).

환경변수를 매번 넘기는 대신 `backend/suhwa/.env`를 두면 `build.gradle`이 `test`와
`bootRun` 태스크에 자동 주입합니다. `backend/suhwa/env.sample`을 복사해 쓰고, 이 파일은
gitignore 대상이라 저장소에 올라오지 않습니다.

#### AI 서버

requirements를 설치한 환경에서 각 서버 디렉터리에서 실행합니다. 설치 없이 돌리려면
위 Docker 스택의 이미지를 그대로 씁니다.

```bash
docker compose -f infra/compose/local.yml build ai number-ai
docker run --rm -v "$PWD:/repo:ro" -w /repo/ai/game-server --entrypoint python \
  sudal-ai:local -m unittest discover -s tests -t .
docker run --rm -v "$PWD:/repo:ro" -w /repo/ai/number --entrypoint python \
  sudal-number-ai:local -m unittest discover -s tests -t .
```

---

## 문서

| 문서 | 내용 |
| --- | --- |
| [docs/portfolio-game-frontend.md](docs/portfolio-game-frontend.md) | 게임 파트 프론트엔드 상세 — 포트-어댑터 구조, 한글 자모를 물리 강체로 다루는 방법, 인식 파이프라인의 확정 경계, 서버 중계 없는 1:1 대전, 검증하지 않은 것 |
| [ai/game-server/README.md](ai/game-server/README.md) | 지문자 인식 서버 프로토콜과 옵션 |
| [ai/fingerspelling/docs/](ai/fingerspelling/docs/) | 지문자 데이터 계약, 학습 가이드, 파이프라인 구조 |
| [backend/specs/](backend/specs/) | 기능 명세와 OpenAPI 계약 |

문서에는 근거 표기 규칙이 있습니다. 수치에는 근거 파일 경로나 코드 위치를 붙이고,
계측하지 않은 항목은 `미측정`, 코드에서 추론한 것은 `코드 기반 추정`으로 표시합니다.
조건이 다른 결과를 성능 향상처럼 비교하지 않습니다.

---

## 이 저장소에 대해

원본은 SSAFY GitLab에서 개발했고, 이 저장소는 공개용 미러입니다. 아래는 옮기지
않았습니다.

- 실사용자 데이터가 담긴 DB 덤프, 제출용 산출물
- GitLab CI/CD 파이프라인 정의 (GitLab 전용이라 여기서는 동작하지 않음)
- 학습에 쓴 촬영 원본 영상과 중간 체크포인트 (용량, 그리고 촬영 참가자 문제)
- 폐기된 구버전 단어 모델

커밋 1130개와 작성자 6명의 기록은 그대로 보존했습니다.
