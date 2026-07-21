"""Configuration loading and file identity helpers.""";

from dataclasses import dataclass;
import hashlib;
import json;
from pathlib import Path;
from typing import Any;


@dataclass(frozen=True)
class MediaPipeConfig:
    numHands: int;
    minHandDetectionConfidence: float;
    minHandPresenceConfidence: float;
    minTrackingConfidence: float;
    modelUrl: str;
    modelSha256: str;


@dataclass(frozen=True)
class QualityConfig:
    minHandednessScore: float;
    minBoundingBoxAreaRatio: float;
    landmarkBoundaryTolerance: float;
    maxOutOfBoundsLandmarks: int;


@dataclass(frozen=True)
class NormalizationConfig:
    originLandmarkIndex: int;
    scaleLandmarkIndices: tuple[int, ...];
    canonicalHandedness: str;
    scaleEpsilon: float;
    applyRotationNormalization: bool;


@dataclass(frozen=True)
class DatasetConfig:
    splits: tuple[str, ...];
    imageExtensions: tuple[str, ...];
    requireParticipantForEvaluation: bool;


@dataclass(frozen=True)
class PreprocessingConfig:
    schemaVersion: str;
    mediaPipe: MediaPipeConfig;
    quality: QualityConfig;
    normalization: NormalizationConfig;
    dataset: DatasetConfig;


def loadJson(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as inputFile:
        return json.load(inputFile);


def loadPreprocessingConfig(path: Path) -> PreprocessingConfig:
    payload = loadJson(path);
    mediaPipe = payload["mediaPipe"];
    quality = payload["quality"];
    normalization = payload["normalization"];
    dataset = payload["dataset"];

    if mediaPipe["task"] != "HandLandmarker" or mediaPipe["runningMode"] != "IMAGE":
        raise ValueError("Photo preprocessing requires HandLandmarker IMAGE mode.");
    if mediaPipe["numHands"] != 1:
        raise ValueError("Photo preprocessing requires numHands=1.");
    if normalization["applyRotationNormalization"]:
        raise ValueError("Rotation normalization is not part of schema 1.0.0.");

    return PreprocessingConfig(
        schemaVersion=payload["schemaVersion"],
        mediaPipe=MediaPipeConfig(
            numHands=int(mediaPipe["numHands"]),
            minHandDetectionConfidence=float(mediaPipe["minHandDetectionConfidence"]),
            minHandPresenceConfidence=float(mediaPipe["minHandPresenceConfidence"]),
            minTrackingConfidence=float(mediaPipe["minTrackingConfidence"]),
            modelUrl=str(mediaPipe["modelUrl"]),
            modelSha256=str(mediaPipe["modelSha256"]),
        ),
        quality=QualityConfig(
            minHandednessScore=float(quality["minHandednessScore"]),
            minBoundingBoxAreaRatio=float(quality["minBoundingBoxAreaRatio"]),
            landmarkBoundaryTolerance=float(quality["landmarkBoundaryTolerance"]),
            maxOutOfBoundsLandmarks=int(quality["maxOutOfBoundsLandmarks"]),
        ),
        normalization=NormalizationConfig(
            originLandmarkIndex=int(normalization["originLandmarkIndex"]),
            scaleLandmarkIndices=tuple(int(index) for index in normalization["scaleLandmarkIndices"]),
            canonicalHandedness=str(normalization["canonicalHandedness"]),
            scaleEpsilon=float(normalization["scaleEpsilon"]),
            applyRotationNormalization=bool(normalization["applyRotationNormalization"]),
        ),
        dataset=DatasetConfig(
            splits=tuple(str(split) for split in dataset["splits"]),
            imageExtensions=tuple(str(extension).lower() for extension in dataset["imageExtensions"]),
            requireParticipantForEvaluation=bool(dataset["requireParticipantForEvaluation"]),
        ),
    );


def calculateSha256(path: Path) -> str:
    digest = hashlib.sha256();
    with path.open("rb") as inputFile:
        for chunk in iter(lambda: inputFile.read(1024 * 1024), b""):
            digest.update(chunk);
    return digest.hexdigest();
