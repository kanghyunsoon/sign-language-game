import importlib.util;
import json;
from pathlib import Path;
import tempfile;
import unittest;

import numpy as np;

from trainingFixtures import writeFastTrainingConfig, writeSyntheticDataset;


TRAINING_DEPENDENCIES_AVAILABLE = all(
    importlib.util.find_spec(name) is not None
    for name in ("torch", "onnx", "onnxruntime")
);


@unittest.skipUnless(TRAINING_DEPENDENCIES_AVAILABLE, "Training dependencies are not installed.")
class TrainingPipelineTest(unittest.TestCase):
    def testSkipsTestSplitForNormalExperiment(self) -> None:
        from fingerspellingAi.training import runTraining;

        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            datasetRoot = root / "dataset";
            outputRoot = root / "model-package";
            trainingConfigPath = root / "training.json";
            writeSyntheticDataset(datasetRoot, aiRoot / "config" / "labels.json", aiRoot / "config" / "preprocessing.json");
            writeFastTrainingConfig(aiRoot / "config" / "training.json", trainingConfigPath);

            manifest = runTraining(
                datasetRoot=datasetRoot,
                outputRoot=outputRoot,
                modelVersion="validation-only-v1",
                labelsPath=aiRoot / "config" / "labels.json",
                preprocessingConfigPath=aiRoot / "config" / "preprocessing.json",
                recognitionPolicyPath=aiRoot / "config" / "recognition-policy.json",
                trainingConfigPath=trainingConfigPath,
                gitCommit="test-commit",
            );

            metrics = json.loads((outputRoot / "metrics.json").read_text(encoding="utf-8"));
            self.assertFalse(metrics["testEvaluated"]);
            self.assertIsNone(metrics["test"]);
            self.assertFalse((outputRoot / "test-confusion-matrix.csv").exists());
            self.assertFalse(manifest["model"]["testEvaluated"]);

    def testCreatesModelPackageAndRunsOnnxInference(self) -> None:
        from fingerspellingAi.inference import OnnxFrameClassifier;
        from fingerspellingAi.training import runTraining;

        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            datasetRoot = root / "dataset";
            outputRoot = root / "model-package";
            trainingConfigPath = root / "training.json";
            writeSyntheticDataset(datasetRoot, aiRoot / "config" / "labels.json", aiRoot / "config" / "preprocessing.json");
            writeFastTrainingConfig(aiRoot / "config" / "training.json", trainingConfigPath);

            manifest = runTraining(
                datasetRoot=datasetRoot,
                outputRoot=outputRoot,
                modelVersion="test-v1",
                labelsPath=aiRoot / "config" / "labels.json",
                preprocessingConfigPath=aiRoot / "config" / "preprocessing.json",
                recognitionPolicyPath=aiRoot / "config" / "recognition-policy.json",
                trainingConfigPath=trainingConfigPath,
                gitCommit="test-commit",
                evaluateTest=True,
            );

            self.assertEqual(manifest["modelVersion"], "test-v1");
            self.assertEqual(manifest["model"]["inputShape"], ["batchSize", 63]);
            self.assertTrue((outputRoot / "model.onnx").is_file());
            self.assertTrue((outputRoot / "checkpoint.pt").is_file());
            self.assertTrue((outputRoot / "test-confusion-matrix.csv").is_file());
            self.assertTrue((outputRoot / "training-report.html").is_file());
            self.assertTrue((outputRoot / "training-report.md").is_file());
            self.assertTrue((outputRoot / "report-data.json").is_file());
            metrics = json.loads((outputRoot / "metrics.json").read_text(encoding="utf-8"));
            self.assertTrue(metrics["testEvaluated"]);
            self.assertEqual(metrics["test"]["sampleCount"], 32);
            self.assertEqual(metrics["train"]["sampleCount"], 96);
            self.assertIn("training-report.html", manifest["artifacts"]);

            classifier = OnnxFrameClassifier(outputRoot);
            features = np.zeros(63, dtype=np.float32);
            features[0] = 2.0;
            prediction = classifier.predict(features);

            self.assertEqual(len(prediction["topCandidates"]), 3);
            self.assertIn(prediction["labelId"], manifest["model"]["classIds"]);


if __name__ == "__main__":
    unittest.main();
