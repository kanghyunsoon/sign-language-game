from pathlib import Path;
import unittest;

import numpy as np;

from fingerspellingAi.metrics import calculateClassificationMetrics, calibrateClassThresholds;
from fingerspellingAi.trainingConfig import loadTrainingConfig;


class MetricsTest(unittest.TestCase):
    def testCalculatesConfusionMatrixAndMacroMetrics(self) -> None:
        labels = np.asarray([0, 0, 1, 1], dtype=np.int64);
        predictions = np.asarray([0, 1, 1, 1], dtype=np.int64);
        probabilities = np.asarray(
            [[0.9, 0.1], [0.4, 0.6], [0.2, 0.8], [0.1, 0.9]],
            dtype=np.float64,
        );

        metrics, matrix = calculateClassificationMetrics(labels, predictions, probabilities, ("none", "sign"));

        self.assertEqual(matrix.tolist(), [[1, 1], [0, 2]]);
        self.assertAlmostEqual(metrics["accuracy"], 0.75);
        self.assertAlmostEqual(metrics["signFalseAcceptRateOnNone"], 0.5);

    def testUsesDefaultThresholdWhenValidationSupportIsSmall(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        config = loadTrainingConfig(aiRoot / "config" / "training.json");
        labels = np.asarray([0, 1], dtype=np.int64);
        probabilities = np.asarray([[0.9, 0.1], [0.1, 0.9]], dtype=np.float64);

        thresholds = calibrateClassThresholds(labels, probabilities, ("none", "sign"), config.calibration);

        self.assertEqual(thresholds["sign"]["threshold"], 0.8);
        self.assertEqual(thresholds["sign"]["source"], "default_insufficient_validation_samples");


if __name__ == "__main__":
    unittest.main();
