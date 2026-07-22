"""End-to-end training, evaluation, calibration, and model packaging.""";

from collections.abc import Callable;
from datetime import datetime, timezone;
import json;
import os;
from pathlib import Path;
import random;
import shutil;
from typing import Any;
import uuid;

import numpy as np;
import torch;
from torch import nn;
from torch.utils.data import DataLoader, TensorDataset;

from .config import calculateSha256;
from .metrics import calculateClassificationMetrics, calibrateClassThresholds;
from .model import FingerspellingMlp, calculateFeatureStatistics;
from .trainingConfig import TrainingConfig, loadTrainingConfig;
from .trainingData import TrainingDataset, loadTrainingDataset;


TrainingProgressCallback = Callable[[int, int, dict[str, float]], None];


def runTraining(
    datasetRoot: Path,
    outputRoot: Path,
    modelVersion: str,
    labelsPath: Path,
    preprocessingConfigPath: Path,
    recognitionPolicyPath: Path,
    trainingConfigPath: Path,
    gitCommit: str,
    overwrite: bool = False,
    progressCallback: TrainingProgressCallback | None = None,
) -> dict[str, Any]:
    config = loadTrainingConfig(trainingConfigPath);
    dataset = loadTrainingDataset(datasetRoot, labelsPath, preprocessingConfigPath);
    _validateOutputRoot(datasetRoot, outputRoot, overwrite);
    device = _resolveDevice(config.device);
    _seedRuntime(config.seed);
    stagingRoot = _createStagingRoot(outputRoot);
    try:
        result = _trainModel(dataset, config, device, progressCallback);
        packageManifest = _writeModelPackage(
            stagingRoot=stagingRoot,
            modelVersion=modelVersion,
            dataset=dataset,
            result=result,
            config=config,
            labelsPath=labelsPath,
            preprocessingConfigPath=preprocessingConfigPath,
            recognitionPolicyPath=recognitionPolicyPath,
            trainingConfigPath=trainingConfigPath,
            gitCommit=gitCommit,
            device=device,
        );
        _publishOutput(stagingRoot, outputRoot);
        return packageManifest;
    finally:
        if stagingRoot.exists():
            shutil.rmtree(stagingRoot);


def _trainModel(
    dataset: TrainingDataset,
    config: TrainingConfig,
    device: torch.device,
    progressCallback: TrainingProgressCallback | None,
) -> dict[str, Any]:
    splitTensors = {};
    for split in ("train", "validation", "test"):
        indices = dataset.indicesForSplit(split);
        splitTensors[split] = (
            torch.from_numpy(dataset.features[indices]),
            torch.from_numpy(dataset.labelIndices[indices]),
        );
    trainFeatures, trainLabels = splitTensors["train"];
    featureMean, featureStd = calculateFeatureStatistics(trainFeatures);
    model = FingerspellingMlp(
        inputSize=config.model.inputSize,
        hiddenSizes=config.model.hiddenSizes,
        classCount=len(dataset.classIds),
        dropout=config.model.dropout,
        featureMean=featureMean,
        featureStd=featureStd,
    ).to(device);

    loaders = {
        split: _createDataLoader(features, labels, split, config, device)
        for split, (features, labels) in splitTensors.items()
    };
    classWeights = _calculateClassWeights(trainLabels, len(dataset.classIds), config).to(device);
    criterion = nn.CrossEntropyLoss(weight=classWeights);
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=config.optimization.learningRate,
        weight_decay=config.optimization.weightDecay,
    );

    bestScore = float("-inf");
    bestEpoch = 0;
    bestState: dict[str, torch.Tensor] | None = None;
    epochsWithoutImprovement = 0;
    history: list[dict[str, float | int]] = [];
    for epoch in range(1, config.optimization.epochs + 1):
        trainLoss = _trainEpoch(model, loaders["train"], criterion, optimizer, device, config);
        validation = _evaluateModel(model, loaders["validation"], criterion, device, len(dataset.classIds));
        validationProbabilities = _softmaxNumpy(validation["logits"]);
        validationPredictions = np.argmax(validationProbabilities, axis=1);
        validationMetrics, _ = calculateClassificationMetrics(
            validation["labels"],
            validationPredictions,
            validationProbabilities,
            dataset.classIds,
        );
        epochRecord = {
            "epoch": epoch,
            "trainLoss": trainLoss,
            "validationLoss": float(validation["loss"]),
            "validationAccuracy": float(validationMetrics["accuracy"]),
            "validationMacroF1": float(validationMetrics["macroF1"]),
        };
        history.append(epochRecord);
        score = (
            float(validationMetrics["macroF1"])
            if config.earlyStopping.monitor == "macroF1"
            else -float(validation["loss"])
        );
        if score > bestScore + config.earlyStopping.minimumDelta:
            bestScore = score;
            bestEpoch = epoch;
            bestState = {name: value.detach().cpu().clone() for name, value in model.state_dict().items()};
            epochsWithoutImprovement = 0;
        else:
            epochsWithoutImprovement += 1;
        if progressCallback is not None:
            progressCallback(epoch, config.optimization.epochs, epochRecord);
        if epochsWithoutImprovement >= config.earlyStopping.patience:
            break;

    if bestState is None:
        raise RuntimeError("Training did not produce a model checkpoint.");
    model.load_state_dict(bestState);
    model.to(device);
    validation = _evaluateModel(model, loaders["validation"], criterion, device, len(dataset.classIds));
    test = _evaluateModel(model, loaders["test"], criterion, device, len(dataset.classIds));
    temperature = _fitTemperature(validation["logits"], validation["labels"]);
    validationMetrics, validationConfusion, validationProbabilities = _calculateSplitMetrics(
        validation,
        dataset.classIds,
        temperature,
    );
    testMetrics, testConfusion, _ = _calculateSplitMetrics(test, dataset.classIds, temperature);
    thresholds = calibrateClassThresholds(
        validation["labels"],
        validationProbabilities,
        dataset.classIds,
        config.calibration,
    );
    return {
        "model": model.cpu(),
        "bestEpoch": bestEpoch,
        "completedEpochs": len(history),
        "history": history,
        "temperature": temperature,
        "thresholds": thresholds,
        "validationMetrics": validationMetrics,
        "testMetrics": testMetrics,
        "validationConfusion": validationConfusion,
        "testConfusion": testConfusion,
    };


def _createDataLoader(
    features: torch.Tensor,
    labels: torch.Tensor,
    split: str,
    config: TrainingConfig,
    device: torch.device,
) -> DataLoader:
    generator = torch.Generator();
    generator.manual_seed(config.seed);
    return DataLoader(
        TensorDataset(features, labels),
        batch_size=min(config.optimization.batchSize, len(features)),
        shuffle=split == "train",
        num_workers=config.runtime.numWorkers,
        pin_memory=config.runtime.pinMemory and device.type == "cuda",
        generator=generator if split == "train" else None,
    );


def _calculateClassWeights(
    labels: torch.Tensor,
    classCount: int,
    config: TrainingConfig,
) -> torch.Tensor:
    if config.optimization.classWeighting == "none":
        return torch.ones(classCount, dtype=torch.float32);
    counts = torch.bincount(labels, minlength=classCount).float();
    if torch.any(counts == 0):
        raise ValueError("Balanced class weighting requires every training class.");
    weights = len(labels) / (classCount * counts);
    return weights / weights.mean();


def _trainEpoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    config: TrainingConfig,
) -> float:
    model.train();
    totalLoss = 0.0;
    sampleCount = 0;
    for features, labels in loader:
        features = features.to(device, non_blocking=True);
        labels = labels.to(device, non_blocking=True);
        optimizer.zero_grad(set_to_none=True);
        logits = model(features);
        loss = criterion(logits, labels);
        loss.backward();
        if config.optimization.gradientClipNorm > 0.0:
            nn.utils.clip_grad_norm_(model.parameters(), config.optimization.gradientClipNorm);
        optimizer.step();
        totalLoss += float(loss.detach()) * len(labels);
        sampleCount += len(labels);
    return totalLoss / sampleCount;


def _evaluateModel(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    classCount: int,
) -> dict[str, Any]:
    model.eval();
    totalLoss = 0.0;
    sampleCount = 0;
    logitsParts: list[np.ndarray] = [];
    labelParts: list[np.ndarray] = [];
    with torch.inference_mode():
        for features, labels in loader:
            features = features.to(device, non_blocking=True);
            labels = labels.to(device, non_blocking=True);
            logits = model(features);
            loss = criterion(logits, labels);
            totalLoss += float(loss) * len(labels);
            sampleCount += len(labels);
            logitsParts.append(logits.cpu().numpy());
            labelParts.append(labels.cpu().numpy());
    return {
        "loss": totalLoss / sampleCount,
        "logits": np.concatenate(logitsParts).reshape(-1, classCount),
        "labels": np.concatenate(labelParts).astype(np.int64),
    };


def _fitTemperature(logits: np.ndarray, labels: np.ndarray) -> float:
    logitsTensor = torch.from_numpy(logits).float();
    labelsTensor = torch.from_numpy(labels).long();
    logTemperature = torch.zeros((), requires_grad=True);
    optimizer = torch.optim.LBFGS([logTemperature], lr=0.05, max_iter=50);

    def closure() -> torch.Tensor:
        optimizer.zero_grad();
        temperature = torch.exp(logTemperature).clamp(0.05, 20.0);
        loss = nn.functional.cross_entropy(logitsTensor / temperature, labelsTensor);
        loss.backward();
        return loss;

    optimizer.step(closure);
    return float(torch.exp(logTemperature.detach()).clamp(0.05, 20.0));


def _calculateSplitMetrics(
    evaluation: dict[str, Any],
    classIds: tuple[str, ...],
    temperature: float,
) -> tuple[dict[str, Any], np.ndarray, np.ndarray]:
    probabilities = _softmaxNumpy(evaluation["logits"] / temperature);
    predictions = np.argmax(probabilities, axis=1);
    metrics, confusionMatrix = calculateClassificationMetrics(
        evaluation["labels"],
        predictions,
        probabilities,
        classIds,
    );
    metrics["loss"] = float(evaluation["loss"]);
    return metrics, confusionMatrix, probabilities;


def _softmaxNumpy(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=1, keepdims=True);
    exponentials = np.exp(shifted);
    return exponentials / np.sum(exponentials, axis=1, keepdims=True);


def _writeModelPackage(
    stagingRoot: Path,
    modelVersion: str,
    dataset: TrainingDataset,
    result: dict[str, Any],
    config: TrainingConfig,
    labelsPath: Path,
    preprocessingConfigPath: Path,
    recognitionPolicyPath: Path,
    trainingConfigPath: Path,
    gitCommit: str,
    device: torch.device,
) -> dict[str, Any]:
    stagingRoot.mkdir(parents=True, exist_ok=False);
    copies = {
        "labels.json": labelsPath,
        "preprocessing.json": preprocessingConfigPath,
        "recognition-policy.json": recognitionPolicyPath,
        "training.json": trainingConfigPath,
    };
    for targetName, sourcePath in copies.items():
        shutil.copy2(sourcePath, stagingRoot / targetName);

    model: FingerspellingMlp = result["model"];
    checkpoint = {
        "schemaVersion": "1.0.0",
        "modelVersion": modelVersion,
        "classIds": list(dataset.classIds),
        "inputSize": config.model.inputSize,
        "hiddenSizes": list(config.model.hiddenSizes),
        "dropout": config.model.dropout,
        "temperature": result["temperature"],
        "stateDict": model.state_dict(),
    };
    torch.save(checkpoint, stagingRoot / "checkpoint.pt");
    model.eval();

    # Keep the exporter behavior stable across supported PyTorch 2.x releases.
    torch.onnx.export(
        model,
        torch.zeros(1, config.model.inputSize, dtype=torch.float32),
        stagingRoot / "model.onnx",
        input_names=["features"],
        output_names=["logits"],
        dynamic_axes={"features": {0: "batchSize"}, "logits": {0: "batchSize"}},
        opset_version=config.runtime.onnxOpsetVersion,
        do_constant_folding=True,
        dynamo=False,
    );

    metrics = {
        "schemaVersion": "1.0.0",
        "modelVersion": modelVersion,
        "bestEpoch": result["bestEpoch"],
        "completedEpochs": result["completedEpochs"],
        "validation": result["validationMetrics"],
        "test": result["testMetrics"],
    };
    _writeJson(stagingRoot / "metrics.json", metrics);
    _writeJson(
        stagingRoot / "thresholds.json",
        {
            "schemaVersion": "1.0.0",
            "temperature": result["temperature"],
            "defaultThreshold": config.calibration.defaultThreshold,
            "classes": result["thresholds"],
        },
    );
    _writeHistory(stagingRoot / "history.jsonl", result["history"]);
    _writeConfusionMatrix(stagingRoot / "validation-confusion-matrix.csv", result["validationConfusion"], dataset.classIds);
    _writeConfusionMatrix(stagingRoot / "test-confusion-matrix.csv", result["testConfusion"], dataset.classIds);

    artifactNames = [
        "checkpoint.pt",
        "model.onnx",
        "labels.json",
        "preprocessing.json",
        "recognition-policy.json",
        "training.json",
        "metrics.json",
        "thresholds.json",
        "history.jsonl",
        "validation-confusion-matrix.csv",
        "test-confusion-matrix.csv",
    ];
    packageManifest = {
        "schemaVersion": "1.0.0",
        "modelVersion": modelVersion,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "gitCommit": gitCommit,
        "dataset": {
            "version": dataset.manifest.get("datasetVersion"),
            "schemaVersion": dataset.manifest.get("schemaVersion"),
            "sampleCount": len(dataset.features),
            "acceptedBySplit": dataset.manifest.get("acceptedBySplit"),
            "identity": dataset.manifest.get("identity"),
        },
        "model": {
            "architecture": "mlp",
            "inputName": "features",
            "inputShape": ["batchSize", config.model.inputSize],
            "outputName": "logits",
            "outputShape": ["batchSize", len(dataset.classIds)],
            "classIds": list(dataset.classIds),
            "bestEpoch": result["bestEpoch"],
            "temperature": result["temperature"],
        },
        "runtime": {
            "pythonFramework": "PyTorch",
            "torchVersion": torch.__version__,
            "cudaVersion": torch.version.cuda,
            "trainingDevice": str(device),
            "deviceName": torch.cuda.get_device_name(device) if device.type == "cuda" else "CPU",
            "onnxOpsetVersion": config.runtime.onnxOpsetVersion,
        },
        "artifacts": {
            name: {"path": name, "sha256": calculateSha256(stagingRoot / name)}
            for name in artifactNames
        },
    };
    _writeJson(stagingRoot / "model-manifest.json", packageManifest);
    return packageManifest;


def _resolveDevice(requestedDevice: str) -> torch.device:
    if requestedDevice == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but is not available.");
        return torch.device("cuda");
    if requestedDevice == "auto" and torch.cuda.is_available():
        return torch.device("cuda");
    return torch.device("cpu");


def _seedRuntime(seed: int) -> None:
    random.seed(seed);
    np.random.seed(seed);
    torch.manual_seed(seed);
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed);
    torch.use_deterministic_algorithms(True, warn_only=True);


def _writeJson(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n");


def _writeHistory(path: Path, records: list[dict[str, float | int]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as outputFile:
        for record in records:
            outputFile.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n");


def _writeConfusionMatrix(path: Path, matrix: np.ndarray, classIds: tuple[str, ...]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as outputFile:
        outputFile.write("actual\\predicted," + ",".join(classIds) + "\n");
        for classId, row in zip(classIds, matrix, strict=True):
            outputFile.write(classId + "," + ",".join(str(int(value)) for value in row) + "\n");


def _validateOutputRoot(datasetRoot: Path, outputRoot: Path, overwrite: bool) -> None:
    resolvedDataset = datasetRoot.resolve();
    resolvedOutput = outputRoot.resolve();
    if resolvedDataset == resolvedOutput or resolvedDataset in resolvedOutput.parents or resolvedOutput in resolvedDataset.parents:
        raise ValueError("Dataset and model output directories must not overlap.");
    if outputRoot.exists() and not outputRoot.is_dir():
        raise ValueError(f"Model output path must be a directory: {outputRoot}");
    if outputRoot.exists() and any(outputRoot.iterdir()) and not overwrite:
        raise FileExistsError(f"Model output directory is not empty: {outputRoot}. Use --overwrite to replace it.");
    if resolvedOutput == Path(resolvedOutput.anchor):
        raise ValueError("Refusing to use a filesystem root as model output.");


def _createStagingRoot(outputRoot: Path) -> Path:
    outputRoot.parent.mkdir(parents=True, exist_ok=True);
    return outputRoot.parent / f".{outputRoot.name}.staging-{uuid.uuid4().hex}";


def _publishOutput(stagingRoot: Path, outputRoot: Path) -> None:
    backupRoot = outputRoot.parent / f".{outputRoot.name}.backup-{uuid.uuid4().hex}";
    outputExists = outputRoot.exists();
    try:
        if outputExists:
            os.replace(outputRoot, backupRoot);
        os.replace(stagingRoot, outputRoot);
    except Exception:
        if backupRoot.exists() and not outputRoot.exists():
            os.replace(backupRoot, outputRoot);
        raise;
    finally:
        if backupRoot.exists():
            shutil.rmtree(backupRoot);
