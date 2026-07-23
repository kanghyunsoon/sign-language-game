from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np

from .feature_adapter import FEATURE_SIZE, LANDMARK_COUNT, landmarks_to_feature
from .messages import Landmark, prediction_message
from .model_adapter import ModelContract, ModelRunner


@dataclass(frozen=True)
class RecognitionConfig:
    hand_release_after_ms: int = 160


class RecognitionSession:
    """Connection-local model history; confirmation belongs to the browser decoder."""

    def __init__(self, runner: ModelRunner, config: RecognitionConfig = RecognitionConfig()) -> None:
        if runner.contract.feature_size != FEATURE_SIZE:
            raise ValueError(
                f"Feature adapter produces {FEATURE_SIZE} values, model expects {runner.contract.feature_size}",
            )
        self._runner = runner
        self._config = config
        self._sequence: deque[np.ndarray] = deque(maxlen=runner.contract.sequence_length)
        self._missing_since: int | None = None

    @property
    def contract(self) -> ModelContract:
        return self._runner.contract

    def process_landmark_frame(
        self,
        frame_id: int,
        captured_at: int,
        landmarks: tuple[Landmark, ...],
        handedness: str = "RIGHT",
    ) -> list[dict[str, object]]:
        if len(landmarks) != LANDMARK_COUNT:
            raise ValueError(f"Expected {LANDMARK_COUNT} landmarks, got {len(landmarks)}")
        self._missing_since = None
        self._sequence.append(landmarks_to_feature(landmarks, handedness))
        frames = list(self._sequence)
        if len(frames) < self._runner.contract.sequence_length:
            frames = [frames[0]] * (self._runner.contract.sequence_length - len(frames)) + frames
        sequence = np.expand_dims(np.asarray(frames, dtype=np.float32), axis=0)
        prediction = self._runner.predict(sequence)
        if prediction.shape != (self._runner.contract.output_size,):
            raise ValueError(
                f"Expected {self._runner.contract.output_size} prediction values, got {prediction.shape}",
            )
        if not np.all(np.isfinite(prediction)) or np.any(prediction < 0) or np.any(prediction > 1):
            raise ValueError("Model prediction values must be finite probabilities between 0 and 1")
        label_index = int(np.argmax(prediction))
        symbol = self._runner.contract.labels[label_index]
        confidence = float(prediction[label_index])
        candidate_indexes = np.argsort(-prediction, kind="stable")[:5]
        top_candidates = [
            {"symbol": self._runner.contract.labels[int(index)], "confidence": float(prediction[int(index)])}
            for index in candidate_indexes
        ]
        # The frontend temporal decoder applies calibrated confidence, stability,
        # duplicate-lock, and neutral-release rules. The server never confirms.
        return [prediction_message(frame_id, symbol, confidence, False, captured_at, top_candidates)]

    def process_hand_not_detected(self, captured_at: int) -> list[dict[str, object]]:
        if self._missing_since is None:
            self._missing_since = captured_at
        elif captured_at - self._missing_since >= self._config.hand_release_after_ms:
            self._sequence.clear()
        return []

    def reset(self) -> None:
        self._sequence.clear()
        self._missing_since = None
