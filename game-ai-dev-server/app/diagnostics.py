from __future__ import annotations

import json
import os
import threading
from pathlib import Path

import numpy as np


# Prediction diagnostics — an append-only JSONL of what the model actually
# received on frames the browser could not confirm.
#
# Why this exists: the frontal-jamo failure (ㅓ ㅕ ㅔ ㅖ) has now survived four
# hypotheses that were all tested by *transforming the stored capture videos* —
# depth noise, pitch rotation, fingertip jitter, and flipped handedness. None of
# them reproduced it (see T-153~T-156 in docs/recognition/model-evaluation.md).
# The common flaw is that the stored data does not contain the failing condition
# in the first place: 31 clips, one signer, and the frontal poses that break are
# barely represented. No amount of augmenting that data can recreate the bug.
#
# So stop guessing and record the real input. Each entry holds the raw landmarks
# exactly as they arrived, the handedness the frontend claimed, and the full
# probability vector, so the features can be recomputed offline and compared
# against training data.
#
# The margin gate scales every probability by a constant, which means the vector
# no longer sums to 1 once it fires. `probabilitySum` is therefore a reliable
# after-the-fact detector of suppression, and `relativeGap` = (p1-p2)/p1 is
# scale-invariant, so both survive gating without the adapter having to expose
# its internals.
#
# Landmarks are coordinates, not imagery — no video or frame is ever written.
DIAGNOSTICS_PATH = os.getenv("HANDPRACTICE_AI_DIAG_PATH", "").strip()
# Hard cap so a long session cannot fill the disk. Counted per process.
DIAGNOSTICS_MAX_FRAMES = int(os.getenv("HANDPRACTICE_AI_DIAG_MAX_FRAMES", "20000"))
# "blocked" — only frames the browser cannot confirm (gate fired, or top-1 below
#             the lowest readiness threshold). This is the failure we are chasing.
# "all"     — every frame. Use only for short, deliberate captures.
DIAGNOSTICS_MODE = os.getenv("HANDPRACTICE_AI_DIAG_MODE", "blocked").strip().lower()
# Frames whose top-1 is below this are treated as unconfirmable. Matches the
# readiness thresholds, which are 0.5 for every jamo.
DIAGNOSTICS_CONFIRM_FLOOR = float(os.getenv("HANDPRACTICE_AI_DIAG_CONFIRM_FLOOR", "0.5"))


class PredictionDiagnostics:
    """Writes one JSON object per recorded frame. Disabled unless a path is set."""

    def __init__(
        self,
        path: str = DIAGNOSTICS_PATH,
        max_frames: int = DIAGNOSTICS_MAX_FRAMES,
        mode: str = DIAGNOSTICS_MODE,
        confirm_floor: float = DIAGNOSTICS_CONFIRM_FLOOR,
    ) -> None:
        self._path = Path(path) if path else None
        self._max_frames = max(0, int(max_frames))
        self._mode = mode if mode in {"blocked", "all"} else "blocked"
        self._confirm_floor = float(confirm_floor)
        self._written = 0
        self._lock = threading.Lock()
        self._stopped_logged = False
        if self._path is not None:
            self._path.parent.mkdir(parents=True, exist_ok=True)

    @property
    def enabled(self) -> bool:
        return self._path is not None and self._max_frames > 0

    @property
    def written(self) -> int:
        return self._written

    @property
    def mode(self) -> str:
        return self._mode

    def _should_record(self, probability_sum: float, top_probability: float) -> bool:
        if self._mode == "all":
            return True
        # Gate fired (vector no longer normalised) or too weak to ever confirm.
        return probability_sum < 0.5 or top_probability < self._confirm_floor

    def record(
        self,
        *,
        frame_id: int,
        captured_at: int,
        handedness: str,
        landmarks: tuple[object, ...],
        labels: tuple[str, ...],
        probabilities: np.ndarray,
        buffered_frames: int,
    ) -> None:
        """Never raises: diagnostics must not be able to break recognition."""
        if not self.enabled:
            return
        try:
            values = np.asarray(probabilities, dtype=np.float64)
            probability_sum = float(values.sum())
            order = np.argsort(-values, kind="stable")[:5]
            top = float(values[order[0]])
            runner_up = float(values[order[1]]) if len(order) > 1 else 0.0
            if not self._should_record(probability_sum, top):
                return
            with self._lock:
                if self._written >= self._max_frames:
                    if not self._stopped_logged:
                        self._stopped_logged = True
                        self._append({"type": "DIAGNOSTICS_STOPPED", "writtenFrames": self._written})
                    return
                self._written += 1
                entry = {
                    "frameId": int(frame_id),
                    "capturedAt": int(captured_at),
                    "handedness": handedness,
                    "bufferedFrames": int(buffered_frames),
                    "probabilitySum": round(probability_sum, 6),
                    "gateFired": probability_sum < 0.5,
                    "relativeGap": round((top - runner_up) / top, 6) if top > 0 else 0.0,
                    "top": [
                        {"symbol": labels[int(index)], "probability": round(float(values[int(index)]), 6)}
                        for index in order
                    ],
                    "landmarks": [
                        [round(float(point.x), 5), round(float(point.y), 5), round(float(point.z), 5)]
                        for point in landmarks
                    ],
                }
                self._append(entry)
        except Exception:  # noqa: BLE001 - diagnostics are best-effort only
            return

    def _append(self, entry: dict[str, object]) -> None:
        assert self._path is not None
        with self._path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(entry, ensure_ascii=False) + "\n")
