from __future__ import annotations

import json
import unittest
from unittest.mock import ANY

import numpy as np

from app.diagnostics import PredictionDiagnostics
from app.feature_adapter import FEATURE_SIZE
from app.messages import Landmark, capabilities_message, parse_request
from app.model_adapter import (
    LABELS,
    MODEL_VERSION,
    SUPPRESSED_CONFIDENCE,
    ModelContract,
    load_recognition_readiness,
)
from app.recognition_session import LANDMARK_SMOOTHING_ALPHA, RecognitionConfig, RecognitionSession
from tests.helpers import MockModelRunner, landmark_frame
from app import handshape_gate
from app import orientation_gate
from tests.test_handshape_gate import bieup, hieut, open_hand, plain_fist


def parsed_landmarks(frame_id: int, captured_at: int) -> tuple[Landmark, ...]:
    request = parse_request(landmark_frame(frame_id, captured_at))
    return request.landmarks


class RecognitionSessionTests(unittest.TestCase):
    def test_predicts_immediately_with_a_padded_sequence(self) -> None:
        runner = MockModelRunner([np.array([0.95, 0.05], dtype=np.float32)])
        events = RecognitionSession(runner).process_landmark_frame(1, 1000, parsed_landmarks(1, 1000))
        self.assertEqual([event["type"] for event in events], ["PREDICTION"])
        self.assertFalse(events[0]["isStable"])
        self.assertEqual(events[0]["topCandidates"], [
            {"symbol": "ㄱ", "confidence": ANY},
            {"symbol": "ㄴ", "confidence": ANY},
        ])
        self.assertEqual(runner.calls[0].shape, (1, 2, FEATURE_SIZE))

    def test_server_never_confirms_or_locks_a_held_pose(self) -> None:
        runner = MockModelRunner([np.array([0.95, 0.05], dtype=np.float32)] * 3)
        session = RecognitionSession(runner)
        events = []
        for frame_id in range(1, 4):
            events.extend(session.process_landmark_frame(frame_id, 1000 + frame_id * 10, parsed_landmarks(frame_id, 1000)))
        self.assertEqual([event["type"] for event in events], ["PREDICTION"] * 3)

    def test_hand_missing_clears_model_history_without_emitting_confirmation_events(self) -> None:
        runner = MockModelRunner([np.array([0.95, 0.05], dtype=np.float32)] * 2)
        session = RecognitionSession(runner, RecognitionConfig(hand_release_after_ms=100))
        session.process_landmark_frame(1, 1000, parsed_landmarks(1, 1000))
        self.assertEqual(session.process_hand_not_detected(1100), [])
        self.assertEqual(session.process_hand_not_detected(1200), [])
        session.process_landmark_frame(2, 1300, parsed_landmarks(2, 1300))
        self.assertEqual(runner.calls[-1].shape, (1, 2, FEATURE_SIZE))
        np.testing.assert_array_equal(runner.calls[-1][0, 0], runner.calls[-1][0, 1])

    def test_prediction_top_candidates_are_unique_sorted_and_match_top_one(self) -> None:
        runner = MockModelRunner([np.array([0.1, 0.6, 0.3], dtype=np.float32)], labels=("ㄱ", "ㄴ", "ㄷ"))
        event = RecognitionSession(runner).process_landmark_frame(1, 1000, parsed_landmarks(1, 1000))[0]
        self.assertEqual(event["symbol"], event["topCandidates"][0]["symbol"])
        self.assertAlmostEqual(event["confidence"], event["topCandidates"][0]["confidence"])
        self.assertEqual([item["symbol"] for item in event["topCandidates"]], ["ㄴ", "ㄷ", "ㄱ"])
        self.assertEqual(len({item["symbol"] for item in event["topCandidates"]}), 3)

    def test_capabilities_can_expose_readiness(self) -> None:
        runner = MockModelRunner([])
        readiness = {"confirmationAuthority": "FRONTEND_TEMPORAL_DECODER", "classes": [
            {"symbol": "ㄱ", "threshold": 0.5, "competitiveEligible": True},
            {"symbol": "ㄴ", "threshold": 0.9, "competitiveEligible": False},
        ]}
        message = capabilities_message(runner.contract.model_version, runner.contract.labels, runner.contract.sequence_length, readiness)
        self.assertEqual(message["supportedSymbols"], ["ㄱ", "ㄴ"])
        self.assertEqual(message["competitiveSymbols"], ["ㄱ"])
        self.assertEqual(message["confirmationAuthority"], "FRONTEND_TEMPORAL_DECODER")

    def test_capabilities_matches_the_full_readiness_contract(self) -> None:
        readiness = load_recognition_readiness()
        message = capabilities_message(MODEL_VERSION, LABELS, 10, readiness)
        self.assertEqual(message["confirmationAuthority"], "FRONTEND_TEMPORAL_DECODER")
        self.assertEqual(len(message["competitiveSymbols"]), 27)
        self.assertEqual(set(message["competitiveSymbols"]), {
            item["symbol"] for item in readiness["classes"] if item["competitiveEligible"]
        })
        self.assertEqual(len(message["confidenceThresholds"]), 31)
        self.assertEqual(message["confidenceThresholds"], {
            item["symbol"]: item["threshold"] for item in readiness["classes"]
        })

    def test_landmark_smoothing_suppresses_jitter_but_follows_real_movement(self) -> None:
        """Kept for when smoothing is re-enabled; it ships disabled (T-155).

        The EMA must damp an in-place oscillation while still tracking a sustained
        move, otherwise a real handshape change would lag forever.
        """
        session = RecognitionSession(MockModelRunner([]), smoothing_alpha=0.3)
        flat = tuple(Landmark(0.5, 0.5, 0.0) for _ in range(21))
        # Alternating jitter on one fingertip.
        for step in range(8):
            jittered = list(flat)
            jittered[8] = Landmark(0.5 + (0.02 if step % 2 == 0 else -0.02), 0.5, 0.0)
            smoothed = session._smooth(tuple(jittered), "RIGHT")
        # The oscillation is ±0.02 around 0.5; smoothing must land well inside it.
        self.assertLess(abs(smoothed[8].x - 0.5), 0.02)
        # A sustained one-way move must still be followed.
        session.reset()
        for step in range(20):
            moved = list(flat)
            moved[8] = Landmark(0.5 + 0.01 * step, 0.5, 0.0)
            smoothed = session._smooth(tuple(moved), "RIGHT")
        self.assertGreater(smoothed[8].x, 0.6)

    def test_landmark_smoothing_resets_on_hand_switch_and_release(self) -> None:
        session = RecognitionSession(MockModelRunner([]), RecognitionConfig(hand_release_after_ms=100), smoothing_alpha=0.3)
        left = tuple(Landmark(0.1, 0.1, 0.0) for _ in range(21))
        right = tuple(Landmark(0.9, 0.9, 0.0) for _ in range(21))
        session._smooth(left, "LEFT")
        # Switching hands must not blend the two trajectories.
        switched = session._smooth(right, "RIGHT")
        self.assertAlmostEqual(switched[0].x, 0.9, places=5)
        session.process_hand_not_detected(1000)
        session.process_hand_not_detected(1200)
        self.assertIsNone(session._smoothed)

    def test_smoothing_is_off_by_default(self) -> None:
        # Shipped disabled (T-155): the measured benefit came from synthetic
        # zero-mean jitter and did not hold in real use.
        self.assertAlmostEqual(LANDMARK_SMOOTHING_ALPHA, 1.0)
        session = RecognitionSession(MockModelRunner([]), smoothing_alpha=1.0)
        raw = tuple(Landmark(0.1 * index, 0.2, 0.3) for index in range(21))
        self.assertIs(session._smooth(raw, "RIGHT"), raw)

    def test_diagnostics_receive_the_raw_landmarks_and_full_probabilities(self) -> None:
        """The failing frames must be replayable offline, so log what arrived.

        Recording happens before argmax, and the landmarks handed over are the
        ones the frontend sent, not the smoothed copy.
        """
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "predictions.jsonl"
            recorder = PredictionDiagnostics(path=str(path), mode="all")
            runner = MockModelRunner([np.array([0.6, 0.4], dtype=np.float32)])
            session = RecognitionSession(runner, diagnostics=recorder)
            sent = parsed_landmarks(7, 1234)
            session.process_landmark_frame(7, 1234, sent, "LEFT")

            self.assertEqual(recorder.written, 1)
            entry = json.loads(path.read_text(encoding="utf-8").strip())
            self.assertEqual(entry["frameId"], 7)
            self.assertEqual(entry["handedness"], "LEFT")
            self.assertEqual(len(entry["landmarks"]), 21)
            self.assertAlmostEqual(entry["landmarks"][0][0], sent[0].x, places=4)
            self.assertAlmostEqual(entry["relativeGap"], (0.6 - 0.4) / 0.6, places=4)

    def test_diagnostics_default_to_off_so_nothing_is_written_unasked(self) -> None:
        runner = MockModelRunner([np.array([0.95, 0.05], dtype=np.float32)])
        session = RecognitionSession(runner)
        session.process_landmark_frame(1, 1000, parsed_landmarks(1, 1000))
        self.assertFalse(session._diagnostics.enabled)

    def test_rejects_labels_and_output_size_mismatch(self) -> None:
        with self.assertRaises(ValueError):
            ModelContract(labels=("ㄱ", "ㄴ"), sequence_length=10, feature_size=55, output_size=3)


class HandshapeGateWiringTests(unittest.TestCase):
    """The gate belongs here rather than in model_adapter: it needs the landmarks.

    ``model_adapter`` only ever sees feature vectors, and the thumb information the
    gate depends on is exactly what those features lose. The session is the last
    place the raw landmarks and the prediction exist together.
    """

    def setUp(self) -> None:
        # The gate ships disabled (T-158); the wiring is what these tests describe.
        self._original = handshape_gate.GATE_ENABLED
        handshape_gate.GATE_ENABLED = True
        # The orientation gate's ㅎ thumb check would also fire on these
        # synthetic fists; switch it off so the tests isolate handshape_gate.
        self._orientation_original = orientation_gate.GATE_ENABLED
        orientation_gate.GATE_ENABLED = False

    def tearDown(self) -> None:
        handshape_gate.GATE_ENABLED = self._original
        orientation_gate.GATE_ENABLED = self._orientation_original

    def test_a_disabled_gate_leaves_the_prediction_untouched(self) -> None:
        handshape_gate.GATE_ENABLED = False
        event = self._session_event(("ㅎ", "ㄴ"), [0.99, 0.01], plain_fist())
        self.assertAlmostEqual(event["confidence"], 0.99, places=5)
        self.assertNotIn("handshapeHint", event)

    def _session_event(self, labels: tuple[str, ...], probabilities: list[float], pose) -> dict[str, object]:
        runner = MockModelRunner([np.asarray(probabilities, dtype=np.float32)], labels=labels)
        session = RecognitionSession(runner)
        return session.process_landmark_frame(1, 1000, pose, "RIGHT")[0]

    def test_a_plain_fist_predicted_as_hieut_is_suppressed_below_every_threshold(self) -> None:
        event = self._session_event(("ㅎ", "ㄴ"), [0.99, 0.01], plain_fist())
        # The label survives for top-candidate feedback; the confidence does not.
        self.assertEqual(event["symbol"], "ㅎ")
        self.assertAlmostEqual(event["confidence"], SUPPRESSED_CONFIDENCE)
        self.assertLess(event["confidence"], 0.5)  # lowest readiness threshold
        self.assertAlmostEqual(event["topCandidates"][0]["confidence"], SUPPRESSED_CONFIDENCE)
        self.assertIn("엄지", event["handshapeHint"])

    def test_an_open_hand_predicted_as_bieup_is_suppressed(self) -> None:
        event = self._session_event(("ㅂ", "ㄴ"), [0.99, 0.01], open_hand())
        self.assertEqual(event["symbol"], "ㅂ")
        self.assertAlmostEqual(event["confidence"], SUPPRESSED_CONFIDENCE)
        self.assertIn("엄지", event["handshapeHint"])

    def test_correct_shapes_keep_their_confidence_and_carry_no_hint(self) -> None:
        for labels, pose in ((("ㅎ", "ㄴ"), hieut()), (("ㅂ", "ㄴ"), bieup())):
            event = self._session_event(labels, [0.99, 0.01], pose)
            self.assertAlmostEqual(event["confidence"], 0.99, places=5)
            self.assertNotIn("handshapeHint", event)

    def test_other_symbols_are_untouched_even_on_a_fist(self) -> None:
        event = self._session_event(("ㅁ", "ㄴ"), [0.99, 0.01], plain_fist())
        self.assertAlmostEqual(event["confidence"], 0.99, places=5)
        self.assertNotIn("handshapeHint", event)

    def test_the_gate_reads_raw_landmarks_not_the_smoothed_copy(self) -> None:
        """Smoothing lags, so a smoothed thumb would trail the real hand.

        With smoothing on and a single frame, the smoothed copy equals the input,
        so the observable check is that the verdict still fires — the gate is not
        reading some half-initialised smoothing buffer.
        """
        runner = MockModelRunner([np.array([0.99, 0.01], dtype=np.float32)], labels=("ㅎ", "ㄴ"))
        session = RecognitionSession(runner, smoothing_alpha=0.3)
        event = session.process_landmark_frame(1, 1000, plain_fist(), "RIGHT")[0]
        self.assertAlmostEqual(event["confidence"], SUPPRESSED_CONFIDENCE)


if __name__ == "__main__":
    unittest.main()
