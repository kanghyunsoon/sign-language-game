import json;
from pathlib import Path;
import tempfile;
import unittest;

import numpy as np;

from fingerspellingAi.config import loadPreprocessingConfig;
from fingerspellingAi.trainingData import loadTrainingDataset;
from trainingFixtures import writeSyntheticDataset;


class TrainingDatasetTest(unittest.TestCase):
    def testLoadsValidatedDatasetAndSplits(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            datasetRoot = Path(tempDirectory) / "dataset";
            writeSyntheticDataset(
                datasetRoot,
                aiRoot / "config" / "labels.json",
                aiRoot / "config" / "preprocessing.json",
            );

            dataset = loadTrainingDataset(
                datasetRoot,
                aiRoot / "config" / "labels.json",
                aiRoot / "config" / "preprocessing.json",
            );

            self.assertEqual(dataset.features.shape, (160, 63));
            self.assertEqual(len(dataset.indicesForSplit("train")), 96);
            self.assertEqual(len(dataset.indicesForSplit("validation")), 32);
            self.assertEqual(len(dataset.indicesForSplit("test")), 32);

    def testRejectsParticipantSplitLeakage(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            datasetRoot = Path(tempDirectory) / "dataset";
            writeSyntheticDataset(datasetRoot, aiRoot / "config" / "labels.json", aiRoot / "config" / "preprocessing.json");
            processedPath = datasetRoot / "processed" / "frames.npz";
            with np.load(processedPath, allow_pickle=False) as archive:
                arrays = {name: np.array(archive[name], copy=True) for name in archive.files};
            arrays["participantIds"][96] = arrays["participantIds"][0];
            np.savez_compressed(processedPath, **arrays);

            with self.assertRaisesRegex(ValueError, "participant appears in multiple splits"):
                loadTrainingDataset(datasetRoot, aiRoot / "config" / "labels.json", aiRoot / "config" / "preprocessing.json");

    def testRejectsConfigurationHashMismatch(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            datasetRoot = Path(tempDirectory) / "dataset";
            writeSyntheticDataset(datasetRoot, aiRoot / "config" / "labels.json", aiRoot / "config" / "preprocessing.json");
            manifestPath = datasetRoot / "manifest.json";
            manifest = json.loads(manifestPath.read_text(encoding="utf-8"));
            manifest["identity"]["labelsCanonicalSha256"] = "wrong-hash";
            manifestPath.write_text(json.dumps(manifest), encoding="utf-8");

            with self.assertRaisesRegex(ValueError, "labelsCanonicalSha256"):
                loadTrainingDataset(datasetRoot, aiRoot / "config" / "labels.json", aiRoot / "config" / "preprocessing.json");

    def testAcceptsLegacyManifestWhenNormalizationMatches(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            datasetRoot = Path(tempDirectory) / "dataset";
            writeSyntheticDataset(datasetRoot, aiRoot / "config" / "labels.json", aiRoot / "config" / "preprocessing.json");
            manifestPath = datasetRoot / "manifest.json";
            manifest = json.loads(manifestPath.read_text(encoding="utf-8"));
            del manifest["identity"]["preprocessingConfigCanonicalSha256"];
            manifest["identity"]["preprocessingConfigSha256"] = "legacy-line-ending-hash";
            manifest["identity"]["mediaPipeModelSha256"] = loadPreprocessingConfig(
                aiRoot / "config" / "preprocessing.json",
            ).mediaPipe.modelSha256;
            manifestPath.write_text(json.dumps(manifest), encoding="utf-8");

            dataset = loadTrainingDataset(
                datasetRoot,
                aiRoot / "config" / "labels.json",
                aiRoot / "config" / "preprocessing.json",
            );

            self.assertEqual(dataset.features.shape[1], 63);


if __name__ == "__main__":
    unittest.main();
