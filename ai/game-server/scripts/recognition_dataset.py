from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path

import numpy as np


AI_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = AI_ROOT.parent
DATASET_ROOT = PROJECT_ROOT / "dataset"
MODEL_ADAPTER = AI_ROOT / "game-server" / "app" / "model_adapter.py"


@dataclass(frozen=True)
class DatasetPartition:
    features: np.ndarray
    labels: np.ndarray
    sessions: np.ndarray


def read_labels() -> tuple[str, ...]:
    module = ast.parse(MODEL_ADAPTER.read_text(encoding="utf-8"))
    for node in module.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "LABELS" for target in node.targets
        ):
            value = ast.literal_eval(node.value)
            if isinstance(value, tuple) and all(isinstance(item, str) for item in value):
                return value
    raise RuntimeError("LABELS was not found in model_adapter.py")


def audit_dataset(labels: tuple[str, ...]) -> list[dict[str, object]]:
    findings: list[dict[str, object]] = []
    paths = sorted(DATASET_ROOT.glob("seq_*.npy"))
    if len(paths) != len(labels) * 3:
        findings.append({"kind": "file-count", "expected": len(labels) * 3, "actual": len(paths)})
    for path in paths:
        parts = path.stem.split("_")
        if len(parts) != 3 or parts[1] not in labels:
            findings.append({"kind": "filename", "file": path.name})
            continue
        data = np.load(path, mmap_mode="r")
        expected_index = labels.index(parts[1])
        observed = np.unique(data[..., -1]).tolist()
        if data.ndim != 3 or data.shape[1:] != (10, 56):
            findings.append({"kind": "shape", "file": path.name, "shape": list(data.shape)})
        if observed != [float(expected_index)]:
            findings.append({
                "kind": "label-index", "file": path.name,
                "expected": expected_index, "observed": observed,
            })
    return findings


def load_partition(labels: tuple[str, ...], session_ids: set[str], stride: int = 1) -> DatasetPartition:
    features: list[np.ndarray] = []
    targets: list[np.ndarray] = []
    sessions: list[np.ndarray] = []
    for label_index, symbol in enumerate(labels):
        for path in sorted(DATASET_ROOT.glob("seq_*.npy")):
            parts = path.stem.split("_")
            if len(parts) != 3 or parts[1] != symbol or parts[2] not in session_ids:
                continue
            data = np.load(path)[::stride]
            features.append(data[:, :, :-1].astype(np.float32))
            targets.append(np.full(len(data), label_index, dtype=np.int32))
            sessions.append(np.full(len(data), parts[2], dtype="U16"))
    if not features:
        raise ValueError(f"No dataset rows for sessions: {sorted(session_ids)}")
    return DatasetPartition(np.concatenate(features), np.concatenate(targets), np.concatenate(sessions))
