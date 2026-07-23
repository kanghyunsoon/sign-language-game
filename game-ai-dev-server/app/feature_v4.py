from __future__ import annotations

from typing import Sequence

import numpy as np

from .messages import Landmark


LANDMARK_COUNT = 21
FEATURE_SIZE = 351

_PARENT = np.asarray((0, 1, 2, 3, 0, 5, 6, 7, 0, 9, 10, 11, 0, 13, 14, 15, 0, 17, 18, 19))
_CHILD = np.asarray((1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20))
_ANGLE_A = np.asarray((0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18))
_ANGLE_B = np.asarray((1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19))
_PAIR_I, _PAIR_J = np.triu_indices(LANDMARK_COUNT, k=1)


def _unit(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 1e-6 else np.zeros_like(vector)


def _normalized_points(landmarks: Sequence[Landmark], handedness: str) -> np.ndarray:
    if len(landmarks) != LANDMARK_COUNT:
        raise ValueError(f"Expected {LANDMARK_COUNT} landmarks, got {len(landmarks)}")
    normalized_handedness = handedness.upper()
    if normalized_handedness not in {"LEFT", "RIGHT"}:
        raise ValueError("handedness must be LEFT or RIGHT")
    points = np.asarray([(item.x, item.y, item.z) for item in landmarks], dtype=np.float32)
    if normalized_handedness == "LEFT":
        points[:, 0] = 1.0 - points[:, 0]
    wrist = points[0].copy()
    palm_scale = float(np.mean(np.linalg.norm(points[[5, 9, 13, 17]] - wrist, axis=1)))
    if palm_scale <= 1e-6:
        raise ValueError("Palm scale is invalid")
    return (points - wrist) / palm_scale


def orientation_proxies(landmarks: Sequence[Landmark], handedness: str) -> tuple[float, float]:
    """Return camera-relative signals for diagnostic buckets, not truth labels."""
    points = _normalized_points(landmarks, handedness)
    middle_mcp_y = float(_unit(points[9] - points[0])[1])
    palm_normal_z = float(_unit(np.cross(points[5] - points[0], points[17] - points[0]))[2])
    return middle_mcp_y, palm_normal_z


def landmarks_to_feature(landmarks: Sequence[Landmark], handedness: str) -> np.ndarray:
    """Return a rotation-resistant hand-shape feature plus camera palm normal.

    The palm-local frame and all pairwise landmark distances reduce sensitivity
    to camera roll and up/down pose.  The final three camera-frame palm-normal
    values are retained so orientation robustness can still be audited.
    """
    points = _normalized_points(landmarks, handedness)
    y_axis = _unit(points[9] - points[0])
    across_palm = _unit(points[5] - points[17])
    z_axis = _unit(np.cross(across_palm, y_axis))
    x_axis = _unit(np.cross(y_axis, z_axis))
    if min(np.linalg.norm(x_axis), np.linalg.norm(y_axis), np.linalg.norm(z_axis)) <= 1e-6:
        raise ValueError("Palm-local coordinate frame is invalid")
    frame = np.stack((x_axis, y_axis, z_axis), axis=0)
    local_points = points @ frame.T
    local_vectors = local_points[_CHILD] - local_points[_PARENT]
    local_directions = np.asarray([_unit(vector) for vector in local_vectors], dtype=np.float32)
    cosines = np.einsum("nt,nt->n", local_directions[_ANGLE_A], local_directions[_ANGLE_B])
    angles = np.degrees(np.arccos(np.clip(cosines, -1.0, 1.0))).astype(np.float32)
    pairwise_distances = np.linalg.norm(local_points[_PAIR_I] - local_points[_PAIR_J], axis=1).astype(np.float32)
    camera_palm_normal = _unit(np.cross(points[5] - points[0], points[17] - points[0])).astype(np.float32)
    feature = np.concatenate(
        (local_points.reshape(-1), local_directions.reshape(-1), angles, pairwise_distances, camera_palm_normal)
    ).astype(np.float32)
    if feature.shape != (FEATURE_SIZE,) or not np.isfinite(feature).all():
        raise ValueError(f"Landmark feature is invalid: {feature.shape}")
    return feature
