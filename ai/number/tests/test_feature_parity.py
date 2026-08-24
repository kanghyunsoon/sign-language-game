from __future__ import annotations

import hashlib
from pathlib import Path
import sys
import unittest

import numpy as np

from numbermodel.features import (
    FEATURE_SIZE,
    LANDMARK_COUNT,
    SOURCE_FILE,
    SOURCE_SHA256,
    Landmark,
    landmarks_to_feature,
)


def load_shared_implementation():
    """Import the recognition server's feature_v3, or None when it is absent."""
    if not SOURCE_FILE.is_file():
        return None
    server_root = SOURCE_FILE.parents[1]
    if str(server_root) not in sys.path:
        sys.path.insert(0, str(server_root))
    from app.feature_v3 import landmarks_to_feature as shared

    return shared


def random_hands(count: int, seed: int) -> list[tuple[Landmark, ...]]:
    generator = np.random.default_rng(seed)
    hands = []
    for _ in range(count):
        points = generator.normal(loc=0.5, scale=0.18, size=(LANDMARK_COUNT, 3))
        hands.append(tuple(Landmark(x=float(x), y=float(y), z=float(z)) for x, y, z in points))
    return hands


class FeatureParityTests(unittest.TestCase):
    """This folder owns a copy of feature_v3 so a trained bundle stays valid.

    The copy must not drift silently. If the shared implementation changes, one
    of these tests fails and the change becomes a decision: port it here and
    update SOURCE_SHA256, or record why the number model stays on this version.
    """

    def test_source_file_is_unchanged(self) -> None:
        if not SOURCE_FILE.is_file():
            self.skipTest(f"shared implementation not present at {SOURCE_FILE}")
        source_bytes = SOURCE_FILE.read_bytes().replace(b"\r\n", b"\n")
        digest = hashlib.sha256(source_bytes).hexdigest()
        self.assertEqual(
            digest,
            SOURCE_SHA256,
            "ai/game-server/app/feature_v3.py changed since this copy was taken. "
            "Compare the two, port the change if it applies to numbers, and update "
            "SOURCE_SHA256 in numbermodel/features.py.",
        )

    def test_copy_computes_the_same_values(self) -> None:
        shared = load_shared_implementation()
        if shared is None:
            self.skipTest(f"shared implementation not present at {SOURCE_FILE}")
        for index, hand in enumerate(random_hands(40, seed=11)):
            for handedness in ("LEFT", "RIGHT"):
                with self.subTest(hand=index, handedness=handedness):
                    np.testing.assert_array_equal(
                        landmarks_to_feature(hand, handedness),
                        shared(hand, handedness),
                    )

    def test_contract_shape_is_stable(self) -> None:
        feature = landmarks_to_feature(random_hands(1, seed=3)[0], "RIGHT")
        self.assertEqual(feature.shape, (FEATURE_SIZE,))
        self.assertEqual(FEATURE_SIZE, 78)
        self.assertEqual(feature.dtype, np.float32)


if __name__ == "__main__":
    unittest.main()
