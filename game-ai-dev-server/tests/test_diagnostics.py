from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.diagnostics import PredictionDiagnostics
from app.messages import Landmark

LABELS = tuple("ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣㅐㅒㅔㅖㅢㅚㅟ")


def landmarks() -> tuple[Landmark, ...]:
    return tuple(Landmark(0.01 * index, 0.02 * index, 0.003 * index) for index in range(21))


def confident() -> np.ndarray:
    values = np.full(31, 0.001, dtype=np.float32)
    values[17] = 0.97  # ㅕ
    return values


def gated() -> np.ndarray:
    """What the margin gate emits: every probability scaled so top-1 is 0.05."""
    values = np.full(31, 0.0005, dtype=np.float32)
    values[17] = 0.05
    values[27] = 0.045
    return values


class PredictionDiagnosticsTests(unittest.TestCase):
    def test_disabled_without_a_path(self) -> None:
        recorder = PredictionDiagnostics(path="")
        self.assertFalse(recorder.enabled)
        # Must be a no-op rather than an error.
        recorder.record(
            frame_id=1, captured_at=1000, handedness="RIGHT", landmarks=landmarks(),
            labels=LABELS, probabilities=confident(), buffered_frames=10,
        )
        self.assertEqual(recorder.written, 0)

    def test_blocked_mode_records_gated_frames_and_skips_confirmable_ones(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "nested" / "predictions.jsonl"
            recorder = PredictionDiagnostics(path=str(path), mode="blocked")
            self.assertTrue(recorder.enabled)
            # Confirmable: sums to ~1 and top-1 is well above the floor.
            recorder.record(
                frame_id=1, captured_at=1000, handedness="RIGHT", landmarks=landmarks(),
                labels=LABELS, probabilities=confident(), buffered_frames=10,
            )
            self.assertEqual(recorder.written, 0)
            # Gate fired: the vector no longer sums to 1.
            recorder.record(
                frame_id=2, captured_at=1050, handedness="LEFT", landmarks=landmarks(),
                labels=LABELS, probabilities=gated(), buffered_frames=10,
            )
            self.assertEqual(recorder.written, 1)

            entry = json.loads(path.read_text(encoding="utf-8").strip())
            self.assertEqual(entry["frameId"], 2)
            self.assertEqual(entry["handedness"], "LEFT")
            self.assertTrue(entry["gateFired"])
            self.assertEqual(entry["top"][0]["symbol"], "ㅕ")
            self.assertEqual(entry["top"][1]["symbol"], "ㅖ")
            # 21 landmarks, each x/y/z, so the frame can be replayed offline.
            self.assertEqual(len(entry["landmarks"]), 21)
            self.assertEqual(len(entry["landmarks"][0]), 3)
            # (0.05 - 0.045) / 0.05
            self.assertAlmostEqual(entry["relativeGap"], 0.1, places=4)

    def test_all_mode_records_everything(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "predictions.jsonl"
            recorder = PredictionDiagnostics(path=str(path), mode="all")
            recorder.record(
                frame_id=1, captured_at=1000, handedness="RIGHT", landmarks=landmarks(),
                labels=LABELS, probabilities=confident(), buffered_frames=10,
            )
            self.assertEqual(recorder.written, 1)

    def test_frame_cap_stops_writing_and_records_why(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "predictions.jsonl"
            recorder = PredictionDiagnostics(path=str(path), mode="all", max_frames=2)
            for frame_id in range(6):
                recorder.record(
                    frame_id=frame_id, captured_at=1000 + frame_id, handedness="RIGHT",
                    landmarks=landmarks(), labels=LABELS, probabilities=confident(), buffered_frames=10,
                )
            self.assertEqual(recorder.written, 2)
            lines = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
            # Two frames plus a single stop marker, not one marker per dropped frame.
            self.assertEqual(len(lines), 3)
            self.assertEqual(lines[-1]["type"], "DIAGNOSTICS_STOPPED")

    def test_bad_input_never_raises(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            recorder = PredictionDiagnostics(path=str(Path(directory) / "p.jsonl"), mode="all")
            # Landmarks without x/y/z must not take recognition down with them.
            recorder.record(
                frame_id=1, captured_at=1000, handedness="RIGHT", landmarks=("bogus",),
                labels=LABELS, probabilities=confident(), buffered_frames=10,
            )
            self.assertEqual(recorder.written, 1)  # counted, then failed while serialising


if __name__ == "__main__":
    unittest.main()
