from __future__ import annotations

import unittest

import numpy as np

from app.feature_adapter import landmarks_to_feature
from app.messages import Landmark


def landmarks() -> tuple[Landmark, ...]:
    return tuple(Landmark(0.1 + index * 0.01, 0.2 + index * 0.005, 0.0) for index in range(21))


def open_hand_landmarks() -> tuple[Landmark, ...]:
    """A non-degenerate right hand: fingers spread, palm facing the camera.

    feature_v3 derives a palm normal from a cross product and joint angles from
    arccos, so a synthetic pose with all 21 points on one line (as `landmarks()`
    is) would give a zero-length normal and pin every angle at arccos(±1). This
    pose keeps the palm plane and the joints genuinely bent, so the mirroring
    invariant is checked on values that actually carry signal.
    """
    return tuple(
        Landmark(x, y, z)
        for x, y, z in (
            (0.50, 0.80, 0.000),  # wrist
            (0.43, 0.76, -0.010), (0.38, 0.70, -0.018), (0.34, 0.65, -0.025), (0.31, 0.60, -0.030),  # thumb
            (0.45, 0.58, -0.005), (0.44, 0.49, -0.012), (0.43, 0.43, -0.020), (0.43, 0.38, -0.026),  # index
            (0.51, 0.56, 0.000), (0.51, 0.46, -0.006), (0.51, 0.39, -0.014), (0.51, 0.34, -0.021),  # middle
            (0.57, 0.57, 0.006), (0.58, 0.48, 0.002), (0.59, 0.42, -0.004), (0.59, 0.37, -0.010),  # ring
            (0.62, 0.60, 0.013), (0.64, 0.53, 0.010), (0.66, 0.48, 0.006), (0.67, 0.44, 0.002),  # pinky
        )
    )


class FeatureAdapterTests(unittest.TestCase):
    def test_left_hand_is_mirrored_to_the_training_coordinate_system(self) -> None:
        right = open_hand_landmarks()
        mirrored_left = tuple(Landmark(1.0 - point.x, point.y, point.z) for point in right)

        right_feature = landmarks_to_feature(right, "RIGHT")
        left_feature = landmarks_to_feature(mirrored_left, "LEFT")

        # 60 bone directions + 3 palm normal are pure geometry and must round-trip
        # the mirror exactly; the 15 angles in between are degrees from arccos,
        # which amplifies the float32 error in 1.0 - (1.0 - x) near ±1.
        np.testing.assert_allclose(left_feature[:60], right_feature[:60], rtol=0.0, atol=1e-6)
        np.testing.assert_allclose(left_feature[75:], right_feature[75:], rtol=0.0, atol=1e-6)
        np.testing.assert_allclose(left_feature[60:75], right_feature[60:75], rtol=0.0, atol=1e-3)

    def test_palm_normal_is_not_degenerate_for_a_real_pose(self) -> None:
        feature = landmarks_to_feature(open_hand_landmarks(), "RIGHT")

        self.assertAlmostEqual(float(np.linalg.norm(feature[75:])), 1.0, places=5)

    def test_rejects_unknown_handedness(self) -> None:
        with self.assertRaisesRegex(ValueError, "handedness"):
            landmarks_to_feature(landmarks(), "UNKNOWN")
