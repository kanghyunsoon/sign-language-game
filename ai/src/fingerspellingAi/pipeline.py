"""End-to-end image landmark extraction and NPZ generation.""";

from collections import Counter;
from contextlib import nullcontext;
from dataclasses import asdict;
from datetime import datetime, timezone;
from importlib.metadata import PackageNotFoundError, version;
import json;
import os;
from pathlib import Path;
import shutil;
from typing import Any, Callable;
import uuid;

import numpy as np;

from .config import PreprocessingConfig, calculateSha256, loadPreprocessingConfig;
from .dataset import ImageSample, discoverSamples;
from .extractor import ExtractedHand, HandExtractor, MediaPipeHandExtractor;
from .labels import LabelDefinition, loadModelLabels;
from .normalization import normalizeWorldLandmarks;
from .quality import QualityResult, evaluateQuality;


ProgressCallback = Callable[[int, int, str], None];


def runImagePreprocessing(
    inputRoot: Path,
    outputRoot: Path,
    modelPath: Path,
    labelsPath: Path,
    configPath: Path,
    datasetVersion: str,
    overwrite: bool = False,
    extractor: HandExtractor | None = None,
    progressCallback: ProgressCallback | None = None,
) -> dict[str, Any]:
    config = loadPreprocessingConfig(configPath);
    labels = loadModelLabels(labelsPath);
    labelsSha256 = calculateSha256(labelsPath);
    preprocessingConfigSha256 = calculateSha256(configPath);
    samples, warnings = discoverSamples(inputRoot, labels, config.dataset);
    _validateOutputRoot(inputRoot, outputRoot, overwrite);
    modelSha256 = calculateSha256(modelPath) if modelPath.is_file() else None;
    if extractor is None and modelSha256 is None:
        raise FileNotFoundError(f"MediaPipe model does not exist: {modelPath}");
    if (
        extractor is None
        and config.mediaPipe.modelSha256
        and modelSha256 != config.mediaPipe.modelSha256
    ):
        raise ValueError(
            f"MediaPipe model SHA-256 mismatch: expected {config.mediaPipe.modelSha256}, received {modelSha256}.",
        );
    stagingRoot = _createStagingRoot(outputRoot);
    extractorMetadata = {
        "task": "HandLandmarker",
        "libraryVersion": _packageVersion("mediapipe"),
        "modelAssetSha256": modelSha256,
        "runningMode": "IMAGE",
        "numHands": config.mediaPipe.numHands,
        "minHandDetectionConfidence": config.mediaPipe.minHandDetectionConfidence,
        "minHandPresenceConfidence": config.mediaPipe.minHandPresenceConfidence,
        "minTrackingConfidence": config.mediaPipe.minTrackingConfidence,
    };

    rawPath = stagingRoot / "raw" / "frames.jsonl";
    rejectedPath = stagingRoot / "rejected" / "frames.jsonl";
    processedPath = stagingRoot / "processed" / "frames.npz";
    try:
        for path in (rawPath, rejectedPath, processedPath):
            path.parent.mkdir(parents=True, exist_ok=True);
    except Exception:
        shutil.rmtree(stagingRoot);
        raise;

    features: list[np.ndarray] = [];
    acceptedSamples: list[ImageSample] = [];
    rejectedReasonCounts: Counter[str] = Counter();
    acceptedSplitCounts: Counter[str] = Counter();
    acceptedLabelCounts: Counter[str] = Counter();
    acceptedTrainLabelCounts: Counter[str] = Counter();
    sourceCounts: Counter[str] = Counter();
    rawTempPath = rawPath.with_suffix(".jsonl.tmp");
    rejectedTempPath = rejectedPath.with_suffix(".jsonl.tmp");

    try:
        extractorContext = nullcontext(extractor) if extractor is not None else MediaPipeHandExtractor(modelPath, config.mediaPipe);
    except Exception:
        shutil.rmtree(stagingRoot);
        raise;
    try:
        with extractorContext as activeExtractor:
            with rawTempPath.open("w", encoding="utf-8", newline="\n") as rawFile:
                with rejectedTempPath.open("w", encoding="utf-8", newline="\n") as rejectedFile:
                    for index, sample in enumerate(samples, start=1):
                        sourceCounts[sample.source] += 1;
                        record, modelInput = _processSample(sample, activeExtractor, config, extractorMetadata);
                        rawFile.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n");
                        quality = record["quality"];
                        if quality["valid"]:
                            if modelInput is None:
                                raise RuntimeError("A valid sample must have a normalized model input.");
                            features.append(np.asarray(modelInput, dtype=np.float32));
                            acceptedSamples.append(sample);
                            acceptedSplitCounts[sample.split] += 1;
                            acceptedLabelCounts[sample.labelId] += 1;
                            if sample.split == "train":
                                acceptedTrainLabelCounts[sample.labelId] += 1;
                        else:
                            rejectedFile.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n");
                            rejectedReasonCounts.update(quality["reasons"]);
                        if progressCallback is not None:
                            progressCallback(index, len(samples), sample.relativePath);
    except Exception:
        rawTempPath.unlink(missing_ok=True);
        rejectedTempPath.unlink(missing_ok=True);
        shutil.rmtree(stagingRoot);
        raise;

    try:
        os.replace(rawTempPath, rawPath);
        os.replace(rejectedTempPath, rejectedPath);
        if not features:
            raise ValueError("No image passed preprocessing quality checks.");
        _validateAcceptedTrainingClasses(labels, acceptedTrainLabelCounts, config.dataset.minimumAcceptedTrainSamplesPerClass);
        _writeDataset(processedPath, features, acceptedSamples, labels);

        manifest = {
            "schemaVersion": config.schemaVersion,
            "datasetVersion": datasetVersion,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "inputRoot": str(inputRoot.resolve()),
            "outputRoot": str(outputRoot.resolve()),
            "inputSampleCount": len(samples),
            "acceptedSampleCount": len(acceptedSamples),
            "rejectedSampleCount": len(samples) - len(acceptedSamples),
            "featureShape": [len(acceptedSamples), 63],
            "classCount": len(labels),
            "classIds": [label.id for label in labels],
            "acceptedBySplit": dict(sorted(acceptedSplitCounts.items())),
            "acceptedByLabel": dict(sorted(acceptedLabelCounts.items())),
            "acceptedTrainByLabel": dict(sorted(acceptedTrainLabelCounts.items())),
            "inputBySource": dict(sorted(sourceCounts.items())),
            "rejectedByReason": dict(sorted(rejectedReasonCounts.items())),
            "warnings": warnings,
            "artifacts": {
                "rawFrames": rawPath.relative_to(stagingRoot).as_posix(),
                "processedDataset": processedPath.relative_to(stagingRoot).as_posix(),
                "rejectedFrames": rejectedPath.relative_to(stagingRoot).as_posix(),
            },
            "identity": {
                "labelsSha256": labelsSha256,
                "preprocessingConfigSha256": preprocessingConfigSha256,
                "mediaPipeModelSha256": modelSha256,
            },
            "normalization": asdict(config.normalization),
        };
        _writeJsonAtomically(stagingRoot / "manifest.json", manifest);
        _publishOutput(stagingRoot, outputRoot);
        return manifest;
    finally:
        if stagingRoot.exists():
            shutil.rmtree(stagingRoot);


def _processSample(
    sample: ImageSample,
    extractor: HandExtractor,
    config: PreprocessingConfig,
    extractorMetadata: dict[str, Any],
) -> tuple[dict[str, Any], list[float] | None]:
    try:
        hand = extractor.extract(sample.path);
    except Exception as error:
        quality = QualityResult(False, (f"extractor_error:{type(error).__name__}",), None, 0, False);
        return (
            _createRecord(sample, None, quality, extractorMetadata, str(error)),
            None,
        );

    currentImageSha256 = calculateSha256(sample.path);
    if currentImageSha256 != sample.imageSha256:
        raise RuntimeError(f"Source image changed during preprocessing: {sample.relativePath}");

    quality = evaluateQuality(sample, hand, config.quality, config.dataset);
    modelInput: list[float] | None = None;
    if quality.valid and hand is not None:
        try:
            normalized = normalizeWorldLandmarks(hand.worldLandmarks, hand.handedness, config.normalization);
            modelInput = normalized.tolist();
        except ValueError:
            quality = QualityResult(
                valid=False,
                reasons=("normalization_failed",),
                boundingBoxAreaRatio=quality.boundingBoxAreaRatio,
                outOfBoundsLandmarkCount=quality.outOfBoundsLandmarkCount,
                evaluationEligible=quality.evaluationEligible,
            );
    return (
        _createRecord(sample, hand, quality, extractorMetadata),
        modelInput,
    );


def _createRecord(
    sample: ImageSample,
    hand: ExtractedHand | None,
    quality: QualityResult,
    extractorMetadata: dict[str, Any],
    errorMessage: str | None = None,
) -> dict[str, Any]:
    handPayload = None;
    if hand is not None:
        handPayload = {
            "handedness": hand.handedness,
            "handednessScore": round(hand.handednessScore, 6),
            "landmarks": _roundPoints(hand.landmarks),
            "worldLandmarks": _roundPoints(hand.worldLandmarks),
            "imageWidth": hand.imageWidth,
            "imageHeight": hand.imageHeight,
        };
    qualityPayload = {
        "valid": quality.valid,
        "reasons": list(quality.reasons),
        "boundingBoxAreaRatio": (
            round(quality.boundingBoxAreaRatio, 8) if quality.boundingBoxAreaRatio is not None else None
        ),
        "outOfBoundsLandmarkCount": quality.outOfBoundsLandmarkCount,
        "evaluationEligible": quality.evaluationEligible,
    };
    if errorMessage is not None:
        qualityPayload["errorMessage"] = errorMessage;

    return {
        "schemaVersion": "1.0.0",
        "sampleId": sample.sampleId,
        "sourcePath": sample.relativePath,
        "imageSha256": sample.imageSha256,
        "split": sample.split,
        "labelId": sample.labelId,
        "classIndex": sample.classIndex,
        "source": sample.source,
        "participantId": sample.participantId,
        "groupId": sample.groupId,
        "sessionId": None,
        "captureTimestampMs": None,
        "frameStatus": "detected" if hand is not None else "not_detected",
        "hand": handPayload,
        "quality": qualityPayload,
        "extractor": extractorMetadata,
    };


def _writeDataset(
    path: Path,
    features: list[np.ndarray],
    samples: list[ImageSample],
    labels: list[LabelDefinition],
) -> None:
    tempPath = path.with_suffix(".npz.tmp");
    with tempPath.open("wb") as outputFile:
        np.savez_compressed(
            outputFile,
            features=np.stack(features).astype(np.float32),
            labelIndices=np.asarray([sample.classIndex for sample in samples], dtype=np.int64),
            labelIds=np.asarray([sample.labelId for sample in samples]),
            sampleIds=np.asarray([sample.sampleId for sample in samples]),
            participantIds=np.asarray([sample.participantId or "" for sample in samples]),
            groupIds=np.asarray([sample.groupId for sample in samples]),
            splits=np.asarray([sample.split for sample in samples]),
            sources=np.asarray([sample.source for sample in samples]),
            classIds=np.asarray([label.id for label in labels]),
        );
    os.replace(tempPath, path);


def _validateOutputRoot(inputRoot: Path, outputRoot: Path, overwrite: bool) -> None:
    resolvedInput = inputRoot.resolve();
    resolvedOutput = outputRoot.resolve();
    if (
        resolvedInput == resolvedOutput
        or resolvedInput in resolvedOutput.parents
        or resolvedOutput in resolvedInput.parents
    ):
        raise ValueError("Input and output directories must not overlap.");
    if outputRoot.exists() and not outputRoot.is_dir():
        raise ValueError(f"Output path must be a directory: {outputRoot}");
    if outputRoot.exists() and any(outputRoot.iterdir()):
        if not overwrite:
            raise FileExistsError(f"Output directory is not empty: {outputRoot}. Use --overwrite to replace it.");
    if resolvedOutput == Path(resolvedOutput.anchor):
        raise ValueError("Refusing to use a filesystem root as output.");


def _createStagingRoot(outputRoot: Path) -> Path:
    outputRoot.parent.mkdir(parents=True, exist_ok=True);
    stagingRoot = outputRoot.parent / f".{outputRoot.name}.staging-{uuid.uuid4().hex}";
    stagingRoot.mkdir();
    return stagingRoot;


def _publishOutput(stagingRoot: Path, outputRoot: Path) -> None:
    backupRoot = outputRoot.parent / f".{outputRoot.name}.backup-{uuid.uuid4().hex}";
    hadExistingOutput = outputRoot.exists();
    if hadExistingOutput:
        outputRoot.replace(backupRoot);
    try:
        stagingRoot.replace(outputRoot);
    except Exception:
        if hadExistingOutput and backupRoot.exists() and not outputRoot.exists():
            backupRoot.replace(outputRoot);
        raise;
    if backupRoot.exists():
        shutil.rmtree(backupRoot);


def _validateAcceptedTrainingClasses(
    labels: list[LabelDefinition],
    acceptedTrainLabelCounts: Counter[str],
    minimumSamples: int,
) -> None:
    insufficientClasses = {
        label.id: acceptedTrainLabelCounts[label.id]
        for label in labels
        if acceptedTrainLabelCounts[label.id] < minimumSamples
    };
    if insufficientClasses:
        raise ValueError(
            f"Every model class requires at least {minimumSamples} accepted train samples: {insufficientClasses}",
        );


def _writeJsonAtomically(path: Path, payload: dict[str, Any]) -> None:
    tempPath = path.with_suffix(path.suffix + ".tmp");
    with tempPath.open("w", encoding="utf-8", newline="\n") as outputFile:
        json.dump(payload, outputFile, ensure_ascii=False, indent=2);
        outputFile.write("\n");
    os.replace(tempPath, path);


def _roundPoints(points: list[list[float]]) -> list[list[float]]:
    return [[round(value, 6) for value in point] for point in points];


def _packageVersion(packageName: str) -> str:
    try:
        return version(packageName);
    except PackageNotFoundError:
        return "unknown";
