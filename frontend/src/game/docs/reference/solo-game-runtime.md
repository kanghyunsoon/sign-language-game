# Solo Keyboard Game Unit

## Scope

`GameRuntime` composes the existing `RemovalSystem`, `PhysicsWorld`, and `GameRenderer` for keyboard-only play. It does not import, connect to, or depend on AI recognition or WebSocket code.

## Runtime responsibilities

- Runs the requestAnimationFrame loop only while the game is running.
- Spawns one of the supplied symbols at a fixed interval.
- Relays Matter settlement/movement events to the game core.
- Uses the core's settled-first, oldest-first selection and input lock.
- Starts the renderer highlight, waits for `REMOVAL_EFFECT_FINISHED`, then removes the Matter body and records score/combo.
- Ends the run when a settled body reaches the configured danger line.
- Publishes only state transitions for the React HUD; positions remain in Matter/Pixi.

## Keyboard input

The page accepts a `KeyboardEvent.key` only when it is one of the 41 symbols. Because a physical keyboard layout cannot provide all Korean jamo with a single unambiguous shortcut, the development panel provides all consonants, vowels, and digits. Button clicks release the input immediately; keyboard input releases on keyup.

## Limitations

- The board world is created at initial canvas size. Resizing the board after starting a run resizes Pixi but does not rebuild Matter boundaries; restart after a major viewport resize.
- AI input and webcam behavior remain intentionally disconnected from the game.
