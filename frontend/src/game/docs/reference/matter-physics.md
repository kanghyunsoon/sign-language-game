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
