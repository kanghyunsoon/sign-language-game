from __future__ import annotations

from typing import Sequence

import numpy as np

from .messages import Landmark
from .feature_v2 import FEATURE_SIZE, LANDMARK_COUNT, landmarks_to_feature as create_feature


def landmarks_to_feature(landmarks: Sequence[Landmark], handedness: str) -> np.ndarray:
    return create_feature(landmarks, handedness)
