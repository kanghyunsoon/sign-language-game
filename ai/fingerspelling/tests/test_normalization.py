import unittest;

import numpy as np;

from fingerspellingAi.config import NormalizationConfig;
from fingerspellingAi.normalization import normalizeWorldLandmarks;


def createConfig() -> NormalizationConfig:
    return NormalizationConfig(
        originLandmarkIndex=0,
        scaleLandmarkIndices=(5, 9, 13, 17),
        canonicalHandedness="Right",
        scaleEpsilon=0.000001,
        applyRotationNormalization=False,
    );


def createLandmarks() -> np.ndarray:
    points = np.zeros((21, 3), dtype=np.float32);
    for index in range(1, 21):
        points[index] = [index * 0.01, index * 0.02, index * -0.005];
    return points;


class NormalizeWorldLandmarksTest(unittest.TestCase):
    def testRemovesTranslationAndScale(self) -> None:
        landmarks = createLandmarks();
        transformed = landmarks * 3.5 + np.array([4.0, -2.0, 1.0], dtype=np.float32);

        normalized = normalizeWorldLandmarks(landmarks, "Right", createConfig());
        transformedNormalized = normalizeWorldLandmarks(transformed, "Right", createConfig());

        np.testing.assert_allclose(normalized, transformedNormalized, atol=1e-5);
        np.testing.assert_allclose(normalized[:3], np.zeros(3), atol=1e-7);
        self.assertEqual(normalized.shape, (63,));
        self.assertEqual(normalized.dtype, np.float32);

    def testMirrorsLeftHandToCanonicalRightHand(self) -> None:
        rightHand = createLandmarks();
        leftHand = rightHand.copy();
        leftHand[:, 0] *= -1.0;

        rightNormalized = normalizeWorldLandmarks(rightHand, "Right", createConfig());
        leftNormalized = normalizeWorldLandmarks(leftHand, "Left", createConfig());

        np.testing.assert_allclose(rightNormalized, leftNormalized, atol=1e-6);

    def testRejectsDegeneratePalmScale(self) -> None:
        with self.assertRaisesRegex(ValueError, "Palm scale"):
            normalizeWorldLandmarks(np.zeros((21, 3), dtype=np.float32), "Right", createConfig());


if __name__ == "__main__":
    unittest.main();
