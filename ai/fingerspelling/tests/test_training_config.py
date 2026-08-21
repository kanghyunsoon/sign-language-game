import json;
from pathlib import Path;
import tempfile;
import unittest;

from fingerspellingAi.trainingConfig import loadTrainingConfig;


class TrainingConfigTest(unittest.TestCase):
    def testLoadsFixedTrainingConfiguration(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        config = loadTrainingConfig(aiRoot / "config" / "training.json");

        self.assertEqual(config.model.inputSize, 63);
        self.assertEqual(config.model.hiddenSizes, (256, 128));
        self.assertEqual(config.earlyStopping.monitor, "macroF1");
        self.assertEqual(config.calibration.defaultThreshold, 0.8);
        self.assertEqual(config.reporting.weakClassLimit, 5);
        self.assertEqual(config.reporting.minimumValidationMacroF1, 0.8);

    def testRejectsInvalidThresholdOrder(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        payload = json.loads((aiRoot / "config" / "training.json").read_text(encoding="utf-8"));
        payload["calibration"]["minimumThreshold"] = 0.9;
        payload["calibration"]["maximumThreshold"] = 0.7;
        with tempfile.TemporaryDirectory() as tempDirectory:
            path = Path(tempDirectory) / "training.json";
            path.write_text(json.dumps(payload), encoding="utf-8");

            with self.assertRaisesRegex(ValueError, "thresholds must be ordered"):
                loadTrainingConfig(path);


if __name__ == "__main__":
    unittest.main();
