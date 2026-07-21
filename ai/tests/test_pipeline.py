import json;
from pathlib import Path;
import tempfile;
import unittest;

import numpy as np;

from fingerspellingAi.extractor import ExtractedHand;
from fingerspellingAi.pipeline import runImagePreprocessing;


class FakeExtractor:
    def extract(self, imagePath: Path) -> ExtractedHand:
        landmarks = [];
        worldLandmarks = [];
        for index in range(21):
            landmarks.append([0.3 + index * 0.01, 0.2 + index * 0.015, index * -0.001]);
            worldLandmarks.append([index * 0.01, index * 0.02, index * -0.005]);
        return ExtractedHand(
            handedness="Right",
            handednessScore=0.99,
            landmarks=landmarks,
            worldLandmarks=worldLandmarks,
            imageWidth=1280,
            imageHeight=720,
        );

    def close(self) -> None:
        return;


class ImagePreprocessingPipelineTest(unittest.TestCase):
    def testCreatesRawProcessedRejectedAndManifestArtifacts(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            trainImage = root / "input" / "train" / "consonant_giyeok" / "consonant_giyeok__train__p-local-001__capture-001.jpg";
            validationImage = root / "input" / "valid" / "consonant_giyeok" / "consonant_giyeok__valid__src-0001__hash.jpg";
            trainImage.parent.mkdir(parents=True);
            validationImage.parent.mkdir(parents=True);
            trainImage.write_bytes(b"train-photo");
            validationImage.write_bytes(b"validation-photo");
            modelPath = root / "hand_landmarker.task";
            modelPath.write_bytes(b"model");
            outputRoot = root / "output";

            manifest = runImagePreprocessing(
                inputRoot=root / "input",
                outputRoot=outputRoot,
                modelPath=modelPath,
                labelsPath=aiRoot / "config" / "labels.json",
                configPath=aiRoot / "config" / "preprocessing.json",
                datasetVersion="test-v1",
                extractor=FakeExtractor(),
            );

            self.assertEqual(manifest["inputSampleCount"], 2);
            self.assertEqual(manifest["acceptedSampleCount"], 1);
            self.assertEqual(manifest["rejectedByReason"], {"evaluation_participant_required": 1});
            rawRecords = _readJsonLines(outputRoot / "raw" / "frames.jsonl");
            rejectedRecords = _readJsonLines(outputRoot / "rejected" / "frames.jsonl");
            self.assertEqual(len(rawRecords), 2);
            self.assertEqual(len(rejectedRecords), 1);
            self.assertNotIn("modelInput", rawRecords[0]);
            self.assertEqual(rawRecords[0]["extractor"]["runningMode"], "IMAGE");
            with np.load(outputRoot / "processed" / "frames.npz", allow_pickle=False) as dataset:
                self.assertEqual(dataset["features"].shape, (1, 63));
                self.assertEqual(dataset["features"].dtype, np.float32);
                self.assertEqual(dataset["participantIds"].tolist(), ["p-local-001"]);
                self.assertEqual(dataset["classIds"].shape, (32,));

    def testRefusesToOverwriteExistingOutputByDefault(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            imagePath = root / "input" / "train" / "none" / "none__train__p-local-001__capture-001.jpg";
            imagePath.parent.mkdir(parents=True);
            imagePath.write_bytes(b"photo");
            outputRoot = root / "output";
            outputRoot.mkdir();
            (outputRoot / "keep.txt").write_text("keep", encoding="utf-8");

            with self.assertRaisesRegex(FileExistsError, "not empty"):
                runImagePreprocessing(
                    inputRoot=root / "input",
                    outputRoot=outputRoot,
                    modelPath=root / "missing.task",
                    labelsPath=aiRoot / "config" / "labels.json",
                    configPath=aiRoot / "config" / "preprocessing.json",
                    datasetVersion="test-v1",
                    extractor=FakeExtractor(),
                );

    def testRefusesOverlappingInputAndOutputDirectories(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            inputRoot = Path(tempDirectory) / "input";
            imagePath = inputRoot / "train" / "none" / "none__train__p-local-001__capture-001.jpg";
            imagePath.parent.mkdir(parents=True);
            imagePath.write_bytes(b"photo");

            with self.assertRaisesRegex(ValueError, "must not overlap"):
                runImagePreprocessing(
                    inputRoot=inputRoot,
                    outputRoot=inputRoot / "processed",
                    modelPath=Path(tempDirectory) / "missing.task",
                    labelsPath=aiRoot / "config" / "labels.json",
                    configPath=aiRoot / "config" / "preprocessing.json",
                    datasetVersion="test-v1",
                    extractor=FakeExtractor(),
                );


def _readJsonLines(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line];


if __name__ == "__main__":
    unittest.main();
