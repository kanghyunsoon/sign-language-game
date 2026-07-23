# Recognition WebSocket Contract

Address: `ws://localhost:8765`

The server accepts landmark JSON only. Image and video payloads are not part of this contract.

## Client requests

| Type | Required fields | Effect |
| --- | --- | --- |
| `GET_CAPABILITIES` | none | Returns the loaded TFLite model contract. |
| `LANDMARK_FRAME` | `frameId`, `capturedAt`, `handedness`, 21 `landmarks` | Adds one frame to this connection's sequence. |
| `HAND_NOT_DETECTED` | `capturedAt` | Starts or continues hand-release timing. |
| `RESET_SEQUENCE` | none | Clears sequence, stability, and input lock state. |

Every landmark has numeric finite `x`, `y`, and `z` fields. The current legacy model adapter consumes only `x` and `y`, preserving the existing 55-value feature rule.

## Server responses

| Type | Key fields |
| --- | --- |
| `CAPABILITIES` | `modelVersion`, `supportedSymbols`, `sequenceLength` |
| `PREDICTION` | `frameId`, `symbol`, `confidence`, `isStable`, `predictedAt` |
| `SIGN_CONFIRMED` | `symbol`, `confidence`, `confirmedAt`, `modelVersion` |
| `HAND_RELEASED` | `releasedAt` |
| `ERROR` | `code`, `message` |

`supportedSymbols` is the loaded model label order. The default `jamo-number-hybrid-v1` profile reports 31 jamo labels plus number labels 1~10; the game registry deliberately intersects this with its playable 1~9 number contract. A `SIGN_CONFIRMED` event requires three consecutive predictions at or above 0.90 confidence by default. The same symbol cannot be confirmed again until `HAND_RELEASED`, `RESET_SEQUENCE`, or a different stable symbol is confirmed.

## Validation errors

* `INVALID_JSON`: payload is not JSON.
* `INVALID_MESSAGE`: payload shape or required scalar field is invalid.
* `INVALID_LANDMARK`: a landmark coordinate is invalid or non-finite.
* `INVALID_LANDMARK_COUNT`: `LANDMARK_FRAME` does not contain exactly 21 landmarks.
* `UNSUPPORTED_MESSAGE`: unknown request type.
