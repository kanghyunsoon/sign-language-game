from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
from typing import Sequence

import numpy as np

from .features import FEATURE_SIZE, LANDMARK_COUNT, NUMBER_MODEL_ROOT, Landmark, landmarks_to_feature
from .labels import (  # re-exported so either module gives the same contract
    FEATURE_VERSION,
    LABELS,
    MODEL_VERSION,
    NONE_LABEL,
    NUMBER_LABELS,
)


DEFAULT_MODEL_DIRECTORY = NUMBER_MODEL_ROOT / "models" / MODEL_VERSION
READINESS_PATH = NUMBER_MODEL_ROOT / "contracts" / "readiness-number.json"


def load_number_readiness() -> dict[str, object]:
    """Load the number-only safety gate.

    This is a separate contract from the jamo `readiness.json`. Loading it never
    touches the deployed jamo gate, and a model that has not been evaluated yet
    is expected to mark every class ineligible.
    """
    payload = json.loads(READINESS_PATH.read_text(encoding="utf-8"))
    if payload.get("modelVersion") != MODEL_VERSION:
        raise ValueError("Number readiness must describe the number-only head")
    classes = payload.get("classes")
    symbols = [item.get("symbol") for item in classes if isinstance(item, dict)] if isinstance(classes, list) else []
    if symbols != list(NUMBER_LABELS):
        raise ValueError("Number readiness classes do not match the number label order")
    return payload


@dataclass(frozen=True)
class NumberModelContract:
    labels: tuple[str, ...]
    feature_size: int
    feature_version: str
    model_version: str = MODEL_VERSION

    def __post_init__(self) -> None:
        if len(set(self.labels)) != len(self.labels):
            raise ValueError("Model labels must be unique")
        if self.feature_size <= 0:
            raise ValueError("Model input dimension must be positive")

    @property
    def output_size(self) -> int:
        return len(self.labels)


class NumberModelAdapter:
    """Single-frame Korean sign-number classifier, independent of the jamo heads.

    Three deliberate differences from the 41-class tree bundle:

    1. **One frame in, one distribution out.** Sign numbers are static hand
       shapes, so there is nothing for a 10-frame window to model. Temporal
       aggregation stays in `recognition-policy.json` and the session layer.
       The existing number head was trained on static images duplicated ten
       times, which zeroes the `std` and `last - first` halves of its 220-value
       summary; live camera frames never look like that. Classifying a single
       frame removes that train/serve mismatch instead of papering over it.
    2. **`feature_v3` (78 values).** Sign numbers are separated by finger count
       and palm facing, so 3-D bone directions and the palm normal carry real
       signal that the 55-value 2-D feature discards.
    3. **An explicit `none` class.** The number head decides for itself whether
       a frame is a number at all, rather than trusting a jamo/number domain
       router to route on its behalf.

    The adapter owns its feature extraction so that offline evaluation and any
    future runtime wiring cannot drift apart.
    """

    def __init__(self, model_directory: Path | None = None) -> None:
        import joblib

        model_directory = model_directory or Path(
            os.getenv("HANDPRACTICE_NUMBER_MODEL_DIR", str(DEFAULT_MODEL_DIRECTORY)),
        )
        manifest_path = model_directory / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

        labels = tuple(str(value) for value in manifest["labels"])
        if labels != LABELS:
            raise ValueError("Number model manifest labels do not match the adapter contract")
        if str(manifest["featureVersion"]) != FEATURE_VERSION:
            raise ValueError(f"Number model must use feature {FEATURE_VERSION}")
        if int(manifest["featureSize"]) != FEATURE_SIZE:
            raise ValueError(f"Number model must accept {FEATURE_SIZE} feature values")
        if not bool(manifest.get("frameInput")):
            raise ValueError("Number model must declare frameInput; sequence bundles are a different contract")

        artifact_path = model_directory / str(manifest["artifact"])
        expected_hash = str(manifest["sha256"]).lower()
        if _sha256(artifact_path) != expected_hash:
            raise ValueError("Number model artifact hash does not match its manifest")

        self._model = joblib.load(artifact_path)
        # Column order of predict_proba follows classes_, not the label tuple.
        # Verify rather than assume, so a retrained bundle cannot silently
        # shuffle probabilities onto the wrong symbols.
        classes = getattr(self._model, "classes_", None)
        if classes is not None and not np.array_equal(np.asarray(classes), np.arange(len(LABELS))):
            raise ValueError("Number model classes_ must be 0..N-1 in manifest label order")

        self._contract = NumberModelContract(
            labels=labels,
            feature_size=FEATURE_SIZE,
            feature_version=FEATURE_VERSION,
            model_version=str(manifest["modelVersion"]),
        )

    @property
    def contract(self) -> NumberModelContract:
        return self._contract

    def predict_features(self, features: np.ndarray) -> np.ndarray:
        """Classify a batch of `[samples, 78]` features."""
        values = np.asarray(features, dtype=np.float32)
        if values.ndim != 2 or values.shape[1] != self._contract.feature_size:
            raise ValueError(f"Expected [samples, {self._contract.feature_size}] input, got {values.shape}")
        output = np.asarray(self._model.predict_proba(values), dtype=np.float32)
        if output.shape != (len(values), self._contract.output_size):
            raise ValueError(f"Expected [{len(values)}, {self._contract.output_size}] output, got {output.shape}")
        return output

    def predict_feature(self, feature: np.ndarray) -> np.ndarray:
        """Classify one already-extracted `[78]` feature."""
        return self.predict_features(np.asarray(feature, dtype=np.float32)[None, :])[0]

    def predict_frame(self, landmarks: Sequence[Landmark], handedness: str = "RIGHT") -> np.ndarray:
        """Classify one MediaPipe frame end to end."""
        if len(landmarks) != LANDMARK_COUNT:
            raise ValueError(f"Expected {LANDMARK_COUNT} landmarks, got {len(landmarks)}")
        return self.predict_feature(landmarks_to_feature(landmarks, handedness))

    def top_candidates(self, probabilities: np.ndarray, limit: int = 5) -> list[dict[str, object]]:
        values = np.asarray(probabilities, dtype=np.float32)
        if values.shape != (self._contract.output_size,):
            raise ValueError(f"Expected {self._contract.output_size} probabilities, got {values.shape}")
        order = np.argsort(-values, kind="stable")[:limit]
        return [
            {"symbol": self._contract.labels[int(index)], "confidence": float(values[int(index)])}
            for index in order
        ]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
