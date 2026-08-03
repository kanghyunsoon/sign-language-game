# 수어의 달인 배포·연동 가이드

마지막 정리: 2026-08-03

이전에는 `post-vercel-deployment-steps.md`와 `signmaster-deployment-integration-guide.md` 두 문서가 같은 내용을 각자 서술하면서 Vercel 빌드 설정이 서로 달랐다. 이 문서가 배포·연동의 유일한 기준이다.

## 1. 범위

Vercel에 React/Vite 정적 프런트만 배포하고 API, SSE, WebSocket, TURN은 운영 백엔드·인프라에 직접 연결한다. Vercel은 API·SSE·WebSocket·TURN을 호스팅하지 않으며 `/api` reverse proxy도 없다.

| 항목 | 값 |
| --- | --- |
| 서비스 표시명 | 수어의 달인 |
| Vercel 프로젝트 | `sudal-play` |
| 운영 도메인 | `https://sudal-play.vercel.app` |
| 프런트 기준 브랜치 | `frontend` |
| 백엔드 기준 브랜치 | `backend` (소스 변경은 백엔드 담당) |
| AI 기준 브랜치 | `feature/khs-ai-fingerspelling-server` |

## 2. Vercel 빌드 구성

루트의 `package.json`과 `vercel.json`은 monorepo에서 `frontend` 하위 Vite 앱을 빌드하기 위한 배포 어댑터다. Root Directory를 `frontend`로 지정하고 그 안에서 `npm ci`를 실행하는 방식은 사용하지 않는다.

| 항목 | 값 |
| --- | --- |
| Node.js | `22.x` |
| 설치·빌드 | `npm --prefix frontend ci && npm --prefix frontend run build` |
| 산출물 | `frontend/dist` |
| SPA fallback | 모든 프런트 경로를 `index.html`로 rewrite |

`game-contracts/recognition/readiness.json`은 프런트 빌드가 직접 import하므로 Vercel 소스에 반드시 포함한다. `frontend` 폴더만 단독 업로드하면 TypeScript 모듈 해석이 실패한다.

`vercel.json`의 rewrite가 게임 딥링크를 포함한 모든 SPA 요청을 `index.html`로 돌린다. API와 WebSocket은 Vercel Function이나 rewrite에 의존하지 않는다.

## 3. 환경변수

`VITE_*` 값은 브라우저 번들에 그대로 포함된다. JWT, TURN 비밀번호, Vercel token, DB 비밀번호는 넣지 않는다.

```dotenv
VITE_API_BASE_URL=https://i15a405.p.ssafy.io/api
VITE_GAME_ROOM_API_BASE_URL=https://i15a405.p.ssafy.io/api
VITE_GAME_WEBSOCKET_URL=wss://i15a405.p.ssafy.io/api/ws/game-rooms
```

2026-07-26 기준 위 세 값은 `sudal-play`의 **Production** 환경변수로 등록하고 재배포했다. Preview로 실연동을 검증할 때도 같은 값을 Preview 환경에 추가하고 다시 배포한다.

저장소의 `.env.production` 기본값은 동일 origin Nginx 배포용 `/api`다. Vercel에는 `/api` proxy가 없으므로 위 값을 반드시 환경변수로 등록해야 한다. 등록하지 않으면 로그인·회원가입 요청이 `https://sudal-play.vercel.app/api/auth/*`로 가서 404가 난다.

운영에 넣지 않는 값: `VITE_AI_WEBSOCKET_URL`(AI 주소 확정 전), STOMP 계열 `VITE_MATCH_*`, 개발용 `VITE_DEV_USER_ID`, `VITE_P2P_E2E`, `VITE_LINE_RACE_DEV_TOOLS`, `VITE_ENABLE_REMOTE_SOLO_GAME_API`.

## 4. 백엔드에 요청할 작업

확정된 Vercel Production URL과 Preview URL을 CORS 허용 목록에 등록한다. Origin 비교는 scheme·host·port가 정확히 일치해야 하므로 끝의 `/`를 포함하지 않고 `*`도 사용하지 않는다.

```text
PROD_CORS_ALLOWED_ORIGINS=https://sudal-play.vercel.app,https://<preview-vercel-domain>
```

전달할 인계 내용:

```text
프런트 운영 Origin: https://sudal-play.vercel.app
요청: GitLab CI/CD 변수 PROD_CORS_ALLOWED_ORIGINS에 위 Origin을 추가한 뒤 백엔드 운영 배포
주의: URL 끝의 /는 넣지 않음. REST CORS와 게임 WebSocket Origin 정책 모두 동일 값 사용
```

2026-07-26 확인 결과 `PROD_CORS_ALLOWED_ORIGINS` 변수는 `All (default)` 범위로 존재한다. 값이 Masked라 프런트에서는 포함 여부를 열람할 수 없다. 백엔드·인프라 담당자가 값을 확인하고 운영 배포 완료 사실을 공유해야 한다.

허용 목록은 다음 전체에 공통 적용된다.

1. 인증 및 일반 REST API
2. SSE 구독 (`/auth/sse-ticket` 발급 후 `/game-rooms/subscribe`)
3. 게임방 WebSocket signaling (`/ws/game-rooms/{roomId}?ticket=...`)
4. ICE 서버 정보 조회와 WebRTC 연결
5. 경기 종료 결과 전송 (호스트 승리 `1:0`, 도전자 승리 `0:1`)

realtime ticket은 연결마다 새로 발급하고 재연결 시 재사용하지 않는다. STOMP는 사용하지 않는다.

## 5. 인프라에 요청할 작업

| 대상 | 필수 조건 |
| --- | --- |
| Nginx API proxy | `/api/`가 백엔드(`127.0.0.1:8080`)로 전달되고 CORS preflight를 막지 않음 |
| SSE | 버퍼링 비활성화, 장시간 timeout, `X-Accel-Buffering: no` 유지 |
| WebSocket | `wss://i15a405.p.ssafy.io/api/ws/game-rooms/{roomId}`의 `Upgrade`·`Connection` 헤더와 충분한 read timeout |
| coturn | TCP/UDP 3478, TCP/UDP 5349, UDP 49160-49200 및 public IP 후보 |
| TLS | REST는 HTTPS, signaling은 WSS, mixed content 없음 |

`feature/Infra-507-nginx-https`의 nginx 설정이 실제 서버에 적용됐는지 확인한다. 서로 다른 네트워크의 두 브라우저에서 host–challenger 1:1을 열고, direct candidate 실패 시 TURN relay candidate로도 영상·DataChannel이 이어지는지 확인한다.

## 6. AI 서버 연결 순서

AI는 모델 검증 완료 후 별도 WSS 서비스로 배포한다. 프런트는 AI 주소가 없을 때도 카메라·게임 화면이 동작해야 하며, AI 손 인식은 프런트 배포의 완료 조건이 아니다.

1. AI 브랜치에서 모델, 클래스 목록, 입력 feature 계약, 모델 버전을 확정한다.
2. 공개 WSS 주소와 TLS 인증서를 준비한다.
3. Origin 정책에 Vercel Production/Preview 도메인을 허용한다.
4. Preview에 `VITE_AI_WEBSOCKET_URL=wss://<ai-domain>/<path>`를 먼저 등록한다.
5. 자모↔자모 혼동쌍, 카메라 권한 거부, 서버 끊김·재연결을 검증한다.
6. 통과한 모델 버전과 endpoint를 Production에 승격한다.

`/ai/` reverse proxy로 제공할지 별도 서브도메인으로 제공할지는 인프라·AI 담당이 TLS, WebSocket timeout, 확장 방식을 기준으로 결정한다.

모델 버전과 경쟁 사용 가능 글자는 `game-contracts/recognition/readiness.json`이 원천이다. AI 배포 시 이 파일을 함께 갱신한다.

## 7. 운영 전 최종 검증

1. Vercel URL에서 `/`, `/login`, `/game`, 깊은 게임 URL을 직접 열고 새로고침한다.
2. 서로 다른 두 계정·브라우저로 로그인한다.
3. REST 방 생성·입장, SSE 로비 갱신, WSS signaling을 확인한다.
4. 서로 다른 네트워크에서 WebRTC 영상, DataChannel, TURN relay candidate를 확인한다.
5. 블럭쌓기와 턴 배틀을 host/challenger를 바꿔가며 결과 저장(`1:0` 또는 `0:1`)과 재대결까지 완료한다.
6. 양쪽의 캐릭터·체력바·사용자 ID·영상 표시와 승패 스코어 방향을 확인한다.
7. AI WSS 배포 뒤 카메라 권한, 손 인식, AI 연결 실패 UX, 재연결을 별도 회귀 검증한다.

## 8. 알려진 제약

### 솔로 점수 저장

백엔드는 인가된 `POST /game/solo/sessions` 계약을 제공하지 않는다. 프런트는 솔로 플레이를 계속 가능하게 두고 완료 점수만 사용자 ID 범위의 브라우저 local storage에 저장한다. 카메라 프레임·랜드마크·이미지는 저장하지 않는다.

`VITE_ENABLE_REMOTE_SOLO_GAME_API`는 백엔드가 start/complete 계약을 공식 제공하고 인가할 때까지 설정하지 않는다. 켜면 운영에서 확인된 401이 재현된다. 자세한 경위는 `../src/game/docs/game-troubleshooting.md`의 「결과 저장 계약」 절에 있다.

### 방 표시 메타데이터

배포 Swagger의 방 생성 응답과 로비 SSE는 제목·방장 닉네임·난이도·출제 범위를 보장하지 않는다. 현재 브라우저에서 생성한 방은 gateway가 보완하지만 다른 사용자에게 전파되는 값이 아니다. 다른 사용자의 로비까지 같은 값을 보장하려면 create/response/SSE 계약에 `title`, `hostNickname`, `difficulty`, `symbolRange`, `createdAt` 영속화가 필요하다.

## 9. 운영 기록 규칙

배포마다 Vercel URL, Git commit SHA, API·AI 모델 버전, 테스트 계정 역할, 방 ID, 결과·재대결 여부, TURN relay 사용 여부, 실패 로그와 rollback 여부를 Jira와 `../src/game/docs/game-troubleshooting.md`에 남긴다.

### 기록된 배포

| 날짜 | 내용 |
| --- | --- |
| 2026-07-26 | `sudal-play` Production 환경변수 3건 등록 후 재배포. `PROD_CORS_ALLOWED_ORIGINS` 존재 확인(값 Masked) |
| 2026-07-27 | 솔로 시작 401을 백엔드 계약 미지원으로 확인하고 로컬 저장으로 전환. 파이프라인 `#157088`이 커밋 `4b10374`을 배포하고 운영 재검증 통과 |
