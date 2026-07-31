"""Mild rotation/translation TTA over T-13..T-16 experts on physical GPU 2."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from pillow_heif import register_heif_opener
from sklearn.metrics import classification_report, f1_score
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from torchvision.transforms import functional as tvf

from evaluate_roboflow_jamo_ensemble_t17 import build_model, load_rows, normalized, score_candidate
from train_roboflow_jamo_image_t10 import choose_threshold, class_floor_metrics, similar_metrics, threshold_metrics


class TtaRows(Dataset):
    def __init__(self, root: Path, sources: np.ndarray, targets: np.ndarray) -> None:
        self.root, self.sources, self.targets = root, sources, targets
        self.resize = transforms.Resize(248)
        self.crop = transforms.CenterCrop(224)
        self.tensor = transforms.ToTensor()
        self.normalize = transforms.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225))

    def __len__(self) -> int:
        return len(self.targets)

    def __getitem__(self, index: int):
        source = Path(str(self.sources[index]))
        with Image.open(source if source.is_absolute() else self.root / source) as image:
            base = self.crop(self.resize(image.convert("RGB")))
        views = [
            base,
            tvf.affine(base, angle=-6.0, translate=[0, 0], scale=1.0, shear=[0.0, 0.0]),
            tvf.affine(base, angle=6.0, translate=[0, 0], scale=1.0, shear=[0.0, 0.0]),
            tvf.affine(base, angle=0.0, translate=[-6, 0], scale=1.0, shear=[0.0, 0.0]),
            tvf.affine(base, angle=0.0, translate=[6, 0], scale=1.0, shear=[0.0, 0.0]),
        ]
        return torch.stack([self.normalize(self.tensor(view)) for view in views]), int(self.targets[index])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--number-root", type=Path, required=True)
    parser.add_argument("--checkpoints", type=Path, nargs="+", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=48)
    parser.add_argument("--validation-seed", type=int, default=83)
    parser.add_argument("--number-valid-fraction", type=float, default=0.15)
    parser.add_argument("--class-target", type=float, default=0.93)
    return parser.parse_args()


def tta_probabilities(model, loader, device):
    truth, probabilities = [], []
    with torch.no_grad():
        for views, labels in loader:
            batch, variants, channels, height, width = views.shape
            logits = model(views.reshape(batch * variants, channels, height, width).to(device, non_blocking=True))
            values = logits.softmax(1).reshape(batch, variants, -1).mean(1).cpu().numpy()
            probabilities.append(values); truth.extend(labels.numpy().tolist())
    return np.asarray(truth), np.concatenate(probabilities)


def main() -> None:
    args = parse_args()
    register_heif_opener()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable; physical GPU 2 is required")
    device = torch.device("cuda:0")
    sources, targets, splits, domains, classes = load_rows(args)
    indexes = {name: np.flatnonzero(splits == name) for name in ("valid", "test")}
    loaders = {name: DataLoader(TtaRows(args.dataset_root, sources[index], targets[index]), batch_size=args.batch_size, shuffle=False, num_workers=4, pin_memory=True) for name, index in indexes.items()}
    names, valid_probs, test_probs = [], [], []
    valid_truth = test_truth = None
    for path in args.checkpoints:
        checkpoint = torch.load(path, map_location="cpu", weights_only=False)
        if tuple(checkpoint["classes"]) != classes:
            raise ValueError(f"Class order mismatch in {path}")
        model = build_model(checkpoint, len(classes), device)
        current_valid_truth, current_valid = tta_probabilities(model, loaders["valid"], device)
        current_test_truth, current_test = tta_probabilities(model, loaders["test"], device)
        if valid_truth is not None and not np.array_equal(valid_truth, current_valid_truth):
            raise RuntimeError("Validation order changed")
        valid_truth, test_truth = current_valid_truth, current_test_truth
        names.append(path.parent.name); valid_probs.append(current_valid); test_probs.append(current_test)
        del model
        torch.cuda.empty_cache()

    candidates = {}
    for index, name in enumerate(names):
        candidates[f"single:{name}"] = (valid_probs[index], test_probs[index], {"models": [name]})
    candidates["mean-all"] = (np.mean(valid_probs, axis=0), np.mean(test_probs, axis=0), {"models": names})
    reports = [classification_report(valid_truth, values.argmax(1), labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0) for values in valid_probs]
    experts = [max(range(len(names)), key=lambda i: (reports[i][label]["f1-score"], reports[i][label]["recall"], reports[i][label]["precision"])) for label in classes]
    class_valid = normalized(np.column_stack([valid_probs[model][:, index] for index, model in enumerate(experts)]))
    class_test = normalized(np.column_stack([test_probs[model][:, index] for index, model in enumerate(experts)]))
    candidates["class-expert"] = (class_valid, class_test, {"classExperts": {classes[i]: names[m] for i, m in enumerate(experts)}})
    jamo = [i for i, label in enumerate(classes) if not label.startswith("NUM_")]
    numbers = [i for i, label in enumerate(classes) if label.startswith("NUM_")]
    for jm in range(len(names)):
        for nm in range(len(names)):
            valid = np.zeros_like(valid_probs[0]); test = np.zeros_like(test_probs[0])
            valid[:, jamo] = valid_probs[jm][:, jamo]; valid[:, numbers] = valid_probs[nm][:, numbers]
            test[:, jamo] = test_probs[jm][:, jamo]; test[:, numbers] = test_probs[nm][:, numbers]
            candidates[f"domain-expert:jamo={names[jm]}:numbers={names[nm]}"] = (normalized(valid), normalized(test), {"jamoModel": names[jm], "numberModel": names[nm]})
    validation_candidates = {name: score_candidate(valid_truth, values[0], len(classes)) for name, values in candidates.items()}
    selected = max(validation_candidates, key=lambda name: validation_candidates[name]["selectionScore"])
    valid_prob, test_prob, policy = candidates[selected]
    valid_pred = valid_prob.argmax(1); valid_conf = valid_prob.max(1)
    test_pred = test_prob.argmax(1); test_conf = test_prob.max(1)
    test_report = classification_report(test_truth, test_pred, labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0)
    floor = class_floor_metrics(test_truth, test_pred, len(classes))
    below = [label for label in classes if test_report[label]["recall"] < args.class_target or test_report[label]["f1-score"] < args.class_target]
    threshold = float(choose_threshold(valid_truth, valid_pred, valid_conf)["selected"]["threshold"])
    test_domains = domains[indexes["test"]]
    domain_metrics = {}
    for domain in sorted(set(test_domains)):
        mask = test_domains == domain
        domain_metrics[domain] = {"support": int(mask.sum()), "accuracy": float((test_truth[mask] == test_pred[mask]).mean()), "macroF1": float(f1_score(test_truth[mask], test_pred[mask], average="macro", zero_division=0))}
    report = {
        "attempt": "T-19", "physicalGpu": 2, "method": "five-view TTA: center, +/-6 degree, +/-6 px x-translation; no horizontal flip",
        "models": names, "selectedCandidate": selected, "selectedPolicy": policy, "validationCandidates": validation_candidates,
        "testAccuracy": float((test_truth == test_pred).mean()), "testMacroF1": float(f1_score(test_truth, test_pred, average="macro", zero_division=0)),
        "testByClass": test_report, "classGate": {"target": args.class_target, **floor, "belowTarget": below, "passed": not below},
        "domainMetrics": domain_metrics, "similarGroupMetrics": similar_metrics(test_truth, test_pred, classes),
        "usabilityMetrics": {"testAtValidationSelectedThreshold": threshold_metrics(test_truth, test_pred, test_conf, threshold), "continuousSequence": {"status": "not-measured", "reason": "static-image dataset"}},
        "limitations": ["TTA policy is selected on a non-locked validation set.", "The repeatedly observed test remains development-only."],
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    np.savez_compressed(args.output_dir / "predictions.npz", classes=np.asarray(classes), valid_truth=valid_truth, valid_probabilities=valid_prob, test_truth=test_truth, test_probabilities=test_prob, test_domains=test_domains)
    print(json.dumps({"selectedCandidate": selected, "testAccuracy": report["testAccuracy"], "testMacroF1": report["testMacroF1"], "belowTarget": len(below), "report": str(args.output_dir / 'evaluation.json')}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
