# Solo Game Results API

`game-dev-backend/dev-app` is a Java 11-compatible Spring Boot 2.7 module. It is intentionally a separate prototype module because this repository has no existing Spring Boot application or authentication integration.

## Contract

`POST /api/game-results` saves a completed solo run. The request deliberately has no `userId`; the API derives the user from `X-User-Id` only as a development placeholder. A host application with authentication must replace that header source with its authenticated security principal.

`GET /api/game-results/me` returns the current user's runs, newest first. `GET /api/game-results/me/best` returns the highest-score run or `404`. `GET /api/sign-statistics/me` aggregates statistics by symbol, weighting average confidence by `confirmedCount`.

```json
{
  "mode": "PYTHON_AI",
  "score": 120,
  "maxCombo": 3,
  "removedCount": 4,
  "durationSeconds": 90,
  "playedAt": "2026-07-14T12:00:00Z",
  "symbolStatistics": [{
    "symbol": "ㄱ",
    "targetCount": 3,
    "confirmedCount": 2,
    "correctCount": 1,
    "incorrectCount": 1,
    "averageConfidence": 0.83
  }]
}
```

The contract stores no camera video, image, or landmark sequence. The current repository is in-memory for contract validation only; restarting the Java process clears it.

## Frontend adapters

`GameResultRepository` is independent of `GameCore`. `HttpGameResultRepository` uses the browser Fetch API, while `LocalGameResultRepository` persists only the same aggregate result schema in browser storage. `ResilientGameResultRepository` falls back to local storage when the HTTP API cannot be reached, so a solo game remains playable without this backend.

## Run

```powershell
cd game-dev-backend\dev-app
mvn test
mvn spring-boot:run
```
