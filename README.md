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
  compose/         서비스별 Docker Compose 정의
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
| 지문자 AI | `127.0.0.1:8765` | `/ai-ws/` |
| 숫자 AI | `127.0.0.1:8766` | `/number` |
| 단어 AI | `127.0.0.1:8767` | `/word` |
| MySQL | 외부 미공개 | 백엔드 내부 연결 |
| coturn | host network | `3478`, `5349`, `49160-49200/udp` |

---

## 로컬 실행

```bash
# 프론트엔드 (postinstall이 MediaPipe 에셋을 자동 배치한다)
cd frontend && npm ci && npm run dev

# 백엔드 (MySQL 필요)
cd backend/suhwa && ./gradlew bootRun

# 지문자 인식 서버
cd ai/game-server && pip install -r requirements.txt && python -m app.main

# 숫자 인식 서버
cd ai/number && pip install -r requirements.txt && python -m server.main

# 단어 인식 서버
cd ai/word && pip install -r server/requirements.txt && python -m server.main
```

환경변수는 `.env.example`을 참고하세요. AI 서버 옵션(인식 게이트 임계값, 랜드마크
스무딩, 진단 로그)의 의미는 각 값에 주석으로 붙여 두었습니다.

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
