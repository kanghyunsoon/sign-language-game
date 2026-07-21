# Backend Integration Guide

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
