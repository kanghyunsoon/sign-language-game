# Vercel 프런트 배포 가이드 — 2026-07-24

이 가이드는 저장소의 `frontend` Vite SPA를 Vercel에 배포하는 절차다. Spring 백엔드, TURN, Python AI WebSocket은 Vercel 정적 프런트 프로젝트에 포함하지 않는다.

## 배포 전 판정

현재 코드는 production build가 통과하지만 실제 서비스 배포 전 아래 작업이 필요하다.

- `LoginPage`를 실제 인증 API에 연결한다.
- 개발용 `StandaloneGameHarness` 대신 로그인 사용자와 access token을 `GameModule`에 전달한다.
- 운영 백엔드·AI WSS URL과 WebSocket Origin 정책을 확정한다.

위 작업 전 Vercel 배포는 UI·정적 자산·라우팅 Preview 용도로만 사용한다. 실제 사용자 1:1 서비스가 준비됐다고 판정하면 안 된다.

## 권장 배포 구조

```text
Browser
 ├─ HTTPS ──> Vercel: React/Vite 정적 파일
 ├─ HTTPS/SSE ──> Spring API
 ├─ WSS ──> Spring Room signaling
 ├─ WSS ──> Python AI inference
 └─ WebRTC ──> 상대 브라우저, 실패 시 TURN relay
```

Vercel은 프런트 배포와 Preview URL을 담당한다. 게임 상태와 signaling을 Vercel Function에 새로 구현하지 않는다. 현재 백엔드와 AI 서비스를 그대로 사용한다.

## Vercel 프로젝트 설정

GitLab 저장소를 Import한 뒤 다음 값을 설정한다.

| 설정 | 값 |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | 22.x |
| Production Branch | 팀 GitLab workflow의 실제 production branch |

Vite 8은 Node.js 20.19+ 또는 22.12+가 필요하므로 22.x를 권장한다. Root Directory를 `frontend`로 지정하면 `package.json`, lockfile, `postinstall`, Vite 설정을 그 디렉터리 기준으로 사용한다.

GitLab 자동 연동은 push마다 Preview Deployment를 만들 수 있다. 저장소가 GitLab group의 private repository이고 Vercel Hobby 권한 제약에 걸리거나 SSAFY GitLab 연동이 허용되지 않으면 아래 CLI/CI 방식을 사용한다.

## SPA deep link 설정

React Router의 `/game/turn-battle/:roomId/play` 같은 URL을 직접 열거나 새로고침하면 `index.html`로 돌아와야 한다. `frontend/vercel.json`을 만들 때 API rewrite를 SPA fallback보다 먼저 둔다.

현재 백엔드가 `https://i15a405.p.ssafy.io/api`에서 제공된다는 가정의 예시는 다음과 같다.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://i15a405.p.ssafy.io/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

주의:

- 실제 backend origin이 확정된 뒤 예시 URL을 바꾼다.
- `/api` 응답을 CDN cache하지 않는다. 방 목록, ticket, ICE credential, 결과는 사용자별·일회성 데이터다.
- 외부 rewrite를 통한 SSE가 buffering 없이 유지되는지 Preview에서 확인한다.
- WebSocket은 `/api` rewrite에 의존하지 말고 `VITE_GAME_WEBSOCKET_URL`로 실제 `wss://` endpoint에 직접 연결한다.
- API를 직접 cross-origin 호출하는 구조를 선택하면 백엔드 CORS, credential, cookie의 `SameSite`/`Secure` 설정을 함께 바꿔야 한다.

## 환경변수

Vite의 `VITE_*` 값은 build 결과에 포함되어 브라우저에 공개된다. access token, 비밀번호, Vercel token, TURN 장기 비밀키를 넣지 않는다.

권장 Production 값:

```dotenv
VITE_GAME_ROOM_API_BASE_URL=/api
VITE_GAME_WEBSOCKET_URL=wss://i15a405.p.ssafy.io/api/ws/game-rooms
VITE_AI_WEBSOCKET_URL=wss://<ai-production-host>/<ai-path>
```

설정하지 말아야 할 값:

```dotenv
VITE_P2P_E2E=true
VITE_DEV_USER_ID=...
VITE_LINE_RACE_DEV_TOOLS=true
VITE_MATCH_COMMAND_DESTINATION=...
VITE_MATCH_PLAYER_DESTINATION=...
VITE_MATCH_BROADCAST_DESTINATION=...
```

마지막 세 값은 폐기된 STOMP 경로의 레거시 예시다. 운영 배포에 사용하지 않는다.

환경별 원칙:

- Preview: staging API/WSS/AI, 테스트 계정, 고정 staging origin
- Production: production API/WSS/AI, 실제 domain
- 환경변수 변경 후에는 기존 deployment에 적용되지 않으므로 새 deployment를 생성한다.
- 동적 Preview URL 전체를 백엔드 Origin allowlist에 열기보다 고정 staging domain 연결을 권장한다.

## Dashboard 배포 절차

1. Vercel에서 New Project를 선택한다.
2. GitLab 저장소 `S15P11A405`를 Import한다.
3. Root Directory를 `frontend`로 지정한다.
4. Vite, `npm ci`, `npm run build`, `dist`, Node.js 22.x를 확인한다.
5. Preview 환경변수를 먼저 입력한다.
6. Preview Deployment를 생성한다.
7. 아래 Preview smoke test를 통과한 뒤 Production 환경변수를 별도로 입력한다.
8. 팀 workflow의 production branch를 Vercel Production Branch로 연결한다.
9. production branch merge 또는 승인된 Preview promotion으로 배포한다.

Vercel GitLab integration이 저장소를 표시하지 않으면 GitLab project/group의 Maintainer 권한과 Vercel team 권한을 확인한다.

## CLI 배포 절차

Vercel Git 연동을 사용할 수 없을 때 저장소 루트에서 실행한다.

```powershell
npm install --global vercel
vercel login
vercel link --repo
vercel pull
vercel build
vercel deploy --prebuilt
```

Production 배포:

```powershell
vercel pull --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

CI에서는 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 GitLab masked/protected variable로 저장한다. 이 값들은 `VITE_*`로 만들거나 저장소에 커밋하지 않는다.

## Preview smoke test

### 정적 호스팅

- `/`, `/login`, `/main`, `/game`, 깊은 게임 URL을 직접 열고 새로고침한다.
- JS, CSS, 이미지, MediaPipe WASM/worker가 200으로 로드된다.
- 브라우저 콘솔에 mixed content와 MIME 오류가 없다.

### 인증과 API

- 실제 staging 계정으로 로그인하고 새로고침해도 사용자와 토큰이 유지된다.
- `/api/auth/sse-ticket` 요청에는 Bearer가 있고, EventSource URL에는 ticket query가 있다.
- ticket과 access token이 URL 로그나 오류 수집 도구에 노출되지 않는다.

### 카메라·AI

- HTTPS top-level 문서에서 카메라 권한을 허용하고 로컬 영상이 나온다.
- AI endpoint가 반드시 `wss://`이며 실제 손 인식 확정이 발생한다.
- 카메라 거부와 AI 연결 실패가 서로 다른 오류로 표시된다.

### P2P

- 서로 다른 두 계정과 가능하면 서로 다른 네트워크를 사용한다.
- Room signaling WSS가 연결되고 `game-v1` DataChannel이 열린다.
- `chrome://webrtc-internals`에서 host/srflx/relay candidate를 확인한다.
- 직접 연결이 막힌 환경에서 TURN `relay` candidate로 경기가 진행된다.
- 블럭쌓기와 턴 배틀을 결과·재대결까지 각각 완료한다.

## 주요 유의사항

### 카메라

브라우저 카메라는 secure context에서만 동작한다. Vercel Preview/Production의 HTTPS 페이지를 top-level로 열어 권한을 테스트한다. iframe으로 검증한다면 별도 Permissions Policy가 필요하다.

### WebSocket과 mixed content

HTTPS 페이지에서 `ws://`는 차단된다. Room signaling과 AI는 모두 `wss://`를 사용한다. Vercel 배포 성공은 외부 WSS 연결 성공을 보장하지 않으므로 reverse proxy의 Upgrade 헤더와 Origin 정책을 별도로 확인한다.

### SSE

브라우저 기본 `EventSource`에는 Authorization 헤더를 직접 넣지 않는다. Bearer 인증은 ticket 발급 요청에 사용하고 SSE 연결은 일회용 ticket query를 사용한다. 재연결 시 소비됐거나 만료된 ticket을 재사용하지 않는다.

### TURN

TURN 장기 credential을 프런트 환경변수에 넣지 않는다. 브라우저는 인증된 `/webrtc/ice-servers` 응답으로 단기 credential을 받는다. `stun:` candidate만 보인다고 TURN 검증이 끝난 것이 아니다.

### Preview origin

Vercel Preview URL은 branch/commit마다 달라질 수 있다. 백엔드 CORS와 WebSocket Origin을 `*`로 푸는 대신 고정 staging domain 또는 제한된 정책을 사용한다. credential 요청에서 `Access-Control-Allow-Origin: *`와 `credentials: include`는 함께 사용할 수 없다.

### rollback

- 배포 직전 정상 Production deployment URL과 commit SHA를 기록한다.
- 장애 시 Vercel에서 직전 deployment를 promote하거나 문제 commit을 revert한다.
- 프런트 rollback만으로 백엔드 계약 변경이 되돌아가지는 않으므로 API 호환성도 함께 확인한다.

## 배포 후 완료 기록

다음을 Jira와 트러블슈팅 문서에 남긴다.

- Vercel Preview/Production URL과 commit SHA
- 사용한 API/WSS/AI host
- 브라우저와 OS
- 두 게임의 방 ID, match ID, 승패, 재대결 결과
- TURN relay 사용 여부
- 실패 로그와 rollback 여부

## 공식 참고 자료

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel monorepo Root Directory](https://vercel.com/docs/monorepos)
- [Vercel rewrites](https://vercel.com/docs/routing/rewrites)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel GitLab integration](https://vercel.com/docs/git/vercel-for-gitlab)
- [Vercel Git deployment environments](https://vercel.com/docs/git)
- [Vercel CLI build](https://vercel.com/docs/cli/build)
- [Vite Node.js requirements](https://vite.dev/guide/)
- [MDN getUserMedia secure context](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
