from __future__ import annotations

import unittest
from unittest import mock

import numpy as np

from app.messages import Landmark
from app.orientation_gate import (
    _DOWNWARD_CHAINS,
    KIEUK_THUMB_FOLDED,
    POINTING_UP,
    downward_ratio,
    verify,
)


def hand(
    finger: str = "middle",
    direction: float = 1.0,
    thumb: str = "out",
) -> tuple[Landmark, ...]:
    """A synthetic hand with one finger extended vertically.

    ``direction`` +1 extends the finger downward on screen (y grows), -1 upward,
    0 sideways. ``thumb`` "out" stands clear of the palm, "tucked" rests on the
    folded index fingertip. Every other finger is folded back to its knuckle.
    """
    points = np.zeros((21, 3), dtype=np.float64)
    points[0] = (0.50, 0.40, 0.0)  # wrist
    knuckles = {"index": 5, "middle": 9, "ring": 13, "pinky": 17}
    xs = {"index": 0.46, "middle": 0.49, "ring": 0.52, "pinky": 0.55}
    for name, base in knuckles.items():
        x = xs[name]
        points[base] = (x, 0.50, 0.0)
        if name == finger:
            step_y = 0.05 * direction
            step_x = 0.05 if direction == 0 else 0.0  # sideways when horizontal
            for joint in range(1, 4):
                points[base + joint] = (x + step_x * joint, 0.50 + step_y * joint, 0.0)
        else:
            # Folded: pip out a little, dip/tip curled back beside the knuckle.
            points[base + 1] = (x, 0.53, 0.0)
            points[base + 2] = (x, 0.52, 0.01)
            points[base + 3] = (x, 0.51, 0.01)
    if thumb == "out":
        points[1] = (0.44, 0.47, 0.0)
        points[2] = (0.42, 0.46, 0.0)
        points[3] = (0.40, 0.45, 0.0)
        points[4] = (0.38, 0.44, 0.0)
    else:  # tucked against the folded index fingertip
        points[1] = (0.44, 0.47, 0.0)
        points[2] = (0.45, 0.49, 0.0)
        points[3] = (0.455, 0.50, 0.0)
        points[4] = (0.462, 0.512, 0.01)
    return tuple(Landmark(*p) for p in points)


class DownwardRatioTests(unittest.TestCase):
    def test_down_is_positive_up_is_negative(self) -> None:
        self.assertGreater(downward_ratio(hand(direction=1.0), ((9, 12),)), 0.9)
        self.assertLess(downward_ratio(hand(direction=-1.0), ((9, 12),)), -0.9)

    def test_horizontal_is_near_zero(self) -> None:
        ratio = downward_ratio(hand(direction=0.0), ((9, 12),))
        self.assertAlmostEqual(ratio, 0.0, places=5)

    def test_degenerate_chain_returns_none(self) -> None:
        flat = tuple(Landmark(0.5, 0.5, 0.0) for _ in range(21))
        self.assertIsNone(downward_ratio(flat, ((9, 12),)))


class VerifyTests(unittest.TestCase):
    def test_ungated_symbol_is_accepted(self) -> None:
        self.assertTrue(verify("ㅏ", hand(direction=-1.0), "RIGHT").accepted)

    def test_kieuk_pointing_down_is_accepted(self) -> None:
        verdict = verify("ㅋ", hand(finger="middle", direction=1.0, thumb="out"), "RIGHT")
        self.assertTrue(verdict.accepted)

    def test_kieuk_pointing_up_is_rejected(self) -> None:
        verdict = verify("ㅋ", hand(finger="middle", direction=-1.0, thumb="out"), "RIGHT")
        self.assertTrue(verdict.rejected)
        self.assertEqual(verdict.reason, POINTING_UP)
        self.assertTrue(verdict.feedback)

    def test_kieuk_horizontal_is_not_rejected(self) -> None:
        """The veto must only fire on clearly-upward poses, never sloppy ones."""
        verdict = verify("ㅋ", hand(finger="middle", direction=0.0, thumb="out"), "RIGHT")
        self.assertTrue(verdict.accepted)

    def test_kieuk_tucked_thumb_is_rejected(self) -> None:
        verdict = verify("ㅋ", hand(finger="middle", direction=1.0, thumb="tucked"), "RIGHT")
        self.assertTrue(verdict.rejected)
        self.assertEqual(verdict.reason, KIEUK_THUMB_FOLDED)

    def test_giyeok_pointing_up_is_rejected(self) -> None:
        verdict = verify("ㄱ", hand(finger="index", direction=-1.0), "RIGHT")
        self.assertTrue(verdict.rejected)
        self.assertEqual(verdict.reason, POINTING_UP)

    def test_giyeok_pointing_down_is_accepted(self) -> None:
        self.assertTrue(verify("ㄱ", hand(finger="index", direction=1.0), "RIGHT").accepted)

    def test_left_hand_vertical_test_is_unchanged(self) -> None:
        """Mirroring only flips x; the up/down verdict must match the right hand."""
        verdict = verify("ㅜ", hand(finger="index", direction=-1.0), "LEFT")
        self.assertTrue(verdict.rejected)

    def test_malformed_frame_is_accepted(self) -> None:
        flat = tuple(Landmark(0.5, 0.5, 0.0) for _ in range(21))
        self.assertTrue(verify("ㅋ", flat, "RIGHT").accepted)

    def test_gated_symbols_exist_in_the_deployed_label_set(self) -> None:
        from app.model_adapter import LABELS

        for symbol in _DOWNWARD_CHAINS:
            self.assertIn(symbol, LABELS)


class WiringTests(unittest.TestCase):
    """The gate must suppress without breaking the frontend wire invariants."""

    def _event(self, labels, probabilities):
        from app.messages import parse_request
        from app.recognition_session import RecognitionSession
        from tests.helpers import MockModelRunner, landmark_frame

        runner = MockModelRunner([np.asarray(probabilities, dtype=np.float32)], labels=labels)
        session = RecognitionSession(runner, none_checker=None)
        request = parse_request(landmark_frame(1, 1000))
        return session.process_landmark_frame(1, 1000, request.landmarks)[0]

    def test_rejected_frame_is_suppressed_with_feedback(self) -> None:
        from app.model_adapter import SUPPRESSED_CONFIDENCE
        from app.orientation_gate import OrientationVerdict

        with mock.patch(
            "app.recognition_session.orientation_gate.verify",
            return_value=OrientationVerdict("ㅋ", False, POINTING_UP),
        ):
            event = self._event(("ㅋ", "ㄴ", "ㄷ"), [0.6, 0.3, 0.1])

        self.assertEqual(event["symbol"], "ㅋ")
        self.assertAlmostEqual(event["confidence"], SUPPRESSED_CONFIDENCE)
        self.assertIn("handshapeHint", event)
        candidates = event["topCandidates"]
        confidences = [item["confidence"] for item in candidates]
        self.assertEqual(confidences, sorted(confidences, reverse=True))
        self.assertEqual(candidates[0]["symbol"], event["symbol"])
        self.assertEqual(candidates[0]["confidence"], event["confidence"])

    def test_accepted_frame_is_untouched(self) -> None:
        from app.orientation_gate import OrientationVerdict

        with mock.patch(
            "app.recognition_session.orientation_gate.verify",
            return_value=OrientationVerdict("ㅋ", True),
        ):
            event = self._event(("ㅋ", "ㄴ"), [0.99, 0.01])

        self.assertAlmostEqual(event["confidence"], 0.99, places=5)
        self.assertNotIn("handshapeHint", event)


if __name__ == "__main__":
    unittest.main()
