# Backend Integration Guide

## 2026-07-23 운영 계약 기준

현재 운영 연동의 기준은 상위 문서 `../backend-contract-alignment-2026-07-23.md`이다.

이 문서 아래의 `/api/game-results`, `/game/solo/sessions`, `game-dev-backend` 예시는 과거 독립 프로토타입의 계약이다. 배포 Swagger에는 해당 엔드포인트가 없으므로 production adapter에서 사용하지 않는다.

현재 운영 백엔드는 ticket 기반 Lobby SSE, ticket 기반 순수 Room WebSocket, REST 방 API, WebRTC ICE API, 대전 결과와 랭킹 API를 제공한다. Room WebSocket은 STOMP가 아니며 클라이언트가 보내는 메시지는 `SIGNAL`뿐이다.

솔로 점수 저장과 10초 이탈 패배·랭킹 반영은 현재 배포 계약으로 완료할 수 없다. 백엔드 계약 확정 전에는 어떤 로컬 저장이나 임의의 1/0 결과 전송도 운영 완료로 간주하지 않는다.

## Integration boundary

The physics, rendering, scoring, and recognition domain do not call a Java server. Game persistence is behind `GameResultRepository`, and Python recognition is behind `SignRecognizer`. The prototype page only composes those adapters.

Copy these frontend directories together:

```text
frontend/src/game
frontend/src/recognition
```

The optional prototype composition helpers are in:

```text
frontend/src/integration
```

## Environment-only setup

Copy `frontend/.env.example` to the host application's local environment file and set:

```dotenv
VITE_GAME_API_BASE_URL=https://api.example.com/api
VITE_GAME_API_CREDENTIALS=include
VITE_AI_WEBSOCKET_URL=wss://ai.example.com/sign
```

`VITE_DEV_USER_ID` exists only for the included prototype API. Do not use it as production authentication.

## Authentication injection

Cookie authentication uses `VITE_GAME_API_CREDENTIALS=include`. For bearer authentication, inject a header provider so the current token is read for every request:

```ts
const repository = createGameResultRepository({
  config: runtimeIntegrationConfig,
  storage: window.localStorage,
  getGameApiHeaders: () => ({
    Authorization: `Bearer ${authStore.getAccessToken()}`,
  }),
});

<SoloGamePage resultRepositoryFactory={() => repository} />
```

Keep the factory passed to `SoloGamePage` stable. A changing `signRecognizerFactory` reconnects the WebSocket because React treats it as a changed dependency.

If the team's response DTO or endpoint paths differ, implement `GameResultRepository` instead of changing `GameRuntime`.

## HTTP contract

All endpoints act on the authenticated user. Production controllers must obtain the user identifier from the authenticated principal, not from the request body or `X-User-Id`.

```text
POST /api/game-results
GET  /api/game-results/me
GET  /api/game-results/me/best
GET  /api/sign-statistics/me
```

Request body for `POST /api/game-results`:

```json
{
  "mode": "PYTHON_AI",
  "score": 1200,
  "maxCombo": 8,
  "removedCount": 12,
  "durationSeconds": 95,
  "playedAt": "2026-07-14T07:30:00.000Z",
  "symbolStatistics": [
    {
      "symbol": "ㄱ",
      "targetCount": 4,
      "confirmedCount": 3,
      "correctCount": 2,
      "incorrectCount": 1,
      "averageConfidence": 0.91
    }
  ]
}
```

The `201` response is the same structure plus a string `id`. History returns an array, best returns one result or `404`, and sign statistics returns the aggregated `symbolStatistics` array.

The payload intentionally excludes video, images, and landmark sequences.

## Java code reuse

`game-dev-backend/dev-app` is a contract reference organized into `controller`, `application`, `domain`, `repository`, and `dto`. A team backend can copy the DTO and service contract, then replace `InMemoryGameResultRepository` with its JPA repository and entity mapping.

Important compatibility notes:

* The sample uses Spring Boot 2.7 and `javax.validation`. Spring Boot 3 projects must change imports to `jakarta.validation`.
* The sample `X-User-Id` fallback is development-only. Replace it with Spring Security's authenticated principal.
* The in-memory repository loses all data on restart and is not suitable for shared deployment.
* Configure CORS with the exact frontend origin. Cookie authentication also requires credentials on both client and server; do not combine credentials with wildcard origins.
* Return UTF-8 JSON so Korean symbols are preserved without conversion.
* Keep `playedAt` as an ISO-8601 instant and `averageConfidence` as a JSON number between 0 and 1.
* Use database transactions or an idempotency policy if duplicate result submissions must be prevented. The current client may retry only when host code adds retry behavior.

## Python AI WebSocket

The Java result API and Python AI server are separate adapters. The WebSocket must preserve the existing `GET_CAPABILITIES`, `LANDMARK_FRAME`, `HAND_NOT_DETECTED`, and release/confirmation protocol. If Java proxies this socket, configure `VITE_AI_WEBSOCKET_URL` to that proxy without changing recognition core code.

Use `wss://` when the frontend is served over HTTPS. Browsers block insecure `ws://` connections from a secure page.

## Failure behavior

`ResilientGameResultRepository` keeps gameplay available when HTTP persistence fails and stores the result in local storage. It does not currently synchronize local fallback records to the server later. Add an explicit synchronization policy before relying on offline records across devices.

## Solo score persistence (current deployment)

The backend currently does not publish an authorized POST /game/solo/sessions contract. The frontend therefore keeps the solo game playable and stores completed solo scores in browser local storage by default. Set VITE_ENABLE_REMOTE_SOLO_GAME_API=true only after the backend publishes and accepts the start/complete solo-session endpoints; otherwise it will reproduce the 401 seen in production.

---

## 2026-07-27 — Production solo game start returned HTTP 401

### Symptom

On `https://sudal-play.vercel.app/game/solo`, pressing **게임 시작** displayed `Solo game API returned 401.` and did not start the game.

### Investigation

- The production bundle uses `https://i15a405.p.ssafy.io/api` for both auth and game REST calls.
- The failing request is `POST /api/game/solo/sessions`.
- The route reaches the backend and returns `401`; it is not a Vercel deployment, CORS, or WebSocket failure.
- The current backend/Swagger integration does not publish the legacy solo-session start/complete contract used by this frontend. The authenticated room and result contracts must not be inferred to include it.

### Resolution

- Do not block solo gameplay on the unsupported remote session endpoint.
- `LocalSoloGameApi` now creates the session and stores the completed aggregate score in browser local storage, scoped by user ID.
- No camera frames, landmarks, or images are saved.
- Remote solo persistence remains opt-in through `VITE_ENABLE_REMOTE_SOLO_GAME_API=true`, and must only be enabled after the backend formally provides and authorizes the start/complete session contract.

### Verification

- Local unit test for session creation and persisted score: passed.
- TypeScript/Vite production build: passed.
- GitLab pipeline `#157088` and its Vercel production deploy: passed.
- Production browser retest: **게임 시작** changes the game to running state and no alert is rendered.

### Backend follow-up

If cross-device solo score history or a server-side solo ranking is required, backend needs to publish the request/response DTO and authorization policy for a solo score endpoint. Until then, local browser storage is the only supported persistence path.

