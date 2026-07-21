"""Shared frame normalization for training and service inference.""";

import numpy as np;
from numpy.typing import NDArray;

from .config import NormalizationConfig;


FloatArray = NDArray[np.float32];
LANDMARK_COUNT = 21;
COORDINATE_COUNT = 3;


def normalizeWorldLandmarks(
    worldLandmarks: list[list[float]] | FloatArray,
    handedness: str,
    config: NormalizationConfig,
) -> FloatArray:
    points = np.asarray(worldLandmarks, dtype=np.float32);
    expectedShape = (LANDMARK_COUNT, COORDINATE_COUNT);
    if points.shape != expectedShape:
        raise ValueError(f"worldLandmarks must have shape {expectedShape}, received {points.shape}.");
    if not np.isfinite(points).all():
        raise ValueError("worldLandmarks must contain only finite values.");

    centeredPoints = points - points[config.originLandmarkIndex];
    canonicalHandedness = config.canonicalHandedness.lower();
    if handedness.lower() not in {"left", "right"}:
        raise ValueError(f"Unsupported handedness: {handedness}");
    if handedness.lower() != canonicalHandedness:
        centeredPoints[:, 0] *= -1.0;

    scaleVectors = centeredPoints[list(config.scaleLandmarkIndices)];
    scale = float(np.linalg.norm(scaleVectors, axis=1).mean());
    if not np.isfinite(scale) or scale <= config.scaleEpsilon:
        raise ValueError("Palm scale is too small to normalize.");

    normalized = centeredPoints / scale;
    return normalized.reshape(LANDMARK_COUNT * COORDINATE_COUNT).astype(np.float32);
