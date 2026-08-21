"""Validated loading of preprocessed fingerspelling datasets.""";

from dataclasses import dataclass;
from pathlib import Path;
from typing import Any;

import numpy as np;

from .config import calculateJsonSha256, calculateSha256, loadJson, loadPreprocessingConfig;
from .labels import loadModelLabels;


REQUIRED_ARRAYS = (
    "features",
    "labelIndices",
    "labelIds",
    "sampleIds",
    "participantIds",
    "groupIds",
    "splits",
    "sources",
    "classIds",
);
ALLOWED_SPLITS = ("train", "validation", "test");


@dataclass(frozen=True)
class TrainingDataset:
    features: np.ndarray;
    labelIndices: np.ndarray;
    labelIds: np.ndarray;
    sampleIds: np.ndarray;
    participantIds: np.ndarray;
    groupIds: np.ndarray;
    splits: np.ndarray;
    sources: np.ndarray;
    classIds: tuple[str, ...];
    manifest: dict[str, Any];

    def indicesForSplit(self, split: str) -> np.ndarray:
        if split not in ALLOWED_SPLITS:
            raise ValueError(f"Unknown split: {split}");
        return np.flatnonzero(self.splits == split);


def loadTrainingDataset(
    datasetRoot: Path,
    labelsPath: Path,
    preprocessingConfigPath: Path,
) -> TrainingDataset:
    datasetRoot = datasetRoot.resolve();
    manifestPath = datasetRoot / "manifest.json";
    if not manifestPath.is_file():
        raise FileNotFoundError(f"Dataset manifest does not exist: {manifestPath}");
    manifest = loadJson(manifestPath);
    _validateManifestIdentity(manifest, labelsPath, preprocessingConfigPath);
    processedRelativePath = manifest.get("artifacts", {}).get("processedDataset");
    if not isinstance(processedRelativePath, str) or not processedRelativePath:
        raise ValueError("Dataset manifest does not define artifacts.processedDataset.");
    processedPath = (datasetRoot / processedRelativePath).resolve();
    if datasetRoot not in processedPath.parents:
        raise ValueError("Processed dataset path must stay inside the dataset root.");
    if not processedPath.is_file():
        raise FileNotFoundError(f"Processed dataset does not exist: {processedPath}");

    with np.load(processedPath, allow_pickle=False) as archive:
        missingArrays = [name for name in REQUIRED_ARRAYS if name not in archive.files];
        if missingArrays:
            raise ValueError(f"Processed dataset is missing arrays: {missingArrays}");
        arrays = {name: np.array(archive[name], copy=True) for name in REQUIRED_ARRAYS};

    labels = loadModelLabels(labelsPath);
    expectedClassIds = tuple(label.id for label in labels);
    dataset = TrainingDataset(
        features=arrays["features"],
        labelIndices=arrays["labelIndices"],
        labelIds=arrays["labelIds"],
        sampleIds=arrays["sampleIds"],
        participantIds=arrays["participantIds"],
        groupIds=arrays["groupIds"],
        splits=arrays["splits"],
        sources=arrays["sources"],
        classIds=tuple(str(value) for value in arrays["classIds"].tolist()),
        manifest=manifest,
    );
    _validateDataset(dataset, expectedClassIds);
    return dataset;


def _validateManifestIdentity(
    manifest: dict[str, Any],
    labelsPath: Path,
    preprocessingConfigPath: Path,
) -> None:
    if manifest.get("schemaVersion") != "1.0.0":
        raise ValueError(f"Unsupported dataset schema version: {manifest.get('schemaVersion')}");
    identity = manifest.get("identity");
    if not isinstance(identity, dict):
        raise ValueError("Dataset manifest identity is missing.");
    expectedCanonicalHashes = {
        "labelsCanonicalSha256": calculateJsonSha256(labelsPath),
        "preprocessingConfigCanonicalSha256": calculateJsonSha256(preprocessingConfigPath),
    };
    for name, expectedHash in expectedCanonicalHashes.items():
        if name in identity and identity[name] != expectedHash:
            raise ValueError(f"Dataset {name} does not match the current configuration.");
    if "labelsCanonicalSha256" not in identity and identity.get("labelsSha256") != calculateSha256(labelsPath):
        raise ValueError("Dataset labelsSha256 does not match the current configuration.");
    if (
        "preprocessingConfigCanonicalSha256" not in identity
        and identity.get("preprocessingConfigSha256") != calculateSha256(preprocessingConfigPath)
    ):
        _validateLegacyPreprocessingIdentity(manifest, preprocessingConfigPath);


def _validateLegacyPreprocessingIdentity(manifest: dict[str, Any], preprocessingConfigPath: Path) -> None:
    config = loadPreprocessingConfig(preprocessingConfigPath);
    expectedNormalization = {
        "originLandmarkIndex": config.normalization.originLandmarkIndex,
        "scaleLandmarkIndices": list(config.normalization.scaleLandmarkIndices),
        "canonicalHandedness": config.normalization.canonicalHandedness,
        "scaleEpsilon": config.normalization.scaleEpsilon,
        "applyRotationNormalization": config.normalization.applyRotationNormalization,
    };
    if manifest.get("normalization") != expectedNormalization:
        raise ValueError("Dataset preprocessingConfigSha256 and normalization do not match the current configuration.");
    if manifest.get("identity", {}).get("mediaPipeModelSha256") != config.mediaPipe.modelSha256:
        raise ValueError("Dataset MediaPipe model does not match the current preprocessing configuration.");


def _validateDataset(dataset: TrainingDataset, expectedClassIds: tuple[str, ...]) -> None:
    sampleCount = dataset.features.shape[0] if dataset.features.ndim > 0 else 0;
    if dataset.features.shape != (sampleCount, 63):
        raise ValueError(f"Features must have shape [N, 63], received {dataset.features.shape}.");
    if dataset.features.dtype != np.float32:
        raise ValueError(f"Features must use float32, received {dataset.features.dtype}.");
    if not np.isfinite(dataset.features).all():
        raise ValueError("Features contain NaN or Infinity.");
    if dataset.labelIndices.dtype != np.int64:
        raise ValueError(f"Label indices must use int64, received {dataset.labelIndices.dtype}.");
    for name in REQUIRED_ARRAYS[1:-1]:
        values = getattr(dataset, name);
        if values.ndim != 1 or len(values) != sampleCount:
            raise ValueError(f"{name} must be a one-dimensional array with {sampleCount} entries.");
    if dataset.classIds != expectedClassIds:
        raise ValueError("Dataset class order does not match labels.json.");
    if dataset.manifest.get("classCount") != len(dataset.classIds):
        raise ValueError("Dataset class count does not match the manifest.");
    if tuple(dataset.manifest.get("classIds", ())) != dataset.classIds:
        raise ValueError("Dataset class order does not match the manifest.");
    if sampleCount != int(dataset.manifest.get("acceptedSampleCount", -1)):
        raise ValueError("Dataset sample count does not match the manifest.");
    if dataset.manifest.get("featureShape") != [sampleCount, 63]:
        raise ValueError("Dataset feature shape does not match the manifest.");
    if np.any(dataset.labelIndices < 0) or np.any(dataset.labelIndices >= len(dataset.classIds)):
        raise ValueError("Dataset contains an out-of-range label index.");
    expectedLabelIds = np.asarray(dataset.classIds)[dataset.labelIndices];
    if not np.array_equal(dataset.labelIds.astype(str), expectedLabelIds):
        raise ValueError("Label IDs do not match label indices and class order.");
    sampleIds = dataset.sampleIds.astype(str);
    if np.any(sampleIds == "") or len(np.unique(sampleIds)) != sampleCount:
        raise ValueError("Sample IDs must be non-empty and unique.");
    unknownSplits = sorted(set(dataset.splits.astype(str)) - set(ALLOWED_SPLITS));
    if unknownSplits:
        raise ValueError(f"Dataset contains unknown splits: {unknownSplits}");
    splitCounts = {split: int(np.sum(dataset.splits == split)) for split in ALLOWED_SPLITS};
    emptySplits = [split for split, count in splitCounts.items() if count == 0];
    if emptySplits:
        raise ValueError(f"Dataset splits cannot be empty: {emptySplits}");
    manifestSplitCounts = {
        str(split): int(count)
        for split, count in dataset.manifest.get("acceptedBySplit", {}).items()
    };
    if manifestSplitCounts != splitCounts:
        raise ValueError("Dataset split counts do not match the manifest.");
    labelCounts = {
        classId: int(np.sum(dataset.labelIndices == classIndex))
        for classIndex, classId in enumerate(dataset.classIds)
    };
    manifestLabelCounts = {
        str(classId): int(count)
        for classId, count in dataset.manifest.get("acceptedByLabel", {}).items()
    };
    if manifestLabelCounts != labelCounts:
        raise ValueError("Dataset label counts do not match the manifest.");
    _validateIdentitySplitLeakage(dataset.participantIds, dataset.splits, "participant");
    _validateIdentitySplitLeakage(dataset.groupIds, dataset.splits, "group");
    trainIndices = dataset.indicesForSplit("train");
    missingTrainClasses = sorted(set(range(len(dataset.classIds))) - set(dataset.labelIndices[trainIndices].tolist()));
    if missingTrainClasses:
        missingIds = [dataset.classIds[index] for index in missingTrainClasses];
        raise ValueError(f"Training split is missing classes: {missingIds}");
    trainLabelCounts = {
        classId: int(np.sum(dataset.labelIndices[trainIndices] == classIndex))
        for classIndex, classId in enumerate(dataset.classIds)
    };
    manifestTrainLabelCounts = {
        str(classId): int(count)
        for classId, count in dataset.manifest.get("acceptedTrainByLabel", {}).items()
    };
    if manifestTrainLabelCounts != trainLabelCounts:
        raise ValueError("Training label counts do not match the manifest.");


def _validateIdentitySplitLeakage(values: np.ndarray, splits: np.ndarray, identityName: str) -> None:
    splitByIdentity: dict[str, str] = {};
    for value, split in zip(values.astype(str), splits.astype(str), strict=True):
        if not value:
            continue;
        previousSplit = splitByIdentity.setdefault(value, split);
        if previousSplit != split:
            raise ValueError(f"Dataset {identityName} appears in multiple splits: {value}.");
