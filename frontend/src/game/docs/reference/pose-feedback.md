# Pose Feedback

The Lab compares only a user-imported, normalized `STATIC_TEMPLATE` against live MediaPipe landmarks. Classifier predictions alone never create joint feedback.

## Per-bone calculation

Each `HAND_BONES` connection is evaluated independently with its normalized 3D direction angle and relative length error.

| Status | Angle error | Length error |
| --- | --- | --- |
| `CORRECT` | <= 10 degrees | <= 8% |
| `CLOSE` | <= 25 degrees | <= 20% |
| `WRONG` | either close threshold exceeded | either close threshold exceeded |

The current skeleton remains in its normal color for `CORRECT`, changes only the relevant connection to yellow for `CLOSE`, and red for `WRONG`. The aligned reference skeleton is shown as a blue dashed line.

No detailed feedback is generated when no template is loaded, when its symbol does not match the active target, when handedness is unknown, or when `feedbackMode` is `CLASSIFICATION_ONLY`.

## Rule messages

The highest accumulated non-correct error among thumb, index, middle, ring, and pinky selects one predefined Korean message. These are deterministic rules based on calculated bone errors; no language model is used.

This is a geometric aid, not a judgement of Korean sign-language correctness. Camera angle, hand occlusion, MediaPipe tracking quality, and a poorly captured reference template can all produce misleading feedback.
