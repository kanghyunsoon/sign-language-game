"""ONNX single-frame inference for packaged fingerspelling models.""";

import json;
from pathlib import Path;
from typing import Any;

import numpy as np;

from .config import calculateSha256, loadJson;


class OnnxFrameClassifier:
    def __init__(self, packageRoot: Path) -> None:
        try:
            import onnxruntime as ort;
        except ImportError as error:
            raise RuntimeError("ONNX Runtime is required for packaged model inference.") from error;

        self.packageRoot = packageRoot.resolve();
        manifestPath = self.packageRoot / "model-manifest.json";
        thresholdsPath = self.packageRoot / "thresholds.json";
        self.manifest = loadJson(manifestPath);
        thresholds = loadJson(thresholdsPath);
        self._validatePackage();
        self.classIds = tuple(self.manifest["model"]["classIds"]);
        self.temperature = float(thresholds["temperature"]);
        self.thresholds = {
            classId: float(thresholds["classes"][classId]["threshold"])
            for classId in self.classIds
        };
        self.session = ort.InferenceSession(
            str(self.packageRoot / "model.onnx"),
            providers=ort.get_available_providers(),
        );

    def predict(self, features: np.ndarray | list[float], topK: int = 3) -> dict[str, Any]:
        values = np.asarray(features, dtype=np.float32);
        if values.shape == (63,):
            values = values.reshape(1, 63);
        if values.shape != (1, 63):
            raise ValueError(f"Single-frame features must have shape [63] or [1, 63], received {values.shape}.");
        if not np.isfinite(values).all():
            raise ValueError("Single-frame features contain NaN or Infinity.");
        logits = self.session.run(["logits"], {"features": values})[0];
        probabilities = _softmax(logits / self.temperature)[0];
        candidateCount = min(max(int(topK), 1), len(self.classIds));
        topIndices = np.argsort(probabilities)[::-1][:candidateCount];
        predictedIndex = int(topIndices[0]);
        labelId = self.classIds[predictedIndex];
        confidence = float(probabilities[predictedIndex]);
        return {
            "modelVersion": self.manifest["modelVersion"],
            "labelId": labelId,
            "classIndex": predictedIndex,
            "confidence": confidence,
            "classThreshold": self.thresholds[labelId],
            "accepted": confidence >= self.thresholds[labelId],
            "topCandidates": [
                {
                    "labelId": self.classIds[int(index)],
                    "classIndex": int(index),
                    "confidence": float(probabilities[index]),
                }
                for index in topIndices
            ],
        };

    def _validatePackage(self) -> None:
        if self.manifest.get("schemaVersion") != "1.0.0":
            raise ValueError("Unsupported model package schema version.");
        if self.manifest.get("model", {}).get("inputShape") != ["batchSize", 63]:
            raise ValueError("Model package input shape must be [batchSize, 63].");
        artifacts = self.manifest.get("artifacts", {});
        requiredArtifacts = ("model.onnx", "thresholds.json", "labels.json", "preprocessing.json");
        for name in requiredArtifacts:
            artifact = artifacts.get(name);
            if not isinstance(artifact, dict) or artifact.get("path") != name:
                raise ValueError(f"Model package artifact is missing: {name}");
            artifactPath = (self.packageRoot / name).resolve();
            if self.packageRoot not in artifactPath.parents or not artifactPath.is_file():
                raise ValueError(f"Model package artifact path is invalid: {name}");
            if calculateSha256(artifactPath) != artifact.get("sha256"):
                raise ValueError(f"Model package artifact hash mismatch: {name}");


def loadFeaturesJson(path: Path) -> np.ndarray:
    payload = json.loads(path.read_text(encoding="utf-8"));
    values = payload["features"] if isinstance(payload, dict) and "features" in payload else payload;
    return np.asarray(values, dtype=np.float32);


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=1, keepdims=True);
    exponentials = np.exp(shifted);
    return exponentials / np.sum(exponentials, axis=1, keepdims=True);
