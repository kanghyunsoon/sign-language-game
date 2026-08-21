"""Train Unit 4 with pair-aware loss and auditable usability metrics.

The shared server permits only physical GPU 2.  The process masks every other
GPU before importing torch, so the permitted device appears as logical cuda:0.

Roboflow inputs are static images repeated for ten frames.  Consequently this
script records continuous-sign metrics as unavailable rather than inferring a
temporal score from duplicated frames.  Palm/back and up/down results are also
reported only as landmark-derived proxy buckets because the source dataset has
no ground-truth orientation annotations.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
from pathlib import Path

requested_gpu = os.environ.get("CUDA_VISIBLE_DEVICES")
if requested_gpu not in (None, "2"):
    raise RuntimeError(f"Physical GPU 2 is required, got CUDA_VISIBLE_DEVICES={requested_gpu!r}")
os.environ["CUDA_VISIBLE_DEVICES"] = "2"

import numpy as np
import torch
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from torch import nn
from torch.utils.data import DataLoader, TensorDataset, WeightedRandomSampler


SIMILAR_GROUPS = {
    "siot-yu": ("ㅅ", "ㅠ"),
    "yeo-ye": ("ㅕ", "ㅖ"),
    "e-ye": ("ㅔ", "ㅖ"),
    "a-o": ("ㅏ", "ㅗ"),
    "yo-ya": ("ㅛ", "ㅑ"),
    "rieul-tieut": ("ㄹ", "ㅌ"),
    "jieut-siot-chieut": ("ㅈ", "ㅅ", "ㅊ"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--batch-size", type=int, default=192)
    parser.add_argument("--seed", type=int, default=29)
    parser.add_argument("--baseline-accuracy", type=float, default=0.6789473684210526)
    parser.add_argument("--attempt-id", default="T-06")
    parser.add_argument("--feature-version", choices=("v3", "v4"), default="v3")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class ResidualBlock(nn.Module):
    def __init__(self, width: int, dropout: float) -> None:
        super().__init__()
        self.block = nn.Sequential(
            nn.LayerNorm(width),
            nn.Linear(width, width * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(width * 2, width),
            nn.Dropout(dropout * 0.65),
        )

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        return value + self.block(value)


class PairAwareClassifier(nn.Module):
    def __init__(self, feature_size: int, class_count: int) -> None:
        super().__init__()
        self.input = nn.Sequential(nn.LayerNorm(feature_size), nn.Linear(feature_size, 320), nn.GELU())
        self.blocks = nn.Sequential(ResidualBlock(320, 0.20), ResidualBlock(320, 0.16))
        self.head = nn.Sequential(nn.LayerNorm(320), nn.Linear(320, 192), nn.GELU(), nn.Dropout(0.12), nn.Linear(192, class_count))

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        pooled = value.mean(dim=1)
        return self.head(self.blocks(self.input(pooled)))


def evaluate(
    model: nn.Module, loader: DataLoader, device: torch.device,
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


def pair_margin_loss(
    logits: torch.Tensor,
    targets: torch.Tensor,
    confusing_indexes: dict[int, tuple[int, ...]],
    margin: float = 0.55,
) -> torch.Tensor:
    losses = []
    for class_index, competitors in confusing_indexes.items():
        selected = targets == class_index
        if not selected.any() or not competitors:
            continue
        selected_logits = logits[selected]
        true_score = selected_logits[:, class_index]
        rival_score = selected_logits[:, list(competitors)].max(dim=1).values
        losses.append(torch.relu(margin - true_score + rival_score).mean())
    return torch.stack(losses).mean() if losses else logits.new_zeros(())


def accuracy_slice(truth: np.ndarray, predicted: np.ndarray, mask: np.ndarray) -> dict[str, float | int | None]:
    support = int(mask.sum())
    return {
        "support": support,
        "accuracy": float((truth[mask] == predicted[mask]).mean()) if support else None,
    }


def similar_group_metrics(
    truth: np.ndarray,
    predicted: np.ndarray,
    classes: tuple[str, ...],
) -> dict[str, dict[str, object]]:
    label_truth = np.asarray([classes[index] for index in truth])
    label_predicted = np.asarray([classes[index] for index in predicted])
    result = {}
    for name, labels in SIMILAR_GROUPS.items():
        mask = np.isin(label_truth, labels)
        support = int(mask.sum())
        within_confusion = mask & (label_truth != label_predicted) & np.isin(label_predicted, labels)
        result[name] = {
            "labels": list(labels),
            **accuracy_slice(truth, predicted, mask),
            "withinGroupConfusions": int(within_confusion.sum()),
            "withinGroupConfusionRate": float(within_confusion.sum() / support) if support else None,
        }
    return result


def categorical_slices(
    truth: np.ndarray,
    predicted: np.ndarray,
    values: np.ndarray,
) -> dict[str, dict[str, float | int | None]]:
    return {
        str(value): accuracy_slice(truth, predicted, values == value)
        for value in sorted(set(values.astype(str)))
    }


def threshold_metrics(
    truth: np.ndarray,
    predicted: np.ndarray,
    confidence: np.ndarray,
    threshold: float,
) -> dict[str, float | int | None]:
    accepted = confidence >= threshold
    accepted_count = int(accepted.sum())
    correct = truth == predicted
    return {
        "threshold": threshold,
        "accepted": accepted_count,
        "coverage": float(accepted.mean()),
        "acceptedAccuracy": float(correct[accepted].mean()) if accepted_count else None,
        "falseConfirmationRateAllSamples": float((accepted & ~correct).mean()),
    }


def choose_operating_point(
    truth: np.ndarray,
    predicted: np.ndarray,
    confidence: np.ndarray,
    minimum_accuracy: float = 0.90,
) -> dict[str, float | int | None]:
    candidates = [threshold_metrics(truth, predicted, confidence, float(value)) for value in np.arange(0.50, 0.951, 0.025)]
    eligible = [row for row in candidates if row["acceptedAccuracy"] is not None and row["acceptedAccuracy"] >= minimum_accuracy]
    selected = max(eligible, key=lambda row: (row["coverage"], -row["threshold"])) if eligible else max(candidates, key=lambda row: row["acceptedAccuracy"] or 0.0)
    return {"targetAcceptedAccuracy": minimum_accuracy, "selected": selected, "sweep": candidates}


def main() -> None:
    args = parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; refusing to run Unit 4 on CPU")
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    torch.backends.cudnn.benchmark = True
    device = torch.device("cuda:0")

    payload = np.load(args.features)
    features = payload["features"].astype(np.float32)
    labels = payload["labels"].astype(str)
    splits = payload["splits"].astype(str)
    handedness = payload["handedness"].astype(str)
    if features.ndim != 3 or features.shape[1] != 10:
        raise RuntimeError(f"Expected [samples, 10, features], got {features.shape}")
    feature_size = int(features.shape[-1])
    expected_feature_size = 78 if args.feature_version == "v3" else 351
    if feature_size != expected_feature_size:
        raise RuntimeError(f"{args.feature_version} requires {expected_feature_size} features, got {feature_size}")
    classes = tuple(sorted(set(labels)))
    class_to_index = {label: index for index, label in enumerate(classes)}
    targets = np.asarray([class_to_index[label] for label in labels], dtype=np.int64)

    partitions = {}
    partition_indexes = {}
    for split in ("train", "valid", "test"):
        indexes = np.flatnonzero(splits == split)
        if not len(indexes):
            raise RuntimeError(f"Required {split} partition is empty")
        partition_indexes[split] = indexes
        partitions[split] = (features[indexes], targets[indexes])

    train_targets = partitions["train"][1]
    class_counts = np.bincount(train_targets, minlength=len(classes)).astype(np.float32)
    class_weights = np.sqrt(class_counts.max() / np.maximum(class_counts, 1.0))
    sample_weights = class_weights[train_targets]
    generator = torch.Generator().manual_seed(args.seed)
    sampler = WeightedRandomSampler(torch.from_numpy(sample_weights), len(sample_weights), replacement=True, generator=generator)
    train_loader = DataLoader(
        TensorDataset(torch.from_numpy(partitions["train"][0]), torch.from_numpy(train_targets)),
        batch_size=args.batch_size, sampler=sampler, num_workers=2, pin_memory=True,
    )
    valid_loader = DataLoader(
        TensorDataset(torch.from_numpy(partitions["valid"][0]), torch.from_numpy(partitions["valid"][1])),
        batch_size=512, num_workers=2, pin_memory=True,
    )
    test_loader = DataLoader(
        TensorDataset(torch.from_numpy(partitions["test"][0]), torch.from_numpy(partitions["test"][1])),
        batch_size=512, num_workers=2, pin_memory=True,
    )

    confusing_indexes: dict[int, set[int]] = {index: set() for index in range(len(classes))}
    for group in SIMILAR_GROUPS.values():
        present = [class_to_index[label] for label in group if label in class_to_index]
        for class_index in present:
            confusing_indexes[class_index].update(index for index in present if index != class_index)
    confusing_tuples = {key: tuple(sorted(value)) for key, value in confusing_indexes.items()}

    model = PairAwareClassifier(feature_size, len(classes)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=9.0e-4, weight_decay=2.0e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", patience=7, factor=0.55)
    loss_fn = nn.CrossEntropyLoss(weight=torch.from_numpy(class_weights).to(device), label_smoothing=0.035)
    best_state, best_score, stale, history = None, -1.0, 0, []

    for epoch in range(1, args.epochs + 1):
        model.train()
        losses = []
        for values, target_batch in train_loader:
            values = values.to(device, non_blocking=True)
            target_batch = target_batch.to(device, non_blocking=True)
            jitter = torch.randn_like(values) * 0.009
            values = values + jitter
            optimizer.zero_grad(set_to_none=True)
            logits = model(values)
            loss = loss_fn(logits, target_batch) + 0.28 * pair_margin_loss(logits, target_batch, confusing_tuples)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 4.0)
            optimizer.step()
            losses.append(float(loss.detach().cpu()))
        valid_truth, valid_predicted, _ = evaluate(model, valid_loader, device)
        valid_accuracy = float((valid_truth == valid_predicted).mean())
        valid_macro_f1 = float(f1_score(valid_truth, valid_predicted, average="macro", zero_division=0))
        selection_score = 0.55 * valid_macro_f1 + 0.45 * valid_accuracy
        scheduler.step(selection_score)
        history.append({
            "epoch": epoch,
            "loss": float(np.mean(losses)),
            "validationAccuracy": valid_accuracy,
            "validationMacroF1": valid_macro_f1,
            "selectionScore": selection_score,
        })
        print(json.dumps(history[-1]), flush=True)
        if selection_score > best_score:
            best_score, stale = selection_score, 0
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
        else:
            stale += 1
            if stale >= 18:
                break

    assert best_state is not None
    model.load_state_dict(best_state)
    valid_truth, valid_predicted, valid_confidence = evaluate(model, valid_loader, device)
    test_truth, test_predicted, test_confidence = evaluate(model, test_loader, device)
    validation_operating_point = choose_operating_point(valid_truth, valid_predicted, valid_confidence)
    chosen_threshold = float(validation_operating_point["selected"]["threshold"])
    test_operating_point = threshold_metrics(test_truth, test_predicted, test_confidence, chosen_threshold)

    matrix = confusion_matrix(test_truth, test_predicted, labels=range(len(classes)))
    mistakes = []
    for expected in range(len(classes)):
        for observed in range(len(classes)):
            if expected != observed and matrix[expected, observed]:
                mistakes.append({"expected": classes[expected], "predicted": classes[observed], "count": int(matrix[expected, observed])})
    mistakes.sort(key=lambda row: row["count"], reverse=True)

    test_indexes = partition_indexes["test"]
    test_features = features[test_indexes, 0]
    middle_mcp_y = payload["vertical_direction_y"][test_indexes] if "vertical_direction_y" in payload else test_features[:, 8 * 3 + 1]
    vertical_proxy = np.where(middle_mcp_y <= -0.15, "fingers-up", np.where(middle_mcp_y >= 0.15, "fingers-down", "sideways"))
    palm_normal_z = payload["palm_normal_z"][test_indexes] if "palm_normal_z" in payload else test_features[:, -1]
    palm_proxy = np.where(palm_normal_z >= 0.20, "normal-z-positive", np.where(palm_normal_z <= -0.20, "normal-z-negative", "edge-on"))

    test_accuracy = float((test_truth == test_predicted).mean())
    report = {
        "experiment": f"roboflow-jamo-static-mediapipe-{args.feature_version}-{args.attempt_id.lower()}-pair-aware-gpu",
        "attempt": {
            "attemptId": args.attempt_id,
            "seed": args.seed,
            "requestedEpochs": args.epochs,
            "completedEpochs": len(history),
            "batchSize": args.batch_size,
            "checkpointSelection": "0.55 * validation macro-F1 + 0.45 * validation accuracy",
        },
        "dataset": {
            "source": "Roboflow Sign Language v1",
            "sourceUrl": "https://universe.roboflow.com/-q9ifs/sign-language-2hatp/dataset/1",
            "license": "CC BY 4.0",
            "acceptedLandmarkSamples": int(len(features)),
            "featureArtifact": str(args.features),
            "featureArtifactSha256": sha256(args.features),
            "splitPolicy": "source-provided train/valid/test folders; not signer-independent",
            "augmentationCaveat": "source export includes augmentation; static images are repeated to ten frames",
        },
        "physicalGpu": 2,
        "logicalCudaDevice": 0,
        "gpuName": torch.cuda.get_device_name(device),
        "techniques": [
            "sqrt-inverse-frequency weighted sampling and loss",
            "pair-aware logit margin for documented confusing jamo groups",
            "residual MLP with feature jitter and label smoothing",
            "checkpoint selection using validation macro-F1 and accuracy",
            "validation-selected confidence operating point targeting 90% accepted accuracy",
            *( ["palm-local coordinate frame and 210 rotation-invariant landmark-pair distances"] if args.feature_version == "v4" else [] ),
        ],
        "featureContract": f"10 repeated frames x {feature_size}-value MediaPipe {args.feature_version} feature",
        "importantLimitations": [
            "Static repeated images do not measure continuous fingerspelling.",
            "Roboflow splits do not establish signer independence.",
            "Palm/back and up/down source labels do not exist; reported orientation buckets are derived proxies, not ground truth.",
        ],
        "samples": {split: int(len(partitions[split][0])) for split in partitions},
        "classes": list(classes),
        "baselineTestAccuracy": args.baseline_accuracy,
        "testAccuracy": test_accuracy,
        "testAccuracyDeltaPercentagePoints": (test_accuracy - args.baseline_accuracy) * 100.0,
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
            "testAtValidationSelectedThreshold": test_operating_point,
            "continuousSequence": {
                "status": "not-measured",
                "reason": "source contains static images repeated for ten frames",
                "requiredMetrics": ["character error rate", "confirmation coverage", "false confirmations per minute", "p50/p95 confirmation latency"],
            },
        },
        "topConfusions": mistakes[:30],
        "history": history,
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    torch.save({"state_dict": best_state, "classes": classes, "featureContract": f"10x{feature_size}", "experiment": report["experiment"]}, args.output_dir / "model.pt")
    print(json.dumps({
        "testAccuracy": test_accuracy,
        "testMacroF1": report["testMacroF1"],
        "deltaPercentagePoints": report["testAccuracyDeltaPercentagePoints"],
        "report": str(args.output_dir / "evaluation.json"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
