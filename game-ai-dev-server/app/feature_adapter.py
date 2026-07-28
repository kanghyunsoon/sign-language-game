from __future__ import annotations

from typing import Sequence

import numpy as np

from .messages import Landmark
from .feature_v2 import FEATURE_SIZE as FEATURE_SIZE_V2, landmarks_to_feature as create_feature_v2
from .feature_v3 import FEATURE_SIZE as FEATURE_SIZE_V3, LANDMARK_COUNT, landmarks_to_feature as create_feature_v3


# The jamo-only deployment runs a dual-head ensemble:
#   - v2 (55 values): 2-D bone vectors + angles. Trained on the large session
#     capture set, so it is the stronger head for jamo with many samples.
#   - v3 (78 values): 3-D bone directions + angles + palm normal. Keeps relative
#     depth and the palm plane, which separates jamo whose 2-D silhouettes look
#     alike (ㅅ/ㅠ, ㅔ/ㅕ, back-of-hand and vertically flipped poses).
# Both are computed from exactly the same MediaPipe landmarks (x, y, z), so the
# frontend contract is unchanged.
FEATURE_SIZE = FEATURE_SIZE_V3  # kept for callers that expect a single size


def landmarks_to_feature_v2(landmarks: Sequence[Landmark], handedness: str) -> np.ndarray:
    return create_feature_v2(landmarks, handedness)


def landmarks_to_feature_v3(landmarks: Sequence[Landmark], handedness: str) -> np.ndarray:
    return create_feature_v3(landmarks, handedness)


def landmarks_to_features(landmarks: Sequence[Landmark], handedness: str) -> tuple[np.ndarray, np.ndarray]:
    """Return the (v2, v3) feature pair for one frame."""
    return (
        create_feature_v2(landmarks, handedness),
        create_feature_v3(landmarks, handedness),
    )


def landmarks_to_feature(landmarks: Sequence[Landmark], handedness: str) -> np.ndarray:
    """Backwards-compatible single-feature entry point (v3)."""
    return create_feature_v3(landmarks, handedness)
