from __future__ import annotations

import contextlib
import unittest

import numpy as np

from app import handshape_gate
from app.handshape_gate import THUMB_NOT_EXTENDED, THUMB_NOT_FOLDED, measure, verify
from app.messages import Landmark


# Synthetic canonical poses.
#
# There is no captured landmark dataset in the repository, so these poses are
# built from hand proportions in a right-hand-facing frame: the wrist sits at the
# origin, the knuckles are one palm-unit away along -y, +x is the thumb side, and
# +z points out of the palm (the direction the fingers curl towards). They are not
# a substitute for calibration data — what they pin down is the *decision*: the
# four shapes that motivated the gate must land on the intended side of it, and
# the two correct shapes must survive.

_WRIST = (0.00, 0.00, 0.00)
_KNUCKLES = {
    5: (0.30, -1.00, 0.00),
    9: (0.10, -1.05, 0.00),
    13: (-0.10, -1.00, 0.00),
    17: (-0.30, -0.90, 0.00),
}
_THUMB_CMC = (0.22, -0.22, 0.00)
_THUMB_MCP = (0.48, -0.52, 0.00)


def _extended_finger(mcp: tuple[float, float, float]) -> list[tuple[float, float, float]]:
    x, y, z = mcp
    return [(x, y - 0.35, z), (x, y - 0.57, z), (x, y - 0.75, z)]


def _folded_finger(mcp: tuple[float, float, float]) -> list[tuple[float, float, float]]:
    """Curl the finger back over the palm, so dip→tip nearly reverses mcp→pip."""
    x, y, z = mcp
    pip = (x, y - 0.35, z)
    dip = (x, pip[1] + 0.13, pip[2] + 0.16)
    tip = (x, dip[1] + 0.22, dip[2] + 0.10)
    return [pip, dip, tip]


def _pose(
    *,
    fingers_folded: bool,
    thumb_ip: tuple[float, float, float],
    thumb_tip: tuple[float, float, float],
) -> tuple[Landmark, ...]:
    points: list[tuple[float, float, float]] = [_WRIST, _THUMB_CMC, _THUMB_MCP, thumb_ip, thumb_tip]
    shape = _folded_finger if fingers_folded else _extended_finger
    for mcp_index in (5, 9, 13, 17):
        mcp = _KNUCKLES[mcp_index]
        points.append(mcp)
        points.extend(shape(mcp))
    assert len(points) == 21
    return tuple(Landmark(*point) for point in points)


def hieut() -> tuple[Landmark, ...]:
    """ㅎ — fist with the thumb standing straight up, clear of the fingers."""
    return _pose(fingers_folded=True, thumb_ip=(0.58, -0.85, -0.08), thumb_tip=(0.66, -1.15, -0.14))


def plain_fist() -> tuple[Landmark, ...]:
    """The reported false ㅎ: a fist whose thumb is bent across the fingers."""
    return _pose(fingers_folded=True, thumb_ip=(0.40, -0.80, 0.15), thumb_tip=(0.12, -0.95, 0.28))


def fist_with_straight_thumb() -> tuple[Landmark, ...]:
    """A fist whose thumb is straight but pinned against the folded fingers.

    Straightness alone accepts this, so it is what the clearance term is for.
    """
    return _pose(fingers_folded=True, thumb_ip=(0.44, -0.85, 0.10), thumb_tip=(0.40, -1.18, 0.20))


def bieup() -> tuple[Landmark, ...]:
    """ㅂ — four fingers extended, thumb folded in over the palm."""
    return _pose(fingers_folded=False, thumb_ip=(0.43, -0.80, 0.10), thumb_tip=(0.21, -0.82, 0.20))


def open_hand() -> tuple[Landmark, ...]:
    """The reported false ㅂ: every finger extended and the thumb splayed out."""
    return _pose(fingers_folded=False, thumb_ip=(0.68, -0.74, 0.00), thumb_tip=(0.84, -0.93, 0.00))


def bieup_with_straight_thumb() -> tuple[Landmark, ...]:
    """ㅂ signed with a straight thumb held alongside the index finger.

    Adducted, not splayed — the abduction term exists so this is not vetoed.
    """
    return _pose(fingers_folded=False, thumb_ip=(0.42, -0.90, 0.00), thumb_tip=(0.38, -1.28, 0.00))


@contextlib.contextmanager
def gate_enabled():
    """The gate ships disabled (T-158); these tests describe it switched on."""
    original = handshape_gate.GATE_ENABLED
    handshape_gate.GATE_ENABLED = True
    try:
        yield
    finally:
        handshape_gate.GATE_ENABLED = original


# Measured landmarks, not synthetic. MediaPipe re-run over a screen capture of the
# deployed app while a *correct* ㅂ was held (thumb folded in over the palm). Kept
# as a fixture because the synthetic poses above turned out not to resemble real
# frames: the ones below are why the gate is disabled by default.
#
#   straightness 0.98, abduction 10 deg  — the gate lets this through
#   straightness 1.00, abduction 36 deg  — the gate vetoes it, wrongly
REAL_CORRECT_BIEUP_ABDUCTION_DEGREES = (16.0, 10.0, 10.0, 11.0, 36.0)
REAL_CORRECT_BIEUP_STRAIGHTNESS = (0.93, 0.98, 0.98, 0.99, 1.00)


class HandshapeMetricTests(unittest.TestCase):
    def test_folded_and_extended_fingers_land_outside_the_dead_band(self) -> None:
        self.assertTrue(measure(plain_fist(), "RIGHT").four_fingers_folded)
        self.assertFalse(measure(plain_fist(), "RIGHT").four_fingers_extended)
        self.assertTrue(measure(open_hand(), "RIGHT").four_fingers_extended)
        self.assertFalse(measure(open_hand(), "RIGHT").four_fingers_folded)

    def test_a_straight_thumb_scores_near_one_and_a_bent_one_much_lower(self) -> None:
        straight = measure(hieut(), "RIGHT").thumb_straightness
        bent = measure(bieup(), "RIGHT").thumb_straightness
        self.assertGreater(straight, 0.95)
        self.assertLess(bent, 0.80)
        # The margin is what makes a single threshold defensible.
        self.assertGreater(straight - bent, 0.15)

    def test_clearance_separates_a_free_thumb_from_one_against_the_fingers(self) -> None:
        self.assertGreater(measure(hieut(), "RIGHT").thumb_clearance, handshape_gate.HIEUT_MIN_THUMB_CLEARANCE)
        self.assertLess(
            measure(fist_with_straight_thumb(), "RIGHT").thumb_clearance,
            handshape_gate.HIEUT_MIN_THUMB_CLEARANCE,
        )

    def test_metrics_are_invariant_to_scale_and_translation(self) -> None:
        pose = hieut()
        moved = tuple(Landmark(point.x * 3.0 + 5.0, point.y * 3.0 - 2.0, point.z * 3.0) for point in pose)
        original, transformed = measure(pose, "RIGHT"), measure(moved, "RIGHT")
        self.assertAlmostEqual(transformed.thumb_straightness, original.thumb_straightness, places=9)
        self.assertAlmostEqual(transformed.thumb_clearance, original.thumb_clearance, places=9)
        for actual, expected in zip(transformed.finger_curl_degrees, original.finger_curl_degrees):
            self.assertAlmostEqual(actual, expected, places=6)

    def test_a_mirrored_left_hand_measures_the_same_as_the_right(self) -> None:
        right = hieut()
        left = tuple(Landmark(1.0 - point.x, point.y, point.z) for point in right)
        self.assertAlmostEqual(
            measure(left, "LEFT").thumb_straightness,
            measure(right, "RIGHT").thumb_straightness,
            places=9,
        )

    def test_wrong_landmark_count_and_handedness_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            measure(hieut()[:20], "RIGHT")
        with self.assertRaises(ValueError):
            measure(hieut(), "EITHER")


class HandshapeVerifyTests(unittest.TestCase):
    """The veto behaviour, described with the gate switched on.

    It ships off (T-158), so these tests force it on rather than silently passing
    because every frame is accepted.
    """

    def setUp(self) -> None:
        self._original = handshape_gate.GATE_ENABLED
        handshape_gate.GATE_ENABLED = True

    def tearDown(self) -> None:
        handshape_gate.GATE_ENABLED = self._original

    def test_the_reported_false_positives_are_vetoed(self) -> None:
        fist = verify("ㅎ", plain_fist(), "RIGHT")
        self.assertTrue(fist.rejected)
        self.assertEqual(fist.reason, THUMB_NOT_EXTENDED)
        self.assertIsNotNone(fist.feedback)

        flat = verify("ㅂ", open_hand(), "RIGHT")
        self.assertTrue(flat.rejected)
        self.assertEqual(flat.reason, THUMB_NOT_FOLDED)
        self.assertIsNotNone(flat.feedback)

    def test_a_straight_but_tucked_thumb_is_still_not_hieut(self) -> None:
        verdict = verify("ㅎ", fist_with_straight_thumb(), "RIGHT")
        self.assertTrue(verdict.rejected)
        self.assertEqual(verdict.reason, THUMB_NOT_EXTENDED)

    def test_the_correct_shapes_pass(self) -> None:
        self.assertTrue(verify("ㅎ", hieut(), "RIGHT").accepted)
        self.assertTrue(verify("ㅂ", bieup(), "RIGHT").accepted)
        self.assertTrue(verify("ㅂ", bieup_with_straight_thumb(), "RIGHT").accepted)

    def test_a_left_hand_is_judged_the_same_as_a_right_hand(self) -> None:
        mirrored = tuple(Landmark(1.0 - point.x, point.y, point.z) for point in plain_fist())
        self.assertTrue(verify("ㅎ", mirrored, "LEFT").rejected)
        self.assertTrue(verify("ㅎ", tuple(Landmark(1.0 - p.x, p.y, p.z) for p in hieut()), "LEFT").accepted)

    def test_other_symbols_are_never_touched(self) -> None:
        for symbol in ("ㄱ", "ㅁ", "ㅅ", "ㅏ", "ㅣ"):
            self.assertTrue(verify(symbol, plain_fist(), "RIGHT").accepted)
            self.assertTrue(verify(symbol, open_hand(), "RIGHT").accepted)

    def test_the_veto_needs_the_four_finger_precondition(self) -> None:
        """A fist thumb on a flat hand, or the reverse, is left alone.

        The gate only claims the thumb is wrong when the rest of the hand already
        matches the lazy shape it is guarding against.
        """
        self.assertTrue(verify("ㅎ", plain_fist()[:5] + open_hand()[5:], "RIGHT").accepted)
        self.assertTrue(verify("ㅂ", open_hand()[:5] + plain_fist()[5:], "RIGHT").accepted)

    def test_a_malformed_frame_is_accepted_rather_than_raising(self) -> None:
        collapsed = tuple(Landmark(0.5, 0.5, 0.0) for _ in range(21))
        self.assertTrue(verify("ㅎ", collapsed, "RIGHT").accepted)
        self.assertTrue(verify("ㅎ", hieut()[:10], "RIGHT").accepted)

    def test_the_gate_can_be_switched_off(self) -> None:
        handshape_gate.GATE_ENABLED = False
        self.assertTrue(verify("ㅎ", plain_fist(), "RIGHT").accepted)


class GateDefaultsOffTests(unittest.TestCase):
    """T-158. The gate must not be reachable without an explicit opt-in.

    Measured frames of a *correct* ㅂ score straightness 0.93-1.00 and abduction
    9-36 degrees, so the ㅂ veto (straightness > 0.93 AND abduction > 35) fires on a
    correct handshape. Until the discriminator is rebuilt against captures of the
    lazy poses too, shipping this on trades a false accept for a false reject.
    """

    def test_the_gate_is_off_by_default(self) -> None:
        self.assertFalse(handshape_gate.GATE_ENABLED)
        # With the module default in force, nothing is ever vetoed.
        self.assertTrue(verify("ㅎ", plain_fist(), "RIGHT").accepted)
        self.assertTrue(verify("ㅂ", open_hand(), "RIGHT").accepted)

    def test_the_bieup_veto_would_reject_a_measured_correct_bieup(self) -> None:
        """Pins the reason the gate is disabled, using the real numbers.

        If a future change makes the ㅂ rule survive these values, this test should
        be updated deliberately rather than deleted.
        """
        worst = max(
            zip(REAL_CORRECT_BIEUP_STRAIGHTNESS, REAL_CORRECT_BIEUP_ABDUCTION_DEGREES),
            key=lambda pair: pair[1],
        )
        straightness, abduction = worst
        self.assertGreater(straightness, handshape_gate.BIEUP_MAX_THUMB_STRAIGHTNESS)
        self.assertGreater(abduction, handshape_gate.BIEUP_MIN_THUMB_ABDUCTION_DEGREES)


class FingerThresholdTests(unittest.TestCase):
    def test_finger_thresholds_leave_a_dead_band(self) -> None:
        """Nothing between the two angles counts as either folded or extended."""
        self.assertLess(
            handshape_gate.FINGER_EXTENDED_MAX_DEGREES,
            handshape_gate.FINGER_FOLDED_MIN_DEGREES,
        )
        midpoint = float(
            np.mean([handshape_gate.FINGER_EXTENDED_MAX_DEGREES, handshape_gate.FINGER_FOLDED_MIN_DEGREES]),
        )
        metrics = handshape_gate.HandshapeMetrics(
            thumb_straightness=0.5,
            thumb_clearance=0.1,
            thumb_abduction_degrees=60.0,
            finger_curl_degrees=(midpoint, midpoint, midpoint, midpoint),
        )
        self.assertFalse(metrics.four_fingers_folded)
        self.assertFalse(metrics.four_fingers_extended)


if __name__ == "__main__":
    unittest.main()
