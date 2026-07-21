# Game and Recognition Module Extraction Report

## Scope and result

The reusable units are `frontend/src/game` and `frontend/src/recognition`. They can be copied together under another React application's `src` directory without importing this prototype's pages, app shell, routing, login state, Spring DTOs, Axios instances, environment variables, global stores, or project CSS files.

The only former prohibited dependency was the default `ws://localhost:8765` inside `PythonWebSocketSignRecognizer`. Its constructor now requires an injected URL. The prototype composition layer resolves deploy-time URLs from `src/integration/runtimeConfig.ts`; a host application can supply its own URL or adapter factory.

The game and recognition folders intentionally reference each other only through relative module code: recognition uses the game symbol registry, and game result persistence uses recognition learning-statistic types. Copy both folders together.

## Required packages

```powershell
npm install react react-dom matter-js pixi.js @mediapipe/tasks-vision lucide-react
npm install --save-dev typescript@7.0.2 @types/matter-js vitest
```

The verified baseline is React 19, TypeScript 7.0.2, Matter.js 0.20, PixiJS 8.19, MediaPipe Tasks Vision 0.10.35, and Lucide React 1.24.

## Copy and initialize

Copy both folders together.

```powershell
Copy-Item -Recurse path\to\frontend\src\game .\src\game
Copy-Item -Recurse path\to\frontend\src\recognition .\src\recognition
```

The public entry points are `./game` and `./recognition`.

```ts
import {
  DEFAULT_PHYSICS_CONFIG,
  GameController,
  GAME_SYMBOLS,
  MatterPhysicsWorld,
  type GameRenderer,
} from "./game";
import {
  PythonWebSocketSignRecognizer,
  type LandmarkFrame,
} from "./recognition";

declare const runtimeConfig: { readonly aiWebSocketUrl: string };

const recognizer = new PythonWebSocketSignRecognizer({
  url: runtimeConfig.aiWebSocketUrl,
});

await recognizer.connect();
recognizer.subscribe((event) => {
  if (event.type === "PREDICTION") console.log(event.symbol, event.confidence);
});

function sendLandmarks(frame: LandmarkFrame): void {
  recognizer.sendLandmarkFrame(frame);
}

// GameController is the public alias of GameRuntime. The host owns its renderer
// and visible board dimensions.
declare const renderer: GameRenderer;
const gameController = new GameController({
  renderer,
  symbols: GAME_SYMBOLS,
  physics: () => new MatterPhysicsWorld({
    ...DEFAULT_PHYSICS_CONFIG,
    width: 720,
    height: 960,
    letterWidth: 64,
    letterHeight: 64,
  }),
});
gameController.start();
void sendLandmarks;
```

Use `GameRenderer`, `PhysicsWorld`, `GameConfig`, `GameSnapshot`, and `GameEvent` from `./game` for host-side adapters. Use `SignRecognizer`, `SignRecognitionEvent`, `LandmarkFrame`, and `RecognitionCapabilities` from `./recognition` for recognition adapters.

## Cleanup and input modes

Call `gameController.dispose()` when the host game view unmounts. Call `recognizer.disconnect()` when the recognition view unmounts. `GameCanvas` destroys its Pixi renderer on unmount, and `HandCamera` stops MediaStream tracks and closes MediaPipe on unmount.

The Python server is started separately from `game-ai-dev-server`; the browser receives only `LandmarkFrame` data and must not send video or images. The injected URL allows the host to target another local address or a proxied endpoint without changing module code.

For development keyboard input, use the adapter rather than direct WebSocket events.

```ts
import { KeyboardSignRecognizer } from "./recognition";

const keyboard = new KeyboardSignRecognizer({ supportedSymbols: ["ㄱ", "ㄴ"] });
await keyboard.connect();
keyboard.confirmSymbol("ㄱ");
keyboard.releaseHand();
```

`CAPABILITIES.supportedSymbols` is the AI model authority. Intersect it with `GAME_SYMBOLS` before choosing AI-mode targets. Keyboard mode may use all `GAME_SYMBOLS`, including symbols the current model does not support.

## Known limitations

* `HandCamera` and `GameCanvas` provide React components but intentionally import no CSS; the host must provide styles for their class names.
* MediaPipe browser assets are currently expected at `/mediapipe/wasm` and `/mediapipe/hand_landmarker.task`. Copy or serve those public assets in the host application.
* `GameCanvas` requires a host container with non-zero dimensions. Physics and renderer lifecycle wiring remain host-owned through `GameRuntime` options.
* `PythonWebSocketSignRecognizer` requires browser WebSocket support and a separately running Python server. It does not reconnect automatically.
* `ResilientGameResultRepository` falls back to local storage but does not automatically synchronize fallback records later.
* Static template feedback is only available for real captured templates. `CLASSIFICATION_ONLY` templates intentionally suppress bone-level feedback.

Backend URL, authentication, CORS, DTO, and Spring version integration details are documented in `frontend/src/game/docs/reference/backend-integration-guide.md`.

## Verification

Created an empty Vite React TypeScript project, copied only `src/game` and `src/recognition`, installed the listed packages, and imported every required public API from both index files. `npm run build` passed again after the backend adapter and Pixi removal-effect changes.

The temporary validation directory was removed after the successful build.
