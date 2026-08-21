"""Audit an existing Unit 3 model with the Unit 4 metric schema."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

requested_gpu = os.environ.get("CUDA_VISIBLE_DEVICES")
if requested_gpu not in (None, "2"):
    raise RuntimeError(f"Physical GPU 2 is required, got CUDA_VISIBLE_DEVICES={requested_gpu!r}")
os.environ["CUDA_VISIBLE_DEVICES"] = "2"

import numpy as np
import torch
from sklearn.metrics import classification_report, f1_score
from torch.utils.data import DataLoader, TensorDataset

from train_roboflow_jamo_gpu import JamoClassifier, evaluate as evaluate_labels
from train_roboflow_jamo_gpu_v4 import (
    categorical_slices,
    choose_operating_point,
    similar_group_metrics,
    threshold_metrics,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def evaluate_with_confidence(
    model: torch.nn.Module,
    loader: DataLoader,
    device: torch.device,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    model.eval()
    truth, predicted, confidence = [], [], []
    with torch.no_grad():
        for values, labels in loader:
            probabilities = model(values.to(device)).softmax(dim=1).cpu()
            scores, guesses = probabilities.max(dim=1)
            truth.extend(labels.numpy().tolist())
            predicted.extend(guesses.numpy().tolist())
            confidence.extend(scores.numpy().tolist())
    return np.asarray(truth), np.asarray(predicted), np.asarray(confidence)


def main() -> None:
    args = parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; refusing to audit the GPU model on CPU")
    device = torch.device("cuda:0")
    payload = np.load(args.features)
    features = payload["features"].astype(np.float32)
    labels = payload["labels"].astype(str)
    splits = payload["splits"].astype(str)
    handedness = payload["handedness"].astype(str)
    # This checkpoint was produced locally by the trusted Unit 3 trainer and
    # contains NumPy scalar metadata that PyTorch's restricted loader rejects.
    checkpoint = torch.load(args.model, map_location="cpu", weights_only=False)
    classes = tuple(checkpoint["classes"])
    class_to_index = {label: index for index, label in enumerate(classes)}
    targets = np.asarray([class_to_index[label] for label in labels], dtype=np.int64)
    model = JamoClassifier(features.shape[-1], len(classes)).to(device)
    model.load_state_dict(checkpoint["state_dict"])

    evaluated = {}
    indexes_by_split = {}
    for split in ("valid", "test"):
        indexes = np.flatnonzero(splits == split)
        indexes_by_split[split] = indexes
        loader = DataLoader(
            TensorDataset(torch.from_numpy(features[indexes]), torch.from_numpy(targets[indexes])),
            batch_size=512,
            num_workers=2,
            pin_memory=True,
        )
        evaluated[split] = evaluate_with_confidence(model, loader, device)

    valid_truth, valid_predicted, valid_confidence = evaluated["valid"]
    test_truth, test_predicted, test_confidence = evaluated["test"]
    validation_operating_point = choose_operating_point(valid_truth, valid_predicted, valid_confidence)
    chosen_threshold = float(validation_operating_point["selected"]["threshold"])
    test_indexes = indexes_by_split["test"]
    test_features = features[test_indexes, 0]
    middle_mcp_y = test_features[:, 8 * 3 + 1]
    vertical_proxy = np.where(middle_mcp_y <= -0.15, "fingers-up", np.where(middle_mcp_y >= 0.15, "fingers-down", "sideways"))
    palm_normal_z = test_features[:, -1]
    palm_proxy = np.where(palm_normal_z >= 0.20, "normal-z-positive", np.where(palm_normal_z <= -0.20, "normal-z-negative", "edge-on"))

    report = {
        "experiment": "roboflow-jamo-static-mediapipe-v3-gpu-condition-audit",
        "attempt": {
            "attemptId": args.output.parent.name + "-condition-audit",
            "operation": "post-training audit; model weights unchanged",
        },
        "dataset": {
            "source": "Roboflow Sign Language v1",
            "sourceUrl": "https://universe.roboflow.com/-q9ifs/sign-language-2hatp/dataset/1",
            "license": "CC BY 4.0",
            "acceptedLandmarkSamples": int(len(features)),
            "featureArtifact": str(args.features),
            "featureArtifactSha256": sha256(args.features),
            "splitPolicy": "source-provided train/valid/test folders; not signer-independent",
        },
        "physicalGpu": 2,
        "logicalCudaDevice": 0,
        "gpuName": torch.cuda.get_device_name(device),
        "sourceModel": str(args.model),
        "testAccuracy": float((test_truth == test_predicted).mean()),
        "testMacroF1": float(f1_score(test_truth, test_predicted, average="macro", zero_division=0)),
        "testByClass": classification_report(test_truth, test_predicted, labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0),
        "similarGroupMetrics": similar_group_metrics(test_truth, test_predicted, classes),
        "conditionMetrics": {
            "detectedHandedness": {
                "evidenceLevel": "MediaPipe-detected, not manually annotated",
                "slices": categorical_slices(test_truth, test_predicted, handedness[test_indexes]),
            },
            "verticalOrientationProxy": {
                "evidenceLevel": "derived from wrist-to-middle-MCP y direction; not annotated up/down ground truth",
                "slices": categorical_slices(test_truth, test_predicted, vertical_proxy),
            },
            "palmFacingProxy": {
                "evidenceLevel": "derived from palm-normal z; not annotated palm/back ground truth",
                "slices": categorical_slices(test_truth, test_predicted, palm_proxy),
            },
        },
        "usabilityMetrics": {
            "validationOperatingPoint": validation_operating_point,
            "testAtValidationSelectedThreshold": threshold_metrics(test_truth, test_predicted, test_confidence, chosen_threshold),
            "continuousSequence": {
                "status": "not-measured",
                "reason": "source contains static images repeated for ten frames",
            },
        },
        "importantLimitations": [
            "Static repeated images do not measure continuous fingerspelling.",
            "Roboflow splits do not establish signer independence.",
            "Orientation buckets are landmark-derived proxies, not annotated palm/back or up/down truth.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "testAccuracy": report["testAccuracy"],
        "testMacroF1": report["testMacroF1"],
        "report": str(args.output),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
