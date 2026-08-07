from __future__ import annotations

import unittest

import numpy as np

from app.messages import Landmark
from app.none_checker import _ID_TO_SYMBOL, _features


def pose(scale: float = 1.0, dx: float = 0.0, mirror: bool = False) -> tuple[Landmark, ...]:
    rng = np.random.default_rng(3)
    points = rng.uniform(0.2, 0.8, size=(21, 3)).astype(np.float32)
    points = points * scale + dx
    if mirror:
        points[:, 0] = 1.0 - points[:, 0]
    return tuple(Landmark(*p) for p in points)


class NoneCheckerFeatureTests(unittest.TestCase):
    """The server must feed the checker exactly what it was trained on.

    Training ran screen landmarks through fingerspellingAi's
    normalizeWorldLandmarks: wrist origin, mirror to right-handed, palm-scale.
    These tests pin the same invariances on the server-side reimplementation.
    """

    def test_scale_and_translation_invariant(self) -> None:
        a = _features(pose(), "RIGHT")
        b = _features(pose(scale=3.0, dx=0.25), "RIGHT")
        np.testing.assert_allclose(a, b, atol=1e-5)

    def test_left_hand_is_mirrored_onto_the_right(self) -> None:
        right = _features(pose(), "RIGHT")
        left = _features(pose(mirror=True), "LEFT")
        np.testing.assert_allclose(right, left, atol=1e-5)

    def test_shape_and_origin(self) -> None:
        f = _features(pose(), "RIGHT").reshape(21, 3)
        np.testing.assert_allclose(f[0], 0.0, atol=1e-7)  # wrist at origin
        self.assertEqual(f.dtype, np.float32)

    def test_collapsed_hand_is_rejected(self) -> None:
        flat = tuple(Landmark(0.5, 0.5, 0.0) for _ in range(21))
        with self.assertRaises(ValueError):
            _features(flat, "RIGHT")

    def test_symbol_map_matches_server_labels(self) -> None:
        from app.model_adapter import LABELS

        for symbol in _ID_TO_SYMBOL.values():
            self.assertIn(symbol, LABELS)


class StubChecker:
    """Test double: vetoes a fixed symbol set unconditionally."""

    def __init__(self, veto_symbols: frozenset[str]) -> None:
        self.covered_symbols = veto_symbols

    def vetoes(self, symbol: str, landmarks, handedness: str) -> bool:
        return symbol in self.covered_symbols


class NoneCheckerWiringTests(unittest.TestCase):
    def _event(self, checker, labels, probabilities):
        from app.messages import parse_request
        from app.recognition_session import RecognitionSession
        from tests.helpers import MockModelRunner, landmark_frame

        runner = MockModelRunner([np.asarray(probabilities, dtype=np.float32)], labels=labels)
        session = RecognitionSession(runner, none_checker=checker)
        request = parse_request(landmark_frame(1, 1000))
        return session.process_landmark_frame(1, 1000, request.landmarks)[0]

    def test_vetoed_frame_is_suppressed_with_feedback(self) -> None:
        from app.model_adapter import SUPPRESSED_CONFIDENCE

        event = self._event(StubChecker(frozenset({"ㅂ"})), ("ㅂ", "ㄴ"), [0.99, 0.01])
        self.assertEqual(event["symbol"], "ㅂ")
        self.assertAlmostEqual(event["confidence"], SUPPRESSED_CONFIDENCE)
        self.assertIn("handshapeHint", event)

    def test_uncovered_symbol_is_untouched(self) -> None:
        event = self._event(StubChecker(frozenset({"ㅂ"})), ("ㄱ", "ㄴ"), [0.99, 0.01])
        self.assertAlmostEqual(event["confidence"], 0.99, places=5)
        self.assertNotIn("handshapeHint", event)

    def test_disabled_checker_changes_nothing(self) -> None:
        event = self._event(None, ("ㅂ", "ㄴ"), [0.99, 0.01])
        self.assertAlmostEqual(event["confidence"], 0.99, places=5)


if __name__ == "__main__":
    unittest.main()
