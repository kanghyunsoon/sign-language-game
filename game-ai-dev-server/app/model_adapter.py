from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
from typing import Protocol

import numpy as np

from .project_paths import REPOSITORY_ROOT


MODEL_VERSION = "jamo-31-v1"
LABELS = (
    "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
    "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅔ", "ㅖ", "ㅢ", "ㅚ", "ㅟ",
)
DEFAULT_MODEL_PATH = REPOSITORY_ROOT / "models" / "multi_hand_gesture_classifier.tflite"
EXPANDED_MODEL_DIRECTORY = REPOSITORY_ROOT / "models" / "jamo-number-41-tree-v1"
NUMBER_LABELS = tuple(str(value) for value in range(1, 11))
EXPANDED_LABELS = LABELS + NUMBER_LABELS
READINESS_PATH = REPOSITORY_ROOT / "game-contracts" / "recognition" / "readiness.json"


def load_recognition_readiness() -> dict[str, object]:
    """Load the jamo safety gate shared by baseline and hybrid deployments.

    The hybrid profile retains this exact 31-jamo head and adds a separately
    versioned number head. Its number labels are exposed through CAPABILITIES,
    while this contract remains the safety gate for the unchanged jamo head.
    """
    payload = json.loads(READINESS_PATH.read_text(encoding="utf-8"))
    if payload.get("modelVersion") != MODEL_VERSION:
        raise ValueError("Recognition readiness must describe the baseline jamo head")
    classes = payload.get("classes")
    symbols = [item.get("symbol") for item in classes if isinstance(item, dict)] if isinstance(classes, list) else []
    if symbols != list(LABELS):
        raise ValueError("Recognition readiness classes do not match baseline TFLite output order")
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
    """Thin adapter around the unchanged repository TFLite model."""

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
            raise ValueError("The existing model must use float32 input and output tensors")

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


class TreeModelAdapter:
    """Adapter for the independently versioned sklearn model bundle."""

    def __init__(self, model_directory: Path | None = None) -> None:
        import joblib

        model_directory = model_directory or Path(
            os.getenv("HANDPRACTICE_EXPANDED_MODEL_DIR", str(EXPANDED_MODEL_DIRECTORY)),
        )
        manifest_path = model_directory / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        labels = tuple(str(value) for value in manifest["labels"])
        if labels != EXPANDED_LABELS:
            raise ValueError("Expanded model manifest labels do not match the server contract")
        artifact_path = model_directory / str(manifest["artifact"])
        expected_hash = str(manifest["sha256"]).lower()
        actual_hash = _sha256(artifact_path)
        if actual_hash != expected_hash:
            raise ValueError("Expanded model artifact hash does not match its manifest")
        self._model = joblib.load(artifact_path)
        self._contract = ModelContract(
            labels=labels,
            sequence_length=int(manifest["sequenceLength"]),
            feature_size=int(manifest["featureSize"]),
            output_size=len(labels),
            model_version=str(manifest["modelVersion"]),
        )

    @property
    def contract(self) -> ModelContract:
        return self._contract

    def predict(self, sequence: np.ndarray) -> np.ndarray:
        expected_shape = (1, self.contract.sequence_length, self.contract.feature_size)
        if sequence.shape != expected_shape:
            raise ValueError(f"Expected model input {expected_shape}, got {sequence.shape}")
        values = np.asarray(sequence[0], dtype=np.float32)
        summary = np.concatenate(
            (values[-1], values.mean(axis=0), values.std(axis=0), values[-1] - values[0]),
        )[None, :]
        output = np.asarray(self._model.predict_proba(summary)[0], dtype=np.float32)
        if output.shape != (self.contract.output_size,):
            raise ValueError(f"Expected model output {(self.contract.output_size,)}, got {output.shape}")
        return output


class HybridModelAdapter:
    """Keeps the proven game jamo head and adds the independently tested number head.

    The tree model selects the jamo/number domain. Jamo probabilities come from the
    unchanged production TFLite model, so enabling number recognition cannot alter
    existing game predictions within the jamo domain.
    """

    def __init__(self) -> None:
        self._jamo = TFLiteModelAdapter()
        self._expanded = TreeModelAdapter()
        self._contract = ModelContract(
            labels=EXPANDED_LABELS,
            sequence_length=self._jamo.contract.sequence_length,
            feature_size=self._jamo.contract.feature_size,
            output_size=len(EXPANDED_LABELS),
            model_version="jamo-number-hybrid-v1",
        )

    @property
    def contract(self) -> ModelContract:
        return self._contract

    def predict(self, sequence: np.ndarray) -> np.ndarray:
        domain_probabilities = self._expanded.predict(sequence)
        if int(domain_probabilities.argmax()) >= len(LABELS):
            return domain_probabilities
        output = np.zeros(len(EXPANDED_LABELS), dtype=np.float32)
        output[: len(LABELS)] = self._jamo.predict(sequence)
        return output


def create_model_runner(profile: str | None = None) -> ModelRunner:
    selected = (profile or os.getenv("HANDPRACTICE_AI_MODEL", "baseline")).strip().lower()
    if selected == "baseline":
        return TFLiteModelAdapter()
    if selected == "expanded":
        return TreeModelAdapter()
    if selected == "hybrid":
        return HybridModelAdapter()
    raise ValueError("HANDPRACTICE_AI_MODEL must be baseline, expanded, or hybrid")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
