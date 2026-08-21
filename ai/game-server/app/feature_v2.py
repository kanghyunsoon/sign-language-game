from __future__ import annotations

from typing import Sequence

import numpy as np

from .messages import Landmark


LANDMARK_COUNT = 21
FEATURE_SIZE = 55

_PARENT = np.asarray((0, 1, 2, 3, 0, 5, 6, 7, 0, 9, 10, 11, 0, 13, 14, 15, 0, 17, 18, 19))
_CHILD = np.asarray((1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20))
_ANGLE_A = np.asarray((0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18))
_ANGLE_B = np.asarray((1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19))


def landmarks_to_feature(landmarks: Sequence[Landmark], handedness: str) -> np.ndarray:
    """Create the 55-value model input without importing the legacy project.

    Left hands are mirrored into the right-hand coordinate convention used by
    the baseline model. The feature contains 20 normalized 2-D bone vectors
    and 15 adjacent-bone angles. Translation and scale therefore do not affect
    classification, while screen-space orientation remains available.
    """
    if len(landmarks) != LANDMARK_COUNT:
        raise ValueError(f"Expected {LANDMARK_COUNT} landmarks, got {len(landmarks)}")
    normalized_handedness = handedness.upper()
    if normalized_handedness not in {"LEFT", "RIGHT"}:
        raise ValueError("handedness must be LEFT or RIGHT")

    points = np.asarray([(item.x, item.y) for item in landmarks], dtype=np.float64)
    if normalized_handedness == "LEFT":
        points[:, 0] = 1.0 - points[:, 0]
    points = points.astype(np.float32)

    vectors = points[_CHILD] - points[_PARENT]
    lengths = np.linalg.norm(vectors, axis=1, keepdims=True)
    vectors = np.divide(vectors, lengths, out=np.zeros_like(vectors), where=lengths > 1e-6)
    cosines = np.einsum("nt,nt->n", vectors[_ANGLE_A], vectors[_ANGLE_B])
    angles = np.degrees(np.arccos(np.clip(cosines, -1.0, 1.0))).astype(np.float32)
    feature = np.concatenate((vectors.reshape(-1), angles)).astype(np.float32)
    if feature.shape != (FEATURE_SIZE,) or not np.isfinite(feature).all():
        raise ValueError("Landmark feature is invalid")
    return feature
