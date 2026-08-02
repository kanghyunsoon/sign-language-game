# Matter Physics Adapter

`MatterPhysicsWorld` implements the `PhysicsWorld` interface in `src/game/physics`. It is advanced only by the caller's `update(deltaMs)` call; it does not create a `requestAnimationFrame` loop.

## Current collider phase

All 41 symbols retain their `symbol` metadata and use the same rectangular temporary collider. This is intentional for stable early physics validation. No font outlines, PixiJS, or symbol-specific compound bodies are used yet.

The adapter creates static left, right, and floor boundaries, plus dynamic letter bodies with gravity, friction, air friction, restitution, and density from `PhysicsConfig`.

## Settlement

`SettlementDetector` requires both linear speed and angular speed to remain below configured thresholds for `settleDurationMs`. Any movement above either threshold resets the timer and emits `LETTER_MOVED` if a previously settled body moves again.

## Manual verification

Run the Matter tests without a browser:

```powershell
cd C:\Users\SSAFY\Desktop\Sign_Language_Translation\frontend
npx vitest run src/game/physics/SettlementDetector.test.ts src/game/physics/MatterPhysicsWorld.test.ts
```

For a future rendering runtime, drive `update(1000 / 60)` externally, read `getLetterStates()`, render positions and rotation, call `removeLetter(id)`, and pass returned `LETTER_SETTLED` events to the game domain.

## Idle-board scheduling — 2026-08-02

The runtime, not `MatterPhysicsWorld`, owns adaptive scheduling. While a body is falling or a renderer effect is active, it advances at the normal gameplay cadence. Once every body is settled and no effect is active, the battle runtime limits full physics/state/render traversal to a 100ms interval. Spawning, removing, restoring a falling snapshot, or starting an effect immediately returns the board to the active cadence.

Do not add a second internal timer to `MatterPhysicsWorld`; doing so would duplicate loops and make pause, reconnect, and disposal cleanup unreliable.
