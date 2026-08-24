from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
from typing import Protocol

import numpy as np

from .project_paths import AI_ROOT


# Jamo-only build. Number recognition has been split out into a separately
# developed model, so all number/expanded/hybrid heads are removed here and the
# server recognises the 31 Hangul fingerspelling jamo only.
#
# MODEL_VERSION is the *class contract* version (the 31-jamo label set and output
# order that ai/contracts/recognition/readiness.json pins), not the trained
# head version. Retraining the heads — including the dual-head ensemble below —
# keeps the same class contract, so this stays "jamo-31-v1" and readiness.json
# needs no change. Bump it only when the label set or output order changes.
MODEL_VERSION = "jamo-31-v1"
LABELS = (
    "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
    "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅔ", "ㅖ", "ㅢ", "ㅚ", "ㅟ",
)

# Dual-head ensemble (see docs/recognition/model-evaluation.md):
#   v2 head — feature_v2 (55), trained on session captures + capture video
#   v3 head — feature_v3 (78), trained on capture video, adds depth/palm normal
# Probabilities are averaged with ENSEMBLE_WEIGHT on the v2 head.
MODEL_DIRECTORY = AI_ROOT / "models" / "jamo-31-ensemble-v1"
V2_MODEL_PATH = MODEL_DIRECTORY / "jamo31-v2big.tflite"
V3_MODEL_PATH = MODEL_DIRECTORY / "jamo31-v3.tflite"
ENSEMBLE_WEIGHT = 0.5
SEQUENCE_LENGTH = 10

# Decision-margin gate (top1 - top2).
#
# The model is deliberately tolerant — rotation augmentation makes it accept a
# wide range of wrist angles — so a sloppy handshape still gets a high top-1
# probability. Raising the confirmation threshold does not fix that: it mostly
# blocks the jamo whose absolute confidence is naturally lower (measured: at
# threshold 0.6, ㅅ loses 16% of its frames while zero sloppy inputs are
# rejected). The separating signal is the *gap* to the runner-up.
#
# Measured on the locked test split (1900 sequences, jamo-31-ensemble-v2):
#   correct frames  median gap 0.984 (p5 0.293)
#   wrong frames    median gap 0.159 (p25 0.083)
#
#   gap    correct kept    wrong rejected
#   0.00       1.000            0.000
#   0.20       0.965            0.600
#   0.25 →     0.957            0.733     (default: balanced)
#   0.30       0.949            0.833
#   0.40       0.934            0.933     (stricter practice mode)
#
# When the gap is below MINIMUM_DECISION_MARGIN the prediction is reported with
# a suppressed confidence, so the browser's temporal decoder never confirms it.
# The argmax label is left untouched, so top-candidate feedback still shows what
# the handshape leaned towards. Tune with HANDPRACTICE_AI_MIN_MARGIN.
MINIMUM_DECISION_MARGIN = float(os.getenv("HANDPRACTICE_AI_MIN_MARGIN", "0.25"))
SUPPRESSED_CONFIDENCE = 0.05
READINESS_PATH = AI_ROOT / "contracts" / "recognition" / "readiness.json"


def load_recognition_readiness() -> dict[str, object]:
    """Load the 31-jamo safety gate for the fingerspelling deployment.

    The contract fixes the jamo class set and output order. Numbers are handled
    by a separate model and are not part of this gate.
    """
    payload = json.loads(READINESS_PATH.read_text(encoding="utf-8"))
    if payload.get("modelVersion") != MODEL_VERSION:
        raise ValueError("Recognition readiness must describe the jamo head")
    classes = payload.get("classes")
    symbols = [item.get("symbol") for item in classes if isinstance(item, dict)] if isinstance(classes, list) else []
    if symbols != list(LABELS):
        raise ValueError("Recognition readiness classes do not match model output order")
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


class _TFLiteHead:
    """One TFLite head with a fixed [1, sequence, feature] float32 contract."""

    def __init__(self, model_path: Path) -> None:
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
        self.sequence_length = input_shape[1]
        self.feature_size = input_shape[2]
        self.output_size = output_shape[1]

    def predict(self, sequence: np.ndarray) -> np.ndarray:
        expected = (1, self.sequence_length, self.feature_size)
        if sequence.shape != expected:
            raise ValueError(f"Expected model input {expected}, got {sequence.shape}")
        self._interpreter.set_tensor(self._input["index"], np.asarray(sequence, dtype=np.float32))
        self._interpreter.invoke()
        return np.asarray(self._interpreter.get_tensor(self._output["index"])[0], dtype=np.float32)


class EnsembleModelAdapter:
    """Dual-head jamo recogniser: feature_v2 head + feature_v3 head, averaged.

    ``predict`` takes the pair of per-frame feature sequences produced by
    ``feature_adapter.landmarks_to_features`` and returns the averaged 31-class
    probability vector.
    """

    def __init__(
        self,
        v2_model_path: Path = V2_MODEL_PATH,
        v3_model_path: Path = V3_MODEL_PATH,
        weight: float = ENSEMBLE_WEIGHT,
        minimum_margin: float = MINIMUM_DECISION_MARGIN,
    ) -> None:
        self._minimum_margin = float(minimum_margin)
        self._v2 = _TFLiteHead(v2_model_path)
        self._v3 = _TFLiteHead(v3_model_path)
        if self._v2.sequence_length != self._v3.sequence_length:
            raise ValueError("Ensemble heads must share the same sequence length")
        if self._v2.output_size != self._v3.output_size:
            raise ValueError("Ensemble heads must share the same class count")
        if not 0.0 <= weight <= 1.0:
            raise ValueError("Ensemble weight must be between 0 and 1")
        self._weight = float(weight)
        self._contract = ModelContract(
            labels=LABELS,
            sequence_length=self._v2.sequence_length,
            feature_size=self._v3.feature_size,
            output_size=self._v3.output_size,
        )

    @property
    def contract(self) -> ModelContract:
        return self._contract

    @property
    def feature_sizes(self) -> tuple[int, int]:
        return self._v2.feature_size, self._v3.feature_size

    @property
    def minimum_margin(self) -> float:
        return self._minimum_margin

    def _apply_margin_gate(self, probabilities: np.ndarray) -> np.ndarray:
        """Suppress the reported confidence when top1 and top2 are too close.

        A sloppy handshape sits between two jamo, so its runner-up stays high.
        Scaling the winner down to SUPPRESSED_CONFIDENCE keeps the label (useful
        for top-candidate feedback) while making sure the browser's temporal
        decoder cannot confirm it.
        """
        if self._minimum_margin <= 0.0:
            return probabilities
        ordered = np.sort(probabilities)
        if float(ordered[-1] - ordered[-2]) >= self._minimum_margin:
            return probabilities
        gated = probabilities * (SUPPRESSED_CONFIDENCE / max(float(ordered[-1]), 1e-6))
        return np.clip(gated, 0.0, 1.0).astype(np.float32)

    def predict_pair(self, v2_sequence: np.ndarray, v3_sequence: np.ndarray) -> np.ndarray:
        probabilities = (
            self._weight * self._v2.predict(v2_sequence)
            + (1.0 - self._weight) * self._v3.predict(v3_sequence)
        )
        output = np.asarray(probabilities, dtype=np.float32)
        if output.shape != (self.contract.output_size,):
            raise ValueError(f"Expected model output {(self.contract.output_size,)}, got {output.shape}")
        return self._apply_margin_gate(output)

    def predict(self, sequence: np.ndarray) -> np.ndarray:
        """Accepts the v3 sequence alone; both heads need the pair, so callers
        that have only one feature set fall back to the v3 head."""
        return self._apply_margin_gate(self._v3.predict(sequence))


def create_model_runner(profile: str | None = None) -> ModelRunner:
    selected = (profile or os.getenv("HANDPRACTICE_AI_MODEL", "ensemble")).strip().lower()
    if selected in {"ensemble", "baseline"}:
        return EnsembleModelAdapter()
    raise ValueError(
        "HANDPRACTICE_AI_MODEL must be 'ensemble' (jamo-only build; number recognition is a separate model)",
    )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
