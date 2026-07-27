from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
from typing import Protocol

import numpy as np

from .project_paths import REPOSITORY_ROOT


# Jamo-only build. Number recognition has been split out into a separately
# developed model, so all number/expanded/hybrid heads are removed here and the
# server recognises the 31 Hangul fingerspelling jamo only.
#
# MODEL_VERSION is the *class contract* version (the 31-jamo label set and output
# order that game-contracts/recognition/readiness.json pins), not the trained
# head version. Retraining the head — including the feature_v2 -> feature_v3
# switch and the jamo-31-v3 bundle below — keeps the same class contract, so this
# stays "jamo-31-v1" and readiness.json needs no change. Bump it only when the
# label set or output order itself changes.
MODEL_VERSION = "jamo-31-v1"
LABELS = (
    "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
    "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅔ", "ㅖ", "ㅢ", "ㅚ", "ㅟ",
)
# Retrained jamo head on feature_v3 (3-D directions + palm normal, 78 values).
# Trained from the jamo capture videos; see docs/recognition/model-evaluation.md.
DEFAULT_MODEL_PATH = REPOSITORY_ROOT / "models" / "jamo-31-v3" / "jamo-31-v3.tflite"
READINESS_PATH = REPOSITORY_ROOT / "game-contracts" / "recognition" / "readiness.json"


def load_recognition_readiness() -> dict[str, object]:
    """Load the 31-jamo safety gate for the fingerspelling deployment.

    The contract fixes the jamo class set and TFLite output order. Numbers are
    handled by a separate model and are not part of this gate.
    """
    payload = json.loads(READINESS_PATH.read_text(encoding="utf-8"))
    if payload.get("modelVersion") != MODEL_VERSION:
        raise ValueError("Recognition readiness must describe the jamo head")
    classes = payload.get("classes")
    symbols = [item.get("symbol") for item in classes if isinstance(item, dict)] if isinstance(classes, list) else []
    if symbols != list(LABELS):
        raise ValueError("Recognition readiness classes do not match TFLite output order")
    return payload


@dataclass(frozen=True)
class ModelContract:
    labels: tuple[str, ...]
    sequence_length: int
    feature_size: int
    output_size: int
    model_version: str = MODEL_VERSION

    def __post_init__(self) -> None:
        if self.output_size != len(self.labels):
            raise ValueError(
                f"Model output size {self.output_size} does not match {len(self.labels)} labels",
            )
        if len(set(self.labels)) != len(self.labels):
            raise ValueError("Model labels must be unique")
        if self.sequence_length <= 0 or self.feature_size <= 0:
            raise ValueError("Model input dimensions must be positive")


class ModelRunner(Protocol):
    @property
    def contract(self) -> ModelContract: ...

    def predict(self, sequence: np.ndarray) -> np.ndarray: ...


class TFLiteModelAdapter:
    """Thin adapter around the jamo TFLite model."""

    def __init__(self, model_path: Path = DEFAULT_MODEL_PATH) -> None:
        import tensorflow as tf

        if not model_path.is_file():
            raise FileNotFoundError(f"TFLite model not found: {model_path}")

        self._interpreter = tf.lite.Interpreter(model_path=str(model_path), num_threads=4)
        self._interpreter.allocate_tensors()
        self._input = self._interpreter.get_input_details()[0]
        self._output = self._interpreter.get_output_details()[0]
        input_shape = tuple(int(value) for value in self._input["shape"])
        output_shape = tuple(int(value) for value in self._output["shape"])

        if len(input_shape) != 3 or input_shape[0] != 1:
            raise ValueError(f"Expected [1, sequence, feature] input, got {input_shape}")
        if len(output_shape) != 2 or output_shape[0] != 1:
            raise ValueError(f"Expected [1, classes] output, got {output_shape}")
        if self._input["dtype"] != np.float32 or self._output["dtype"] != np.float32:
            raise ValueError("The model must use float32 input and output tensors")

        self._contract = ModelContract(
            labels=LABELS,
            sequence_length=input_shape[1],
            feature_size=input_shape[2],
            output_size=output_shape[1],
        )

    @property
    def contract(self) -> ModelContract:
        return self._contract

    def predict(self, sequence: np.ndarray) -> np.ndarray:
        expected_shape = (1, self.contract.sequence_length, self.contract.feature_size)
        if sequence.shape != expected_shape:
            raise ValueError(f"Expected model input {expected_shape}, got {sequence.shape}")

        input_data = np.asarray(sequence, dtype=np.float32)
        self._interpreter.set_tensor(self._input["index"], input_data)
        self._interpreter.invoke()
        output = np.asarray(self._interpreter.get_tensor(self._output["index"])[0], dtype=np.float32)
        if output.shape != (self.contract.output_size,):
            raise ValueError(f"Expected model output {(self.contract.output_size,)}, got {output.shape}")
        return output


def create_model_runner(profile: str | None = None) -> ModelRunner:
    selected = (profile or os.getenv("HANDPRACTICE_AI_MODEL", "baseline")).strip().lower()
    if selected == "baseline":
        return TFLiteModelAdapter()
    raise ValueError(
        "HANDPRACTICE_AI_MODEL must be 'baseline' (jamo-only build; number recognition is a separate model)",
    )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
