"""Train and independently evaluate a GPU-only Roboflow jamo experiment.

The input is intentionally the same 10 x 55 MediaPipe feature contract used by
the app.  Roboflow images are static, so each detected feature is repeated for
ten frames; this reports static-image recognition only, never continuous-sign
performance.
"""
from __future__ import annotations

import argparse
import json
import os
import random
from collections import Counter
from pathlib import Path

# The shared server requires physical GPU 2.  After this mask, PyTorch sees it
# as logical cuda:0; the report keeps both identifiers to avoid ambiguity.
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "2")

import numpy as np
import torch
from sklearn.metrics import classification_report, confusion_matrix
from torch import nn
from torch.utils.data import DataLoader, TensorDataset


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--feature-version", choices=("v2", "v3"), default="v2")
    return parser.parse_args()


class JamoClassifier(nn.Module):
    def __init__(self, feature_size: int, class_count: int) -> None:
        super().__init__()
        self.network = nn.Sequential(
            nn.LayerNorm(feature_size), nn.Linear(feature_size, 256), nn.GELU(), nn.Dropout(0.28),
            nn.Linear(256, 160), nn.GELU(), nn.Dropout(0.18), nn.Linear(160, class_count),
        )

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        return self.network(value.mean(dim=1))


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    truth, predicted = [], []
    with torch.no_grad():
        for features, labels in loader:
            logits = model(features.to(device))
            truth.extend(labels.numpy().tolist())
            predicted.extend(logits.argmax(dim=1).cpu().numpy().tolist())
    return np.asarray(truth), np.asarray(predicted)


def main() -> None:
    args = parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; refusing to run this GPU experiment on CPU")
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    torch.backends.cudnn.benchmark = True
    device = torch.device("cuda:0")
    payload = np.load(args.features)
    features = payload["features"].astype(np.float32)
    if features.ndim != 3 or features.shape[1] != 10:
        raise RuntimeError(f"Expected [samples, 10, features], got {features.shape}")
    feature_size = int(features.shape[-1])
    labels = payload["labels"].astype(str)
    splits = payload["splits"].astype(str)
    classes = tuple(sorted(set(labels)))
    class_to_index = {label: index for index, label in enumerate(classes)}
    targets = np.asarray([class_to_index[label] for label in labels], dtype=np.int64)
    partitions = {}
    for split in ("train", "valid", "test"):
        mask = splits == split
        if not mask.any():
            raise RuntimeError(f"Required {split} partition is empty")
        partitions[split] = (features[mask], targets[mask])
    train_loader = DataLoader(
        TensorDataset(torch.from_numpy(partitions["train"][0]), torch.from_numpy(partitions["train"][1])),
        batch_size=args.batch_size, shuffle=True, num_workers=2, pin_memory=True,
    )
    valid_loader = DataLoader(
        TensorDataset(torch.from_numpy(partitions["valid"][0]), torch.from_numpy(partitions["valid"][1])),
        batch_size=512, num_workers=2, pin_memory=True,
    )
    test_loader = DataLoader(
        TensorDataset(torch.from_numpy(partitions["test"][0]), torch.from_numpy(partitions["test"][1])),
        batch_size=512, num_workers=2, pin_memory=True,
    )
    model = JamoClassifier(feature_size, len(classes)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1.4e-3, weight_decay=1.0e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", patience=5, factor=0.5)
    loss_fn = nn.CrossEntropyLoss()
    best_state, best_valid, stale, history = None, -1.0, 0, []
    for epoch in range(1, args.epochs + 1):
        model.train()
        losses = []
        for values, targets_batch in train_loader:
            # Small feature noise simulates landmark jitter without changing labels.
            values = values.to(device, non_blocking=True) + torch.randn_like(values, device=device) * 0.012
            targets_batch = targets_batch.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(values), targets_batch)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach().cpu()))
        valid_truth, valid_predicted = evaluate(model, valid_loader, device)
        valid_accuracy = float((valid_truth == valid_predicted).mean())
        scheduler.step(valid_accuracy)
        history.append({"epoch": epoch, "loss": float(np.mean(losses)), "validationAccuracy": valid_accuracy})
        print(json.dumps(history[-1]), flush=True)
        if valid_accuracy > best_valid:
            best_valid, stale = valid_accuracy, 0
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
        else:
            stale += 1
            if stale >= 14:
                break
    assert best_state is not None
    model.load_state_dict(best_state)
    test_truth, test_predicted = evaluate(model, test_loader, device)
    matrix = confusion_matrix(test_truth, test_predicted, labels=range(len(classes)))
    mistakes = []
    for expected in range(len(classes)):
        for observed in range(len(classes)):
            if expected != observed and matrix[expected, observed]:
                mistakes.append({"expected": classes[expected], "predicted": classes[observed], "count": int(matrix[expected, observed])})
    mistakes.sort(key=lambda row: row["count"], reverse=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "experiment": f"roboflow-jamo-static-mediapipe-{args.feature_version}-gpu",
        "physicalGpu": 2,
        "logicalCudaDevice": 0,
        "gpuName": torch.cuda.get_device_name(device),
        "featureContract": f"10 x repeated {feature_size}-value MediaPipe {args.feature_version} feature",
        "featureSize": feature_size,
        "importantLimitation": "Static images do not evaluate continuous signs, motion-dependent characters, or new-signer generalization.",
        "samples": {split: int(len(partitions[split][0])) for split in partitions},
        "classes": list(classes),
        "bestValidationAccuracy": best_valid,
        "testAccuracy": float((test_truth == test_predicted).mean()),
        "testByClass": classification_report(test_truth, test_predicted, labels=range(len(classes)), target_names=classes, output_dict=True, zero_division=0),
        "topConfusions": mistakes[:20], "history": history,
    }
    (args.output_dir / "evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    torch.save({"state_dict": best_state, "classes": classes, "featureContract": f"10x{feature_size}"}, args.output_dir / "model.pt")
    print(json.dumps({"testAccuracy": report["testAccuracy"], "report": str(args.output_dir / "evaluation.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
