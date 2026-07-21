# PixiJS Renderer Unit

## Scope

This unit adds only the PixiJS rendering adapter. It does not calculate removal targets, scores, input validity, WebSocket messages, or a game loop.

## Responsibilities

- `GameRenderer` accepts `PhysicsLetterState` snapshots and exposes resize, draw, highlight, effect update, clear, and disposal operations.
- `PixiGameRenderer` draws a simple text-based letter view, mirrors Matter position and rotation, and draws the configured danger line.
- `LetterViewFactory` creates and destroys isolated Pixi display objects for a symbol.
- `RemovalEffect` enforces a 100-200ms highlight duration. When it completes, the renderer returns `REMOVAL_EFFECT_FINISHED`; a future runtime decides when to transition game state and remove the Matter body.
- `GameCanvas` mounts the Pixi canvas, observes its size, and disposes the renderer. It does not start a physics or rendering loop and does not hold per-frame React state.

## Manual verification

1. Create a future runtime that mounts `GameCanvas` in an element with a non-zero width and height.
2. In `onRendererReady`, call `renderer.render` with a `PhysicsLetterState` and verify that a symbol appears at the same x/y position and angle as the Matter body.
3. Resize the canvas container and verify that the Pixi canvas and danger line resize without creating another canvas.
4. Call `renderer.highlightRemoval(id)`, then call `renderer.updateEffects(deltaMs)` from the runtime loop. Verify that the selected letter gets a yellow outline, enlarges slightly, fades over 150ms, and produces one `REMOVAL_EFFECT_FINISHED` event.
5. Remove the corresponding Matter body and omit its state from the next `render` call. Verify that its Pixi view is removed and that the remaining letters continue to render.
6. Unmount `GameCanvas` and verify that its canvas is removed and no further renderer calls occur.

## Limitations

- No `GameRuntime` exists in this unit, so physical simulation and visual updates are not automatically driven.
- Actual Pixi canvas rendering requires a browser with WebGL support; Node Vitest only covers the deterministic removal-effect timing.
