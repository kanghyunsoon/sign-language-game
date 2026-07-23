"""Validation-selected ensemble audit for T-13..T-16 on physical GPU 2."""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from pillow_heif import register_heif_opener
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from torchvision.models import efficientnet_b0

from train_roboflow_jamo_image_t10 import (
    JAMO_LABELS,
    choose_threshold,
    class_floor_metrics,
    similar_metrics,
    threshold_metrics,
)


class Rows(Dataset):
    def __init__(self, root: Path, sources: np.ndarray, targets: np.ndarray, transform) -> None:
        self.root, self.sources, self.targets, self.transform = root, sources, targets, transform

    def __len__(self) -> int:
        return len(self.targets)

    def __getitem__(self, index: int):
        source = Path(str(self.sources[index]))
        with Image.open(source if source.is_absolute() else self.root / source) as image:
            return self.transform(image.convert("RGB")), int(self.targets[index])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--number-root", type=Path, required=True)
    parser.add_argument("--checkpoints", type=Path, nargs="+", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--validation-seed", type=int, default=83)
    parser.add_argument("--number-valid-fraction", type=float, default=0.15)
    parser.add_argument("--class-target", type=float, default=0.93)
    parser.add_argument("--attempt-id", default="T-17")
    return parser.parse_args()


def load_rows(args: argparse.Namespace):
    rows = []
    for path in sorted(args.dataset_root.rglob("*")):
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        relative = path.relative_to(args.dataset_root)
        if len(relative.parts) >= 3 and relative.parts[0] in {"valid", "test"} and relative.parts[1] in JAMO_LABELS:
            rows.append((relative.as_posix(), JAMO_LABELS[relative.parts[1]], relative.parts[0], "jamo31"))
    number_train: dict[str, list[Path]] = {}
    for path in sorted((args.number_root / "train").rglob("*")):
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".heic"}:
            label = "NUM_0" if path.parent.name in {"10-1", "10-2"} else f"NUM_{path.parent.name}"
            number_train.setdefault(label, []).append(path.resolve())
    rng = random.Random(args.validation_seed)
    for label, paths in sorted(number_train.items()):
        paths = paths[:]
        rng.shuffle(paths)
        count = max(1, round(len(paths) * args.number_valid_fraction))
        rows.extend((path.as_posix(), label, "valid", "numbers10") for path in paths[:count])
    for path in sorted((args.number_root / "test").rglob("*")):
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".heic"}:
            label = "NUM_0" if path.parent.name in {"10-1", "10-2"} else f"NUM_{path.parent.name}"
            rows.append((path.resolve().as_posix(), label, "test", "numbers10"))
    classes = tuple(sorted({row[1] for row in rows}))
    mapping = {label: index for index, label in enumerate(classes)}
    sources = np.asarray([row[0] for row in rows])
    targets = np.asarray([mapping[row[1]] for row in rows], dtype=np.int64)
    splits = np.asarray([row[2] for row in rows])
    domains = np.asarray([row[3] for row in rows])
    return sources, targets, splits, domains, classes


def build_model(checkpoint: dict, class_count: int, device: torch.device) -> nn.Module:
    if checkpoint.get("architecture") != "efficientnet_b0":
        raise ValueError(f"Unsupported architecture: {checkpoint.get('architecture')}")
    model = efficientnet_b0(weights=None)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, class_count)
    model.load_state_dict(checkpoint["state_dict"])
    return model.to(device).eval()


def probabilities(model: nn.Module, loader: DataLoader, device: torch.device):
    truth, values = [], []
    with torch.no_grad():
        for images, labels in loader:
            values.append(model(images.to(device, non_blocking=True)).softmax(1).cpu().numpy())
            truth.extend(labels.numpy().tolist())
    return np.asarray(truth), np.concatenate(values)


def score_candidate(truth: np.ndarray, scores: np.ndarray, class_count: int) -> dict:
    predicted = scores.argmax(1)
    accuracy = float((truth == predicted).mean())
    macro = float(f1_score(truth, predicted, average="macro", zero_division=0))
    floor = class_floor_metrics(truth, predicted, class_count)
    selection = (
        0.15 * accuracy + 0.20 * macro + 0.15 * floor["minRecall"] + 0.15 * floor["minF1"]
        + 0.175 * floor["q10Recall"] + 0.175 * floor["q10F1"]
    )
    return {"accuracy": accuracy, "macroF1": macro, **floor, "selectionScore": selection}


def normalized(scores: np.ndarray) -> np.ndarray:
    total = scores.sum(1, keepdims=True)
    return scores / np.maximum(total, 1e-12)


def main() -> None:
    args = parse_args()
    register_heif_opener()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable; physical GPU 2 is required")
    device = torch.device("cuda:0")
    sources, targets, splits, domains, classes = load_rows(args)
    transform = transforms.Compose([
        transforms.Resize(248), transforms.CenterCrop(224), transforms.ToTensor(),
        transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
    ])
    indexes = {name: np.flatnonzero(splits == name) for name in ("valid", "test")}
    loaders = {
        name: DataLoader(Rows(args.dataset_root, sources[index], targets[index], transform), batch_size=args.batch_size, shuffle=False, num_workers=4, pin_memory=True)
        for name, index in indexes.items()
    }

    names, valid_probs, test_probs = [], [], []
    valid_truth = test_truth = None
    for path in args.checkpoints:
        checkpoint = torch.load(path, map_location="cpu", weights_only=False)
        if tuple(checkpoint["classes"]) != classes:
            raise ValueError(f"Class order mismatch in {path}")
        model = build_model(checkpoint, len(classes), device)
        current_valid_truth, current_valid = probabilities(model, loaders["valid"], device)
        current_test_truth, current_test = probabilities(model, loaders["test"], device)
        if valid_truth is not None and not np.array_equal(valid_truth, current_valid_truth):
            raise RuntimeError("Validation order changed")
        valid_truth, test_truth = current_valid_truth, current_test_truth
        names.append(path.parent.name); valid_probs.append(current_valid); test_probs.append(current_test)
        del model
        torch.cuda.empty_cache()

    candidates: dict[str, tuple[np.ndarray, np.ndarray, dict]] = {}
    for index, name in enumerate(names):
        candidates[f"single:{name}"] = (valid_probs[index], test_probs[index], {"models": [name]})
    candidates["mean-all"] = (np.mean(valid_probs, axis=0), np.mean(test_probs, axis=0), {"models": names})

    validation_reports = [
        classification_report(valid_truth, values.argmax(1), labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0)
        for values in valid_probs
    ]
    expert_indexes = []
    for label in classes:
        expert_indexes.append(max(range(len(names)), key=lambda i: (
            validation_reports[i][label]["f1-score"], validation_reports[i][label]["recall"], validation_reports[i][label]["precision"]
        )))
    class_valid = np.column_stack([valid_probs[model_index][:, class_index] for class_index, model_index in enumerate(expert_indexes)])
    class_test = np.column_stack([test_probs[model_index][:, class_index] for class_index, model_index in enumerate(expert_indexes)])
    candidates["class-expert"] = (normalized(class_valid), normalized(class_test), {"classExperts": {classes[i]: names[m] for i, m in enumerate(expert_indexes)}})

    jamo_indexes = [i for i, label in enumerate(classes) if not label.startswith("NUM_")]
    number_indexes = [i for i, label in enumerate(classes) if label.startswith("NUM_")]
    for jamo_model in range(len(names)):
        for number_model in range(len(names)):
            val = np.zeros_like(valid_probs[0]); test = np.zeros_like(test_probs[0])
            val[:, jamo_indexes] = valid_probs[jamo_model][:, jamo_indexes]
            val[:, number_indexes] = valid_probs[number_model][:, number_indexes]
            test[:, jamo_indexes] = test_probs[jamo_model][:, jamo_indexes]
            test[:, number_indexes] = test_probs[number_model][:, number_indexes]
            key = f"domain-expert:jamo={names[jamo_model]}:numbers={names[number_model]}"
            candidates[key] = (normalized(val), normalized(test), {"jamoModel": names[jamo_model], "numberModel": names[number_model]})

    validation_candidates = {name: score_candidate(valid_truth, values[0], len(classes)) for name, values in candidates.items()}
    selected_name = max(validation_candidates, key=lambda name: validation_candidates[name]["selectionScore"])
    selected_valid, selected_test, selected_policy = candidates[selected_name]
    test_pred = selected_test.argmax(1); test_conf = selected_test.max(1)
    valid_pred = selected_valid.argmax(1); valid_conf = selected_valid.max(1)
    test_report = classification_report(test_truth, test_pred, labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0)
    floor = class_floor_metrics(test_truth, test_pred, len(classes))
    below = [label for label in classes if test_report[label]["recall"] < args.class_target or test_report[label]["f1-score"] < args.class_target]
    threshold = choose_threshold(valid_truth, valid_pred, valid_conf)["selected"]["threshold"]
    domain_metrics = {}
    test_domains = domains[indexes["test"]]
    for domain in sorted(set(test_domains)):
        mask = test_domains == domain
        domain_metrics[domain] = {"support": int(mask.sum()), "accuracy": float((test_truth[mask] == test_pred[mask]).mean()), "macroF1": float(f1_score(test_truth[mask], test_pred[mask], average="macro", zero_division=0))}
    report = {
        "attempt": args.attempt_id, "physicalGpu": 2, "logicalCudaDevice": 0,
        "dataset": {"samples": {name: int(len(index)) for name, index in indexes.items()}, "validationSeed": args.validation_seed, "warning": "Number validation comes from provider train and overlaps model training differently; development comparison only."},
        "models": names, "selectedCandidate": selected_name, "selectedPolicy": selected_policy,
        "validationCandidates": validation_candidates,
        "testAccuracy": float((test_truth == test_pred).mean()), "testMacroF1": float(f1_score(test_truth, test_pred, average="macro", zero_division=0)),
        "testByClass": test_report, "classGate": {"target": args.class_target, **floor, "belowTarget": below, "passed": not below},
        "domainMetrics": domain_metrics, "similarGroupMetrics": similar_metrics(test_truth, test_pred, classes),
        "usabilityMetrics": {"validationOperatingPoint": choose_threshold(valid_truth, valid_pred, valid_conf), "testAtValidationSelectedThreshold": threshold_metrics(test_truth, test_pred, test_conf, float(threshold)), "continuousSequence": {"status": "not-measured", "reason": "static-image dataset"}},
        "topConfusions": [],
    }
    matrix = confusion_matrix(test_truth, test_pred, labels=range(len(classes)))
    mistakes = [{"expected": classes[i], "predicted": classes[j], "count": int(matrix[i, j])} for i in range(len(classes)) for j in range(len(classes)) if i != j and matrix[i, j]]
    report["topConfusions"] = sorted(mistakes, key=lambda row: row["count"], reverse=True)[:30]
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    np.savez_compressed(
        args.output_dir / "predictions.npz",
        classes=np.asarray(classes),
        valid_truth=valid_truth,
        valid_probabilities=selected_valid,
        valid_model_probabilities=np.stack(valid_probs),
        test_truth=test_truth,
        test_probabilities=selected_test,
        test_model_probabilities=np.stack(test_probs),
        test_domains=test_domains,
        model_names=np.asarray(names),
    )
    print(json.dumps({"selectedCandidate": selected_name, "testAccuracy": report["testAccuracy"], "testMacroF1": report["testMacroF1"], "belowTarget": len(below), "report": str(args.output_dir / 'evaluation.json')}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
