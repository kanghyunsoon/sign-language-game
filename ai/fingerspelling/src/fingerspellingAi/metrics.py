"""Dependency-light classification metrics and threshold calibration.""";

from typing import Any;

import numpy as np;

from .trainingConfig import CalibrationConfig;


def calculateClassificationMetrics(
    labelIndices: np.ndarray,
    predictions: np.ndarray,
    probabilities: np.ndarray,
    classIds: tuple[str, ...],
) -> tuple[dict[str, Any], np.ndarray]:
    labels = np.asarray(labelIndices, dtype=np.int64);
    predicted = np.asarray(predictions, dtype=np.int64);
    scores = np.asarray(probabilities, dtype=np.float64);
    classCount = len(classIds);
    if labels.ndim != 1 or predicted.shape != labels.shape:
        raise ValueError("Labels and predictions must be matching one-dimensional arrays.");
    if scores.shape != (len(labels), classCount):
        raise ValueError("Probabilities must have shape [N, classCount].");
    if len(labels) == 0:
        raise ValueError("Metrics require at least one sample.");

    confusionMatrix = np.zeros((classCount, classCount), dtype=np.int64);
    np.add.at(confusionMatrix, (labels, predicted), 1);
    perClass: dict[str, dict[str, float | int]] = {};
    f1Scores: list[float] = [];
    recalls: list[float] = [];
    precisions: list[float] = [];
    for classIndex, classId in enumerate(classIds):
        truePositive = int(confusionMatrix[classIndex, classIndex]);
        falsePositive = int(confusionMatrix[:, classIndex].sum() - truePositive);
        falseNegative = int(confusionMatrix[classIndex, :].sum() - truePositive);
        support = int(confusionMatrix[classIndex, :].sum());
        precision = _safeDivide(truePositive, truePositive + falsePositive);
        recall = _safeDivide(truePositive, truePositive + falseNegative);
        f1 = _safeDivide(2.0 * precision * recall, precision + recall);
        falseAcceptRate = _safeDivide(falsePositive, len(labels) - support);
        perClass[classId] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "support": support,
            "falseAcceptRate": falseAcceptRate,
        };
        precisions.append(precision);
        recalls.append(recall);
        f1Scores.append(f1);

    trueNone = labels == 0;
    acceptedSignOnNone = int(np.sum(trueNone & (predicted != 0)));
    metrics = {
        "sampleCount": len(labels),
        "accuracy": float(np.mean(labels == predicted)),
        "macroPrecision": float(np.mean(precisions)),
        "macroRecall": float(np.mean(recalls)),
        "macroF1": float(np.mean(f1Scores)),
        "expectedCalibrationError": calculateExpectedCalibrationError(labels, predicted, scores),
        "signFalseAcceptRateOnNone": _safeDivide(acceptedSignOnNone, int(np.sum(trueNone))),
        "perClass": perClass,
    };
    return metrics, confusionMatrix;


def calculateExpectedCalibrationError(
    labels: np.ndarray,
    predictions: np.ndarray,
    probabilities: np.ndarray,
    binCount: int = 15,
) -> float:
    confidence = probabilities.max(axis=1);
    correctness = predictions == labels;
    error = 0.0;
    boundaries = np.linspace(0.0, 1.0, binCount + 1);
    for index in range(binCount):
        lower = boundaries[index];
        upper = boundaries[index + 1];
        inBin = (confidence > lower) & (confidence <= upper);
        if not np.any(inBin):
            continue;
        error += float(np.mean(inBin)) * abs(float(np.mean(correctness[inBin])) - float(np.mean(confidence[inBin])));
    return error;


def calibrateClassThresholds(
    labels: np.ndarray,
    probabilities: np.ndarray,
    classIds: tuple[str, ...],
    config: CalibrationConfig,
) -> dict[str, dict[str, float | int | str]]:
    thresholds: dict[str, dict[str, float | int | str]] = {};
    for classIndex, classId in enumerate(classIds):
        positive = labels == classIndex;
        support = int(np.sum(positive));
        if support < config.minimumValidationSamplesPerClass:
            thresholds[classId] = {
                "threshold": config.defaultThreshold,
                "source": "default_insufficient_validation_samples",
                "validationSupport": support,
            };
            continue;
        scores = probabilities[:, classIndex];
        candidates = np.unique(
            np.concatenate(
                [
                    np.asarray([config.defaultThreshold]),
                    np.clip(scores, config.minimumThreshold, config.maximumThreshold),
                ],
            ),
        );
        bestThreshold = config.defaultThreshold;
        bestMetrics = (-1.0, -1.0, -1.0);
        for threshold in candidates:
            predictedPositive = scores >= threshold;
            truePositive = int(np.sum(predictedPositive & positive));
            falsePositive = int(np.sum(predictedPositive & ~positive));
            falseNegative = int(np.sum(~predictedPositive & positive));
            precision = _safeDivide(truePositive, truePositive + falsePositive);
            recall = _safeDivide(truePositive, truePositive + falseNegative);
            f1 = _safeDivide(2.0 * precision * recall, precision + recall);
            score = (f1, precision, float(threshold));
            if score > bestMetrics:
                bestMetrics = score;
                bestThreshold = float(threshold);
        thresholds[classId] = {
            "threshold": bestThreshold,
            "source": "validation_f1",
            "validationSupport": support,
            "precision": bestMetrics[1],
            "f1": bestMetrics[0],
        };
    return thresholds;


def _safeDivide(numerator: float, denominator: float) -> float:
    return float(numerator / denominator) if denominator else 0.0;
