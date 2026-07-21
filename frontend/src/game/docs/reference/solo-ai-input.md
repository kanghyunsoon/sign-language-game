# Solo AI Input Unit

## Scope

`RecognitionGameController` is an adapter between the public `SignRecognizer` interface and a small game-input contract. It does not import the Python WebSocket implementation into game code, and it does not alter score rules or add a backend.

## Behavior

- `CAPABILITIES` stores the Python model version and supported symbols.
- In `PYTHON_AI` mode, both targets and future spawned letters use `GAME_SYMBOLS ∩ supportedSymbols`.
- `SIGN_CONFIRMED` submits a symbol only when it matches the current target.
- The actual runtime still chooses and highlights the settled-first removal target before Matter removal.
- `HAND_RELEASED` calls `releaseInput`, which clears the existing input lock.
- An unavailable matching board symbol is reported as `NO_TARGET_ON_BOARD`; no score-specific behavior is introduced.
- `KEYBOARD` mode restores all 41 symbols and remains usable after disconnection.
