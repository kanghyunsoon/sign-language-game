from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np

from .feature_adapter import LANDMARK_COUNT, landmarks_to_features
from .messages import Landmark, prediction_message
from .model_adapter import ModelContract, ModelRunner


@dataclass(frozen=True)
class RecognitionConfig:
    hand_release_after_ms: int = 160


class RecognitionSession:
    """Connection-local model history; confirmation belongs to the browser decoder.

    The jamo build runs a dual-head ensemble, so each frame is converted into
    both the feature_v2 (55) and feature_v3 (78) representation from the same
    MediaPipe landmarks and buffered in parallel.
    """

    def __init__(self, runner: ModelRunner, config: RecognitionConfig = RecognitionConfig()) -> None:
        self._runner = runner
        self._config = config
        length = runner.contract.sequence_length
        self._sequence_v2: deque[np.ndarray] = deque(maxlen=length)
        self._sequence_v3: deque[np.ndarray] = deque(maxlen=length)
        self._missing_since: int | None = None

    @property
    def contract(self) -> ModelContract:
        return self._runner.contract

    def _padded(self, frames: list[np.ndarray], length: int) -> np.ndarray:
        if len(frames) < length:
            frames = [frames[0]] * (length - len(frames)) + frames
        return np.expand_dims(np.asarray(frames, dtype=np.float32), axis=0)

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
        feature_v2, feature_v3 = landmarks_to_features(landmarks, handedness)
        self._sequence_v2.append(feature_v2)
        self._sequence_v3.append(feature_v3)

        length = self._runner.contract.sequence_length
        sequence_v2 = self._padded(list(self._sequence_v2), length)
        sequence_v3 = self._padded(list(self._sequence_v3), length)

        predict_pair = getattr(self._runner, "predict_pair", None)
        if predict_pair is not None:
            prediction = predict_pair(sequence_v2, sequence_v3)
        else:
            prediction = self._runner.predict(sequence_v3)

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
            self._sequence_v2.clear()
            self._sequence_v3.clear()
        return []

    def reset(self) -> None:
        self._sequence_v2.clear()
        self._sequence_v3.clear()
        self._missing_since = None
