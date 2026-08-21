"""Landmark quality and evaluation split checks.""";

from dataclasses import dataclass;

import numpy as np;

from .config import DatasetConfig, QualityConfig;
from .dataset import ImageSample;
from .extractor import ExtractedHand;


@dataclass(frozen=True)
class QualityResult:
    valid: bool;
    reasons: tuple[str, ...];
    boundingBoxAreaRatio: float | None;
    outOfBoundsLandmarkCount: int;
    evaluationEligible: bool;


def evaluateQuality(
    sample: ImageSample,
    hand: ExtractedHand | None,
    qualityConfig: QualityConfig,
    datasetConfig: DatasetConfig,
) -> QualityResult:
    reasons: list[str] = [];
    evaluationEligible = True;
    if hand is None:
        return QualityResult(False, ("hand_not_detected",), None, 0, False);

    landmarks = np.asarray(hand.landmarks, dtype=np.float32);
    worldLandmarks = np.asarray(hand.worldLandmarks, dtype=np.float32);
    if landmarks.shape != (21, 3) or worldLandmarks.shape != (21, 3):
        reasons.append("invalid_landmark_shape");
    elif not np.isfinite(landmarks).all() or not np.isfinite(worldLandmarks).all():
        reasons.append("non_finite_landmark");

    boundingBoxAreaRatio: float | None = None;
    outOfBoundsCount = 0;
    if landmarks.shape == (21, 3) and np.isfinite(landmarks).all():
        xCoordinates = landmarks[:, 0];
        yCoordinates = landmarks[:, 1];
        boundingBoxAreaRatio = float((xCoordinates.max() - xCoordinates.min()) * (yCoordinates.max() - yCoordinates.min()));
        tolerance = qualityConfig.landmarkBoundaryTolerance;
        outOfBounds = (
            (xCoordinates < -tolerance)
            | (xCoordinates > 1.0 + tolerance)
            | (yCoordinates < -tolerance)
            | (yCoordinates > 1.0 + tolerance)
        );
        outOfBoundsCount = int(outOfBounds.sum());
        if boundingBoxAreaRatio < qualityConfig.minBoundingBoxAreaRatio:
            reasons.append("hand_too_small");
        if outOfBoundsCount > qualityConfig.maxOutOfBoundsLandmarks:
            reasons.append("hand_out_of_frame");

    if hand.handedness not in {"Left", "Right"}:
        reasons.append("invalid_handedness");
    if hand.handednessScore < qualityConfig.minHandednessScore:
        reasons.append("low_handedness_confidence");

    if (
        datasetConfig.requireParticipantForEvaluation
        and sample.split in {"validation", "test"}
        and sample.participantId is None
    ):
        reasons.append("evaluation_participant_required");
        evaluationEligible = False;

    return QualityResult(
        valid=not reasons,
        reasons=tuple(reasons),
        boundingBoxAreaRatio=boundingBoxAreaRatio,
        outOfBoundsLandmarkCount=outOfBoundsCount,
        evaluationEligible=evaluationEligible,
    );
