from __future__ import annotations

import unittest

import numpy as np

from app.messages import Landmark
from app.rieul_tieut_gate import (
    DECIDED_CONFIDENCE,
    RieulTieutResolver,
    classify,
    reassign_candidates,
    resolve,
    restore_confidence,
)


def hand(
    mr_degrees: float,
    finger_length: float = 0.10,
    index_degrees: float = 20.0,
) -> tuple[Landmark, ...]:
    """A sideways hand: index/middle/ring extended leftward.

    ``mr_degrees`` sets the middle–ring angle and ``index_degrees`` the
    index–middle angle. ``finger_length`` in screen units controls the
    extension guard (palm scale is ~0.054 here, so 0.10 is clearly extended
    and 0.03 is clearly folded).
    """
    points = np.zeros((21, 3), dtype=np.float64)
    points[0] = (0.60, 0.50, 0.0)  # wrist
    knuckles = {5: 0.47, 9: 0.49, 13: 0.51, 17: 0.53}
    for base, y in knuckles.items():
        points[base] = (0.55, y, 0.0)
    fans = (
        (5, np.radians(index_degrees)),
        (9, 0.0),
        (13, -np.radians(mr_degrees)),
    )
    for base, theta in fans:
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


def tieut_pose(mr: float = 7.0, im: float = 40.0) -> tuple[Landmark, ...]:
    """검지 벌리고 중지·약지 붙인 올바른 ㅌ."""
    return hand(mr, index_degrees=im)


def rieul_pose(mr: float = 16.0, im: float = 20.0) -> tuple[Landmark, ...]:
    """세 손가락을 고르게 벌린 올바른 ㄹ."""
    return hand(mr, index_degrees=im)


class ClassifyTests(unittest.TestCase):
    def test_calibrated_reference_poses(self) -> None:
        # 사용자 참조 영상 중앙값 근처.
        self.assertEqual(classify(44.0, 7.6), "ㅌ")
        self.assertEqual(classify(20.0, 16.1), "ㄹ")

    def test_middle_ring_apart_is_never_tieut(self) -> None:
        """검지가 아무리 벌어져도 중지-약지가 떨어져 있으면 ㅌ이 아니다."""
        self.assertEqual(classify(45.0, 13.5), "ㄹ")

    def test_mildly_ajar_index_still_counts_as_tieut(self) -> None:
        """실전에서는 검지를 조금만 벌린다 — mr만 붙어 있으면 ㅌ."""
        self.assertEqual(classify(14.0, 8.0), "ㅌ")

    def test_evenly_together_fingers_are_ambiguous(self) -> None:
        """검지까지 다 붙인 손은 ㅌ 확정이 아니다 (리졸버 기본값 ㄹ)."""
        self.assertIsNone(classify(8.0, 5.0))

    def test_narrow_ambiguous_zone_returns_none(self) -> None:
        # mr가 10~12.5 사이: 어느 쪽도 확정하지 않는다.
        self.assertIsNone(classify(40.0, 11.5))


class ResolveTests(unittest.TestCase):
    def test_tieut_pose_resolves_to_tieut(self) -> None:
        self.assertEqual(resolve("ㄹ", tieut_pose(), "RIGHT"), "ㅌ")
        self.assertEqual(resolve("ㅌ", tieut_pose(), "RIGHT"), "ㅌ")

    def test_rieul_pose_resolves_to_rieul(self) -> None:
        self.assertEqual(resolve("ㅌ", rieul_pose(), "RIGHT"), "ㄹ")
        self.assertEqual(resolve("ㄹ", rieul_pose(), "RIGHT"), "ㄹ")

    def test_slightly_apart_middle_ring_is_not_tieut(self) -> None:
        self.assertIsNone(resolve("ㅌ", hand(11.5, index_degrees=40.0), "RIGHT"))
        self.assertEqual(resolve("ㅌ", hand(13.5, index_degrees=40.0), "RIGHT"), "ㄹ")
        self.assertEqual(resolve("ㄹ", hand(8.0, index_degrees=14.0), "RIGHT"), "ㅌ")

    def test_symbols_outside_the_pair_are_never_touched(self) -> None:
        self.assertIsNone(resolve("ㄷ", tieut_pose(), "RIGHT"))

    def test_folded_fingers_disable_the_judgement(self) -> None:
        self.assertIsNone(resolve("ㄹ", hand(7.0, finger_length=0.03, index_degrees=40.0), "RIGHT"))

    def test_left_hand_matches_the_right(self) -> None:
        self.assertEqual(resolve("ㄹ", tieut_pose(), "LEFT"), "ㅌ")

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
    """EMA + sticky decision: no flicker, strict about ㅌ."""

    def test_tieut_then_jitter_keeps_tieut(self) -> None:
        resolver = RieulTieutResolver()
        self.assertEqual(resolver.resolve("ㄹ", tieut_pose(), "RIGHT"), "ㅌ")
        for mr in (9.5, 10.2, 9.8, 10.4):
            self.assertEqual(resolver.resolve("ㄹ", hand(mr, index_degrees=40.0), "RIGHT"), "ㅌ")

    def test_sustained_separation_flips_to_rieul(self) -> None:
        """중지-약지가 떨어진 채 유지되면 ㅌ 결정을 붙들지 않는다."""
        resolver = RieulTieutResolver()
        self.assertEqual(resolver.resolve("ㅌ", tieut_pose(), "RIGHT"), "ㅌ")
        decisions = [resolver.resolve("ㅌ", rieul_pose(), "RIGHT") for _ in range(8)]
        self.assertEqual(decisions[-1], "ㄹ")

    def test_sustained_tieut_pose_flips_to_tieut(self) -> None:
        resolver = RieulTieutResolver()
        self.assertEqual(resolver.resolve("ㄹ", rieul_pose(), "RIGHT"), "ㄹ")
        decisions = [resolver.resolve("ㄹ", tieut_pose(), "RIGHT") for _ in range(10)]
        self.assertEqual(decisions[-1], "ㅌ")

    def test_single_outlier_frame_does_not_flip(self) -> None:
        resolver = RieulTieutResolver()
        for _ in range(4):
            resolver.resolve("ㄹ", tieut_pose(), "RIGHT")
        # 한 프레임 지터(mr 16°)로는 스무딩 값이 밴드를 못 넘는다.
        self.assertEqual(resolver.resolve("ㄹ", rieul_pose(), "RIGHT"), "ㅌ")

    def test_unmeasurable_frame_defers_without_dropping_state(self) -> None:
        resolver = RieulTieutResolver()
        self.assertEqual(resolver.resolve("ㄹ", tieut_pose(), "RIGHT"), "ㅌ")
        folded = hand(7.0, finger_length=0.03, index_degrees=40.0)
        self.assertIsNone(resolver.resolve("ㄹ", folded, "RIGHT"))
        self.assertEqual(resolver.resolve("ㄹ", tieut_pose(), "RIGHT"), "ㅌ")

    def test_reset_clears_the_decision(self) -> None:
        resolver = RieulTieutResolver()
        self.assertEqual(resolver.resolve("ㄹ", tieut_pose(), "RIGHT"), "ㅌ")
        resolver.reset()
        # 리셋 후 애매한 자세로 새로 시작하면 이전 ㅌ가 아니라 엄격 기본값 ㄹ.
        self.assertEqual(resolver.resolve("ㄹ", hand(11.5, index_degrees=40.0), "RIGHT"), "ㄹ")

    def test_first_ambiguous_frame_is_strict_about_tieut(self) -> None:
        self.assertEqual(RieulTieutResolver().resolve("ㅌ", hand(11.5, index_degrees=40.0), "RIGHT"), "ㄹ")


class RestoreConfidenceTests(unittest.TestCase):
    def test_suppressed_frame_is_raised_with_order_kept(self) -> None:
        confidence, candidates = restore_confidence(
            0.05,
            [
                {"symbol": "ㅌ", "confidence": 0.05},
                {"symbol": "ㄹ", "confidence": 0.04},
            ],
        )
        self.assertAlmostEqual(confidence, DECIDED_CONFIDENCE)
        self.assertAlmostEqual(candidates[0]["confidence"], DECIDED_CONFIDENCE)
        self.assertLess(candidates[1]["confidence"], candidates[0]["confidence"])

    def test_confident_frame_is_untouched(self) -> None:
        original = [{"symbol": "ㅌ", "confidence": 0.9}]
        confidence, candidates = restore_confidence(0.9, original)
        self.assertEqual(confidence, 0.9)
        self.assertIs(candidates, original)


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

    def test_margin_suppressed_frame_becomes_confirmable_when_decided(self) -> None:
        """러너의 margin 게이트가 0.05로 억눌러도 기하가 결정했으면 복원한다."""
        event = self._event("ㅌ", ("ㄹ", "ㅌ", "ㄷ"), [0.05, 0.04, 0.01])
        self.assertEqual(event["symbol"], "ㅌ")
        self.assertAlmostEqual(event["confidence"], DECIDED_CONFIDENCE, places=5)
        candidates = event["topCandidates"]
        self.assertEqual(candidates[0]["symbol"], "ㅌ")
        self.assertAlmostEqual(candidates[0]["confidence"], event["confidence"], places=5)
        confidences = [item["confidence"] for item in candidates]
        self.assertEqual(confidences, sorted(confidences, reverse=True))

    def test_reassigned_frame_keeps_wire_invariants(self) -> None:
        event = self._event("ㅌ", ("ㄹ", "ㅌ", "ㄷ"), [0.7, 0.2, 0.1])
        self.assertEqual(event["symbol"], "ㅌ")
        self.assertAlmostEqual(event["confidence"], DECIDED_CONFIDENCE, places=5)
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
