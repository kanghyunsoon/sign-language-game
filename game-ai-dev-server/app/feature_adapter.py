from __future__ import annotations

from typing import Sequence

import numpy as np

from .messages import Landmark
# Jamo-only build uses feature_v3: 3-D bone directions, joint angles and a
# palm-facing normal (78 values). Unlike v2 it keeps relative depth and the palm
# plane, which is what separates jamo whose 2-D silhouettes look alike
# (ㅅ/ㅠ, ㅔ/ㅕ, back-of-hand and vertically flipped poses).
from .feature_v3 import FEATURE_SIZE, LANDMARK_COUNT, landmarks_to_feature as create_feature


def landmarks_to_feature(landmarks: Sequence[Landmark], handedness: str) -> np.ndarray:
    return create_feature(landmarks, handedness)
