from __future__ import annotations

import unittest
from unittest.mock import ANY

import numpy as np

from app.feature_adapter import FEATURE_SIZE
from app.messages import Landmark, capabilities_message, parse_request
from app.model_adapter import LABELS, MODEL_VERSION, ModelContract, load_recognition_readiness
from app.recognition_session import RecognitionConfig, RecognitionSession
from tests.helpers import MockModelRunner, landmark_frame


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
        self.assertEqual(len(message["competitiveSymbols"]), 24)
        self.assertEqual(set(message["competitiveSymbols"]), {
            item["symbol"] for item in readiness["classes"] if item["competitiveEligible"]
        })
        self.assertEqual(len(message["confidenceThresholds"]), 31)
        self.assertEqual(message["confidenceThresholds"], {
            item["symbol"]: item["threshold"] for item in readiness["classes"]
        })

    def test_rejects_labels_and_output_size_mismatch(self) -> None:
        with self.assertRaises(ValueError):
            ModelContract(labels=("ㄱ", "ㄴ"), sequence_length=10, feature_size=55, output_size=3)


if __name__ == "__main__":
    unittest.main()
