from __future__ import annotations

from typing import Sequence

import numpy as np

from .messages import Landmark


LANDMARK_COUNT = 21
FEATURE_SIZE = 78

_PARENT = np.asarray((0, 1, 2, 3, 0, 5, 6, 7, 0, 9, 10, 11, 0, 13, 14, 15, 0, 17, 18, 19))
_CHILD = np.asarray((1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20))
_ANGLE_A = np.asarray((0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18))
_ANGLE_B = np.asarray((1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19))


def _unit(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 1e-6 else np.zeros_like(vector)


def landmarks_to_feature(landmarks: Sequence[Landmark], handedness: str) -> np.ndarray:
    """Return 3-D bone directions, joint angles, and a palm-facing normal.

    This can be computed from exactly the landmarks supplied at runtime.  Left
    hands are mirrored before all geometry, so right/left capture does not
    become a label shortcut.  Unlike v2, relative depth and the palm plane are
    retained to help distinguish otherwise similar 2-D silhouettes.
    """
    if len(landmarks) != LANDMARK_COUNT:
        raise ValueError(f"Expected {LANDMARK_COUNT} landmarks, got {len(landmarks)}")
    normalized_handedness = handedness.upper()
    if normalized_handedness not in {"LEFT", "RIGHT"}:
        raise ValueError("handedness must be LEFT or RIGHT")
    points = np.asarray([(item.x, item.y, item.z) for item in landmarks], dtype=np.float32)
    if normalized_handedness == "LEFT":
        points[:, 0] = 1.0 - points[:, 0]
    wrist = points[0].copy()
    palm_scale = np.mean(np.linalg.norm(points[[5, 9, 13, 17]] - wrist, axis=1))
    if palm_scale <= 1e-6:
        raise ValueError("Palm scale is invalid")
    points = (points - wrist) / palm_scale
    vectors = points[_CHILD] - points[_PARENT]
    directions = np.asarray([_unit(vector) for vector in vectors], dtype=np.float32)
    cosines = np.einsum("nt,nt->n", directions[_ANGLE_A], directions[_ANGLE_B])
    angles = np.degrees(np.arccos(np.clip(cosines, -1.0, 1.0))).astype(np.float32)
    palm_normal = _unit(np.cross(points[5] - points[0], points[17] - points[0])).astype(np.float32)
    feature = np.concatenate((directions.reshape(-1), angles, palm_normal)).astype(np.float32)
    if feature.shape != (FEATURE_SIZE,) or not np.isfinite(feature).all():
        raise ValueError("Landmark feature is invalid")
    return feature
