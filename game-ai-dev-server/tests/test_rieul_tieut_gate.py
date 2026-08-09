from __future__ import annotations

import unittest

import numpy as np

from app.messages import Landmark
from app.rieul_tieut_gate import RieulTieutResolver, reassign_candidates, resolve


def hand(spread_degrees: float, finger_length: float = 0.10) -> tuple[Landmark, ...]:
    """A sideways hand: index/middle/ring extended leftward, fanned vertically.

    ``spread_degrees`` is the TOTAL fan (index–middle plus middle–ring), split
    evenly, so the measured spread equals the argument. ``finger_length`` in
    screen units controls the extension guard (palm scale is ~0.054 here, so
    0.10 is clearly extended and 0.03 is clearly folded).
    """
    half = np.radians(spread_degrees / 2.0)
    points = np.zeros((21, 3), dtype=np.float64)
    points[0] = (0.60, 0.50, 0.0)  # wrist
    knuckles = {5: 0.47, 9: 0.49, 13: 0.51, 17: 0.53}
    for base, y in knuckles.items():
        points[base] = (0.55, y, 0.0)
    for base, theta in ((5, half), (9, 0.0), (13, -half)):
        direction = np.array((-np.cos(theta), np.sin(theta), 0.0))
        for joint in range(1, 4):
            points[base + joint] = points[base] + direction * finger_length * joint / 3.0
    # Pinky folded, thumb resting anywhere valid.
    points[18] = (0.545, 0.535, 0.0)
    points[19] = (0.548, 0.532, 0.01)
    points[20] = (0.550, 0.530, 0.01)
    points[1] = (0.58, 0.46, 0.0)
    points[2] = (0.57, 0.45, 0.0)
    points[3] = (0.56, 0.44, 0.0)
    points[4] = (0.55, 0.43, 0.0)
    return tuple(Landmark(*p) for p in points)


class ResolveTests(unittest.TestCase):
    def test_together_pose_resolves_to_tieut(self) -> None:
        self.assertEqual(resolve("ㄹ", hand(10.0), "RIGHT"), "ㅌ")
        self.assertEqual(resolve("ㅌ", hand(10.0), "RIGHT"), "ㅌ")

    def test_spread_pose_resolves_to_rieul(self) -> None:
        self.assertEqual(resolve("ㅌ", hand(44.0), "RIGHT"), "ㄹ")
        self.assertEqual(resolve("ㄹ", hand(44.0), "RIGHT"), "ㄹ")

    def test_ambiguous_band_leaves_the_model_alone(self) -> None:
        self.assertIsNone(resolve("ㄹ", hand(29.0), "RIGHT"))
        self.assertIsNone(resolve("ㅌ", hand(29.0), "RIGHT"))

    def test_symbols_outside_the_pair_are_never_touched(self) -> None:
        self.assertIsNone(resolve("ㄷ", hand(10.0), "RIGHT"))

    def test_folded_fingers_disable_the_judgement(self) -> None:
        self.assertIsNone(resolve("ㄹ", hand(10.0, finger_length=0.03), "RIGHT"))

    def test_left_hand_matches_the_right(self) -> None:
        self.assertEqual(resolve("ㄹ", hand(10.0), "LEFT"), "ㅌ")

    def test_malformed_frame_is_left_alone(self) -> None:
        flat = tuple(Landmark(0.5, 0.5, 0.0) for _ in range(21))
        self.assertIsNone(resolve("ㄹ", flat, "RIGHT"))


class ReassignCandidatesTests(unittest.TestCase):
    def test_swaps_labels_but_never_confidences(self) -> None:
        candidates = [
            {"symbol": "ㄹ", "confidence": 0.7},
            {"symbol": "ㅌ", "confidence": 0.2},
            {"symbol": "ㄷ", "confidence": 0.1},
        ]
        reassign_candidates("ㄹ", "ㅌ", candidates)
        self.assertEqual(
            candidates,
            [
                {"symbol": "ㅌ", "confidence": 0.7},
                {"symbol": "ㄹ", "confidence": 0.2},
                {"symbol": "ㄷ", "confidence": 0.1},
            ],
        )

    def test_partner_absent_from_the_list(self) -> None:
        candidates = [
            {"symbol": "ㄹ", "confidence": 0.7},
            {"symbol": "ㄷ", "confidence": 0.3},
        ]
        reassign_candidates("ㄹ", "ㅌ", candidates)
        self.assertEqual(candidates[0], {"symbol": "ㅌ", "confidence": 0.7})
        self.assertEqual(candidates[1], {"symbol": "ㄷ", "confidence": 0.3})


class ResolverTests(unittest.TestCase):
    """EMA + hysteresis: the decision must not flicker near a band edge."""

    def test_decision_sticks_through_the_ambiguous_band(self) -> None:
        resolver = RieulTieutResolver()
        self.assertEqual(resolver.resolve("ㄹ", hand(10.0), "RIGHT"), "ㅌ")
        # Jittered frames inside the ambiguous band keep the ㅌ decision
        # instead of falling back to the model's ㄹ (the flicker bug).
        for spread in (28.0, 31.0, 27.0, 33.0):
            self.assertEqual(resolver.resolve("ㄹ", hand(spread), "RIGHT"), "ㅌ")

    def test_sustained_opposite_pose_flips_the_decision(self) -> None:
        resolver = RieulTieutResolver()
        self.assertEqual(resolver.resolve("ㄹ", hand(10.0), "RIGHT"), "ㅌ")
        decisions = [resolver.resolve("ㄹ", hand(44.0), "RIGHT") for _ in range(6)]
        self.assertEqual(decisions[-1], "ㄹ")  # EMA가 따라온 뒤에는 전환된다

    def test_single_outlier_frame_does_not_flip(self) -> None:
        resolver = RieulTieutResolver()
        for _ in range(4):
            resolver.resolve("ㄹ", hand(10.0), "RIGHT")
        # 한 프레임 지터(40°)로는 스무딩 값이 35°를 못 넘는다.
        self.assertEqual(resolver.resolve("ㄹ", hand(40.0), "RIGHT"), "ㅌ")

    def test_unmeasurable_frame_defers_without_dropping_state(self) -> None:
        resolver = RieulTieutResolver()
        self.assertEqual(resolver.resolve("ㄹ", hand(10.0), "RIGHT"), "ㅌ")
        folded = hand(10.0, finger_length=0.03)
        self.assertIsNone(resolver.resolve("ㄹ", folded, "RIGHT"))
        self.assertEqual(resolver.resolve("ㄹ", hand(10.0), "RIGHT"), "ㅌ")

    def test_reset_clears_the_decision(self) -> None:
        resolver = RieulTieutResolver()
        self.assertEqual(resolver.resolve("ㄹ", hand(10.0), "RIGHT"), "ㅌ")
        resolver.reset()
        self.assertIsNone(resolver.resolve("ㄹ", hand(29.0), "RIGHT"))

    def test_no_decision_before_first_unambiguous_frame(self) -> None:
        resolver = RieulTieutResolver()
        self.assertIsNone(resolver.resolve("ㄹ", hand(29.0), "RIGHT"))


class StubResolver:
    def __init__(self, result: str | None) -> None:
        self._result = result
        self.reset_count = 0

    def resolve(self, symbol, landmarks, handedness):
        return self._result

    def reset(self) -> None:
        self.reset_count += 1


class WiringTests(unittest.TestCase):
    """A reassigned frame must keep the frontend wire-format invariants."""

    def _event(self, resolve_result, labels, probabilities):
        from app.messages import parse_request
        from app.recognition_session import RecognitionSession
        from tests.helpers import MockModelRunner, landmark_frame

        runner = MockModelRunner([np.asarray(probabilities, dtype=np.float32)], labels=labels)
        session = RecognitionSession(runner, none_checker=None)
        session._rieul_tieut_resolver = StubResolver(resolve_result)
        request = parse_request(landmark_frame(1, 1000))
        return session.process_landmark_frame(1, 1000, request.landmarks)[0]

    def test_reassigned_frame_keeps_wire_invariants(self) -> None:
        event = self._event("ㅌ", ("ㄹ", "ㅌ", "ㄷ"), [0.7, 0.2, 0.1])
        self.assertEqual(event["symbol"], "ㅌ")
        self.assertAlmostEqual(event["confidence"], 0.7, places=5)
        candidates = event["topCandidates"]
        confidences = [item["confidence"] for item in candidates]
        self.assertEqual(confidences, sorted(confidences, reverse=True))
        self.assertEqual(candidates[0]["symbol"], event["symbol"])
        self.assertAlmostEqual(candidates[0]["confidence"], event["confidence"], places=5)
        self.assertEqual(len({item["symbol"] for item in candidates}), len(candidates))
        self.assertNotIn("handshapeHint", event)

    def test_none_leaves_the_frame_untouched(self) -> None:
        event = self._event(None, ("ㄹ", "ㅌ"), [0.7, 0.3])
        self.assertEqual(event["symbol"], "ㄹ")
        self.assertAlmostEqual(event["confidence"], 0.7, places=5)


if __name__ == "__main__":
    unittest.main()
