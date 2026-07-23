from __future__ import annotations

import unittest

import numpy as np

from app.feature_adapter import landmarks_to_feature
from app.messages import Landmark


def landmarks() -> tuple[Landmark, ...]:
    return tuple(Landmark(0.1 + index * 0.01, 0.2 + index * 0.005, 0.0) for index in range(21))


class FeatureAdapterTests(unittest.TestCase):
    def test_left_hand_is_mirrored_to_the_training_coordinate_system(self) -> None:
        right = landmarks()
        mirrored_left = tuple(Landmark(1.0 - point.x, point.y, point.z) for point in right)

        right_feature = landmarks_to_feature(right, "RIGHT")
        left_feature = landmarks_to_feature(mirrored_left, "LEFT")

        np.testing.assert_allclose(left_feature, right_feature, rtol=0.0, atol=1e-6)

    def test_rejects_unknown_handedness(self) -> None:
        with self.assertRaisesRegex(ValueError, "handedness"):
            landmarks_to_feature(landmarks(), "UNKNOWN")
