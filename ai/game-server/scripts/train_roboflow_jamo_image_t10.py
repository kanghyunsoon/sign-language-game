"""T-10 image transfer learning on GPU 2 with auditable held-out metrics."""
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
from PIL import Image
from pillow_heif import register_heif_opener
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from torch import nn
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms
from torchvision.models import (
    EfficientNet_B0_Weights,
    MobileNet_V3_Small_Weights,
    efficientnet_b0,
    mobilenet_v3_small,
)


SIMILAR_GROUPS = {
    "siot-yu": ("ㅅ", "ㅠ"), "yeo-ye": ("ㅕ", "ㅖ"), "e-ye": ("ㅔ", "ㅖ"),
    "a-o": ("ㅏ", "ㅗ"), "yo-ya": ("ㅛ", "ㅑ"), "rieul-tieut": ("ㄹ", "ㅌ"),
    "jieut-siot-chieut": ("ㅈ", "ㅅ", "ㅊ"),
}
JAMO_LABELS = {
    "giyeok": "ㄱ", "nieun": "ㄴ", "digeut": "ㄷ", "rieul": "ㄹ", "mieum": "ㅁ", "bieup": "ㅂ",
    "siot": "ㅅ", "ieung": "ㅇ", "jieut": "ㅈ", "chieut": "ㅊ", "kieuk": "ㅋ", "tieut": "ㅌ",
    "pieup": "ㅍ", "hieut": "ㅎ", "a": "ㅏ", "ya": "ㅑ", "eo": "ㅓ", "yeo": "ㅕ", "o": "ㅗ",
    "yo": "ㅛ", "u": "ㅜ", "yu": "ㅠ", "eu": "ㅡ", "i": "ㅣ", "ae": "ㅐ", "yae": "ㅒ",
    "e": "ㅔ", "ye": "ㅖ", "ui": "ㅢ", "oe": "ㅚ", "wi": "ㅟ",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", type=Path, required=True)
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=24)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--seed", type=int, default=53)
    parser.add_argument("--baseline-accuracy", type=float, default=0.8315789473684211)
    parser.add_argument("--attempt-id", default="T-10")
    parser.add_argument("--architecture", choices=("mobilenet_v3_small", "efficientnet_b0"), default="mobilenet_v3_small")
    parser.add_argument("--all-jamo-images", action="store_true", help="Bypass MediaPipe filtering and use every 31-jamo image.")
    parser.add_argument("--number-root", type=Path, help="Optional KSL number root with train/test class folders.")
    parser.add_argument("--number-valid-fraction", type=float, default=0.15)
    parser.add_argument("--focus-classes", default="", help="Comma-separated labels selected from the previous validation result, never from the locked test set.")
    parser.add_argument("--focus-source", choices=("previous-validation", "development-test"), default="previous-validation")
    parser.add_argument("--focus-multiplier", type=float, default=2.0, help="Extra sampling/loss weight for focus classes.")
    parser.add_argument("--balance-mode", choices=("sampler", "loss", "both"), default="sampler", help="Apply class/focus weights once by default. 'both' is retained only to reproduce T-14 and earlier behavior.")
    parser.add_argument("--confusion-pairs", default="", help="Hard-negative pairs separated by '|', for example 'ㅔ:ㅖ|ㄹ:ㅌ'. Select pairs from validation only.")
    parser.add_argument("--confusion-source", choices=("previous-validation", "predefined-domain", "development-test"), default="previous-validation")
    parser.add_argument("--confusion-margin", type=float, default=0.0, help="Required target-logit margin over the paired confusing class.")
    parser.add_argument("--confusion-loss-weight", type=float, default=0.25)
    parser.add_argument("--selection-mode", choices=("q10", "min-q10"), default="min-q10", help="Checkpoint score. min-q10 explicitly includes the worst validation class.")
    parser.add_argument("--class-target", type=float, default=0.93, help="Required recall and F1 floor for every class.")
    parser.add_argument("--initial-checkpoint", type=Path, help="Optional same-architecture checkpoint for low-learning-rate continuation.")
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--label-smoothing", type=float, default=0.04)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def class_floor_metrics(truth: np.ndarray, predicted: np.ndarray, class_count: int) -> dict:
    matrix = confusion_matrix(truth, predicted, labels=range(class_count)).astype(np.float64)
    true_positive = np.diag(matrix)
    recall = np.divide(true_positive, matrix.sum(axis=1), out=np.zeros(class_count), where=matrix.sum(axis=1) > 0)
    precision = np.divide(true_positive, matrix.sum(axis=0), out=np.zeros(class_count), where=matrix.sum(axis=0) > 0)
    f1 = np.divide(2 * precision * recall, precision + recall, out=np.zeros(class_count), where=(precision + recall) > 0)
    return {
        "minRecall": float(recall.min()),
        "minF1": float(f1.min()),
        "q10Recall": float(np.quantile(recall, 0.10)),
        "q10F1": float(np.quantile(f1, 0.10)),
    }


class ImageRows(Dataset):
    def __init__(self, root: Path, sources: np.ndarray, targets: np.ndarray, transform) -> None:
        self.root, self.sources, self.targets, self.transform = root, sources, targets, transform

    def __len__(self) -> int:
        return len(self.targets)

    def __getitem__(self, index: int):
        source = Path(str(self.sources[index]))
        with Image.open(source if source.is_absolute() else self.root / source) as image:
            value = self.transform(image.convert("RGB"))
        return value, int(self.targets[index])


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    model.eval()
    truth, predicted, confidence = [], [], []
    with torch.no_grad():
        for values, labels in loader:
            probabilities = model(values.to(device, non_blocking=True)).softmax(1).cpu()
            scores, guesses = probabilities.max(1)
            truth.extend(labels.numpy().tolist()); predicted.extend(guesses.numpy().tolist()); confidence.extend(scores.numpy().tolist())
    return np.asarray(truth), np.asarray(predicted), np.asarray(confidence)


def accuracy_slice(truth: np.ndarray, predicted: np.ndarray, mask: np.ndarray) -> dict[str, float | int | None]:
    support = int(mask.sum())
    return {"support": support, "accuracy": float((truth[mask] == predicted[mask]).mean()) if support else None}


def categorical_slices(truth: np.ndarray, predicted: np.ndarray, values: np.ndarray) -> dict[str, dict[str, float | int | None]]:
    return {str(value): accuracy_slice(truth, predicted, values == value) for value in sorted(set(values.astype(str)))}


def similar_metrics(truth: np.ndarray, predicted: np.ndarray, classes: tuple[str, ...]) -> dict[str, object]:
    label_truth = np.asarray([classes[i] for i in truth]); label_pred = np.asarray([classes[i] for i in predicted])
    result = {}
    for name, labels in SIMILAR_GROUPS.items():
        mask = np.isin(label_truth, labels)
        within = mask & (label_truth != label_pred) & np.isin(label_pred, labels)
        result[name] = {"labels": list(labels), **accuracy_slice(truth, predicted, mask), "withinGroupConfusions": int(within.sum()), "withinGroupConfusionRate": float(within.sum() / mask.sum()) if mask.sum() else None}
    return result


def threshold_metrics(truth, predicted, confidence, threshold: float) -> dict[str, float | int | None]:
    accepted = confidence >= threshold; count = int(accepted.sum()); correct = truth == predicted
    return {"threshold": threshold, "accepted": count, "coverage": float(accepted.mean()), "acceptedAccuracy": float(correct[accepted].mean()) if count else None, "falseConfirmationRateAllSamples": float((accepted & ~correct).mean())}


def choose_threshold(truth, predicted, confidence) -> dict[str, object]:
    sweep = [threshold_metrics(truth, predicted, confidence, float(v)) for v in np.arange(0.50, 0.951, 0.025)]
    eligible = [row for row in sweep if row["acceptedAccuracy"] is not None and row["acceptedAccuracy"] >= 0.90]
    selected = max(eligible, key=lambda row: (row["coverage"], -row["threshold"])) if eligible else max(sweep, key=lambda row: row["acceptedAccuracy"] or 0.0)
    return {"targetAcceptedAccuracy": 0.90, "selected": selected, "sweep": sweep}


def main() -> None:
    args = parse_args()
    register_heif_opener()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable; refusing image training on CPU")
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed); torch.cuda.manual_seed_all(args.seed)
    device = torch.device("cuda:0")
    payload = np.load(args.features)
    accepted_sources = payload["sources"].astype(str)
    if args.all_jamo_images:
        rows = []
        for path in sorted(args.dataset_root.rglob("*")):
            if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            relative = path.relative_to(args.dataset_root)
            if len(relative.parts) >= 3 and relative.parts[0] in {"train", "valid", "test"} and relative.parts[1] in JAMO_LABELS:
                rows.append((relative.as_posix(), JAMO_LABELS[relative.parts[1]], relative.parts[0]))
        sources = np.asarray([row[0] for row in rows]); labels = np.asarray([row[1] for row in rows]); splits = np.asarray([row[2] for row in rows])
    else:
        sources = accepted_sources; labels = payload["labels"].astype(str); splits = payload["splits"].astype(str)
    if args.number_root:
        number_rows = []
        number_train_by_label: dict[str, list[Path]] = {}
        for path in sorted((args.number_root / "train").rglob("*")):
            if not path.is_file() or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".heic"}:
                continue
            folder = path.parent.name
            label = "NUM_0" if folder in {"10-1", "10-2"} else f"NUM_{folder}"
            number_train_by_label.setdefault(label, []).append(path.resolve())
        split_rng = random.Random(args.seed)
        for label, paths in sorted(number_train_by_label.items()):
            shuffled = paths[:]
            split_rng.shuffle(shuffled)
            valid_count = max(1, round(len(shuffled) * args.number_valid_fraction))
            number_rows.extend((path.as_posix(), label, "valid" if index < valid_count else "train") for index, path in enumerate(shuffled))
        for path in sorted((args.number_root / "test").rglob("*")):
            if not path.is_file() or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".heic"}:
                continue
            folder = path.parent.name
            label = "NUM_0" if folder in {"10-1", "10-2"} else f"NUM_{folder}"
            number_rows.append((path.resolve().as_posix(), label, "test"))
        sources = np.concatenate((sources, np.asarray([row[0] for row in number_rows])))
        labels = np.concatenate((labels, np.asarray([row[1] for row in number_rows])))
        splits = np.concatenate((splits, np.asarray([row[2] for row in number_rows])))
    classes = tuple(sorted(set(labels))); class_to_index = {label: i for i, label in enumerate(classes)}
    targets = np.asarray([class_to_index[label] for label in labels], dtype=np.int64)
    indexes = {name: np.flatnonzero(splits == name) for name in ("train", "valid", "test")}

    normalize = transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225))
    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(224, scale=(0.78, 1.0), ratio=(0.88, 1.12)),
        transforms.RandomApply([transforms.RandomAffine(degrees=14, translate=(0.08, 0.08), scale=(0.9, 1.1))], p=0.75),
        transforms.ColorJitter(brightness=0.22, contrast=0.22, saturation=0.14, hue=0.025),
        transforms.RandomApply([transforms.GaussianBlur(3, sigma=(0.1, 1.2))], p=0.16),
        transforms.ToTensor(), normalize,
    ])
    eval_transform = transforms.Compose([transforms.Resize(248), transforms.CenterCrop(224), transforms.ToTensor(), normalize])

    train_index = indexes["train"]
    counts = np.bincount(targets[train_index], minlength=len(classes)).astype(np.float64)
    focus_classes = [label.strip() for label in args.focus_classes.split(",") if label.strip()]
    unknown_focus = sorted(set(focus_classes) - set(classes))
    if unknown_focus:
        raise ValueError(f"Unknown --focus-classes: {unknown_focus}")
    focus_scale = np.ones(len(classes), dtype=np.float64)
    for label in focus_classes:
        focus_scale[classes.index(label)] = args.focus_multiplier
    class_balance = np.sqrt(counts.max() / np.maximum(counts, 1.0)) * focus_scale
    pair_labels = []
    for item in (part.strip() for part in args.confusion_pairs.split("|") if part.strip()):
        labels_in_pair = tuple(label.strip() for label in item.split(":"))
        if len(labels_in_pair) != 2 or any(label not in class_to_index for label in labels_in_pair):
            raise ValueError(f"Invalid --confusion-pairs item: {item!r}")
        pair_labels.append(labels_in_pair)
    pair_indexes = [(class_to_index[left], class_to_index[right]) for left, right in pair_labels]
    sampler = None
    if args.balance_mode in {"sampler", "both"}:
        sample_weights = class_balance[targets[train_index]]
        sampler = WeightedRandomSampler(torch.from_numpy(sample_weights), len(train_index), replacement=True, generator=torch.Generator().manual_seed(args.seed))
    train_loader_options = {"sampler": sampler} if sampler is not None else {"shuffle": True, "generator": torch.Generator().manual_seed(args.seed)}
    loaders = {
        "train": DataLoader(ImageRows(args.dataset_root, sources[train_index], targets[train_index], train_transform), batch_size=args.batch_size, num_workers=4, pin_memory=True, **train_loader_options),
        "valid": DataLoader(ImageRows(args.dataset_root, sources[indexes["valid"]], targets[indexes["valid"]], eval_transform), batch_size=256, shuffle=False, num_workers=4, pin_memory=True),
        "test": DataLoader(ImageRows(args.dataset_root, sources[indexes["test"]], targets[indexes["test"]], eval_transform), batch_size=256, shuffle=False, num_workers=4, pin_memory=True),
    }
    if args.architecture == "mobilenet_v3_small":
        weights = MobileNet_V3_Small_Weights.DEFAULT
        model = mobilenet_v3_small(weights=weights)
        model.classifier[3] = nn.Linear(model.classifier[3].in_features, len(classes))
    else:
        weights = EfficientNet_B0_Weights.DEFAULT
        model = efficientnet_b0(weights=weights)
        model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(classes))
    if args.initial_checkpoint:
        initial = torch.load(args.initial_checkpoint, map_location="cpu", weights_only=False)
        if initial.get("architecture") != args.architecture:
            raise ValueError(f"Checkpoint architecture mismatch: {initial.get('architecture')} != {args.architecture}")
        if tuple(initial.get("classes", ())) != classes:
            raise ValueError("Checkpoint class order mismatch")
        model.load_state_dict(initial["state_dict"])
    model.to(device)
    effective_loss_weights = class_balance if args.balance_mode in {"loss", "both"} else np.ones(len(classes), dtype=np.float64)
    class_weights = torch.from_numpy(effective_loss_weights.astype(np.float32)).to(device)
    loss_fn = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=args.label_smoothing)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=2e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-6)
    scaler = torch.amp.GradScaler("cuda")
    best_state, best_score, stale, history = None, -1.0, 0, []
    for epoch in range(1, args.epochs + 1):
        model.train(); losses = []
        for values, batch_targets in loaders["train"]:
            values = values.to(device, non_blocking=True); batch_targets = batch_targets.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            with torch.amp.autocast("cuda"):
                logits = model(values)
                loss = loss_fn(logits, batch_targets)
                pair_penalties = []
                if args.confusion_margin > 0:
                    for left, right in pair_indexes:
                        for target_index, rival_index in ((left, right), (right, left)):
                            mask = batch_targets == target_index
                            if mask.any():
                                pair_penalties.append(torch.relu(args.confusion_margin - logits[mask, target_index] + logits[mask, rival_index]).mean())
                if pair_penalties:
                    loss = loss + args.confusion_loss_weight * torch.stack(pair_penalties).mean()
            scaler.scale(loss).backward(); scaler.unscale_(optimizer); nn.utils.clip_grad_norm_(model.parameters(), 5.0); scaler.step(optimizer); scaler.update()
            losses.append(float(loss.detach().cpu()))
        scheduler.step()
        valid_truth, valid_pred, _ = evaluate(model, loaders["valid"], device)
        acc = float((valid_truth == valid_pred).mean()); macro = float(f1_score(valid_truth, valid_pred, average="macro", zero_division=0))
        validation_floor = class_floor_metrics(valid_truth, valid_pred, len(classes))
        if args.selection_mode == "q10":
            selection = 0.20 * acc + 0.30 * macro + 0.25 * validation_floor["q10Recall"] + 0.25 * validation_floor["q10F1"]
        else:
            selection = 0.15 * acc + 0.20 * macro + 0.15 * validation_floor["minRecall"] + 0.15 * validation_floor["minF1"] + 0.175 * validation_floor["q10Recall"] + 0.175 * validation_floor["q10F1"]
        row = {"epoch": epoch, "loss": float(np.mean(losses)), "validationAccuracy": acc, "validationMacroF1": macro, **validation_floor, "selectionScore": selection}
        history.append(row); print(json.dumps(row), flush=True)
        if selection > best_score:
            best_score, stale = selection, 0; best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
        else:
            stale += 1
            if stale >= 6: break
    model.load_state_dict(best_state)
    valid_truth, valid_pred, valid_conf = evaluate(model, loaders["valid"], device)
    test_truth, test_pred, test_conf = evaluate(model, loaders["test"], device)
    validation_op = choose_threshold(valid_truth, valid_pred, valid_conf); threshold = float(validation_op["selected"]["threshold"])
    accuracy = float((test_truth == test_pred).mean()); macro = float(f1_score(test_truth, test_pred, average="macro", zero_division=0))
    validation_by_class = classification_report(valid_truth, valid_pred, labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0)
    test_by_class = classification_report(test_truth, test_pred, labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0)
    test_floor = class_floor_metrics(test_truth, test_pred, len(classes))
    below_target = [label for label in classes if test_by_class[label]["recall"] < args.class_target or test_by_class[label]["f1-score"] < args.class_target]
    test_label_names = np.asarray([classes[index] for index in test_truth])
    domain_metrics = {}
    for domain_name, domain_mask in {
        "jamo31": ~np.char.startswith(test_label_names, "NUM_"),
        "numbers10": np.char.startswith(test_label_names, "NUM_"),
    }.items():
        domain_metrics[domain_name] = {
            "support": int(domain_mask.sum()),
            "accuracy": float((test_truth[domain_mask] == test_pred[domain_mask]).mean()) if domain_mask.any() else None,
            "macroF1": float(f1_score(test_truth[domain_mask], test_pred[domain_mask], average="macro", zero_division=0)) if domain_mask.any() else None,
        }
    matrix = confusion_matrix(test_truth, test_pred, labels=range(len(classes))); mistakes = []
    for expected in range(len(classes)):
        for observed in range(len(classes)):
            if expected != observed and matrix[expected, observed]: mistakes.append({"expected": classes[expected], "predicted": classes[observed], "count": int(matrix[expected, observed])})
    mistakes.sort(key=lambda row: row["count"], reverse=True)
    test_index = indexes["test"]
    accepted_lookup = {source: index for index, source in enumerate(accepted_sources)}
    proxy_pairs = [(position, accepted_lookup[source]) for position, source in enumerate(sources[test_index]) if source in accepted_lookup]
    proxy_positions = np.asarray([pair[0] for pair in proxy_pairs], dtype=np.int64)
    proxy_indexes = np.asarray([pair[1] for pair in proxy_pairs], dtype=np.int64)
    proxy_truth = test_truth[proxy_positions]; proxy_pred = test_pred[proxy_positions]
    middle_y = payload["vertical_direction_y"][proxy_indexes]; normal_z = payload["palm_normal_z"][proxy_indexes]
    vertical = np.where(middle_y <= -0.15, "fingers-up", np.where(middle_y >= 0.15, "fingers-down", "sideways")); palm = np.where(normal_z >= 0.20, "normal-z-positive", np.where(normal_z <= -0.20, "normal-z-negative", "edge-on"))
    report = {
        "experiment": f"roboflow-jamo-static-image-{args.attempt_id.lower()}-{args.architecture}-transfer-gpu",
        "attempt": {"attemptId": args.attempt_id, "seed": args.seed, "requestedEpochs": args.epochs, "completedEpochs": len(history), "architecture": args.architecture, "checkpointSelection": args.selection_mode, "initialCheckpoint": str(args.initial_checkpoint) if args.initial_checkpoint else None, "learningRate": args.learning_rate, "labelSmoothing": args.label_smoothing},
        "dataset": {"source": "Roboflow Sign Language v1 plus KSL Numbers" if args.number_root else "Roboflow Sign Language v1", "license": "Roboflow CC BY 4.0 plus numbers CC0" if args.number_root else "CC BY 4.0", "classifierSamples": int(len(sources)), "acceptedLandmarkSamples": int(len(accepted_sources)), "classifierScope": "all 31-jamo and number images; no MediaPipe gate" if args.number_root else ("all 31-jamo images; no MediaPipe gate" if args.all_jamo_images else "only images where MediaPipe extraction succeeded"), "featureArtifactSha256": sha256(args.features), "splitPolicy": "jamo source train/valid/test; number provider test held out and provider train stratified 85/15 for validation; not signer-independent", "augmentationCaveat": "Roboflow export itself includes augmentation"},
        "physicalGpu": 2, "logicalCudaDevice": 0, "gpuName": torch.cuda.get_device_name(device),
        "techniques": [f"{'checkpoint continuation' if args.initial_checkpoint else 'ImageNet-pretrained'} {args.architecture} fine-tuning", "random crop/rotation/translation/color/blur augmentation without horizontal flip", f"sqrt inverse-frequency balancing via {args.balance_mode}", f"learning rate {args.learning_rate}", f"label smoothing {args.label_smoothing}", "validation class-floor-aware checkpoint selection", "validation-selected focus-class weighting", "validation-selected hard-negative pair logit margin" if pair_indexes and args.confusion_margin > 0 else "no hard-negative pair margin"],
        "focusPolicy": {"source": args.focus_source, "classes": focus_classes, "multiplier": args.focus_multiplier, "certificationWarning": "A development-test source invalidates that split for final certification; use a fresh locked test set." if args.focus_source == "development-test" else None},
        "balancingPolicy": {"mode": args.balance_mode, "warning": "The 'both' mode multiplies sampler and loss effects; use only for reproduction." if args.balance_mode == "both" else None},
        "confusionSeparationPolicy": {"source": args.confusion_source, "pairs": pair_labels, "margin": args.confusion_margin, "lossWeight": args.confusion_loss_weight, "certificationWarning": "A development-test source is for iterative comparison only; certify on a fresh locked test set." if args.confusion_source == "development-test" else None},
        "samples": {name: int(len(part)) for name, part in indexes.items()}, "classes": list(classes),
        "baselineTestAccuracy": args.baseline_accuracy, "testAccuracy": accuracy, "testAccuracyDeltaPercentagePoints": (accuracy - args.baseline_accuracy) * 100.0, "testMacroF1": macro,
        "domainMetrics": domain_metrics,
        "validationByClass": validation_by_class,
        "testByClass": test_by_class,
        "classGate": {"target": args.class_target, **test_floor, "belowTarget": below_target, "passed": not below_target},
        "similarGroupMetrics": similar_metrics(test_truth, test_pred, classes),
        "conditionMetrics": {"detectedHandedness": {"evidenceLevel": f"MediaPipe-detected subset {len(proxy_truth)}/{len(test_truth)}", "slices": categorical_slices(proxy_truth, proxy_pred, payload["handedness"].astype(str)[proxy_indexes])}, "verticalOrientationProxy": {"evidenceLevel": f"landmark-derived subset {len(proxy_truth)}/{len(test_truth)}", "slices": categorical_slices(proxy_truth, proxy_pred, vertical)}, "palmFacingProxy": {"evidenceLevel": f"palm-normal subset {len(proxy_truth)}/{len(test_truth)}", "slices": categorical_slices(proxy_truth, proxy_pred, palm)}},
        "usabilityMetrics": {"validationOperatingPoint": validation_op, "testAtValidationSelectedThreshold": threshold_metrics(test_truth, test_pred, test_conf, threshold), "continuousSequence": {"status": "not-measured", "reason": "static-image dataset"}},
        "topConfusions": mistakes[:30], "history": history,
        "importantLimitations": ["Split is not signer-independent and may share augmented source families.", "Orientation buckets cover only MediaPipe-detected samples and are proxies, not ground truth.", "Continuous sequence performance is not measured."],
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    torch.save({"state_dict": best_state, "classes": classes, "architecture": args.architecture, "experiment": report["experiment"]}, args.output_dir / "model.pt")
    print(json.dumps({"testAccuracy": accuracy, "testMacroF1": macro, "deltaPercentagePoints": report["testAccuracyDeltaPercentagePoints"], "report": str(args.output_dir / "evaluation.json")}), flush=True)


if __name__ == "__main__": main()
