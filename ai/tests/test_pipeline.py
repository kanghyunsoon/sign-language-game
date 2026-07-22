import json;
from pathlib import Path;
import tempfile;
import unittest;

import numpy as np;

from fingerspellingAi.extractor import ExtractedHand;
from fingerspellingAi.labels import loadModelLabels;
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


class MutatingExtractor(FakeExtractor):
    def extract(self, imagePath: Path) -> ExtractedHand:
        hand = super().extract(imagePath);
        imagePath.write_bytes(imagePath.read_bytes() + b"-changed");
        return hand;


class ImagePreprocessingPipelineTest(unittest.TestCase):
    def testCreatesRawProcessedRejectedAndManifestArtifacts(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            _createCompleteTrainDataset(root / "input", aiRoot);
            validationImage = root / "input" / "valid" / "consonant_giyeok" / "consonant_giyeok__valid__src-0001__hash.jpg";
            validationImage.parent.mkdir(parents=True);
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

            self.assertEqual(manifest["inputSampleCount"], 33);
            self.assertEqual(manifest["acceptedSampleCount"], 32);
            self.assertEqual(manifest["rejectedByReason"], {"evaluation_participant_required": 1});
            rawRecords = _readJsonLines(outputRoot / "raw" / "frames.jsonl");
            rejectedRecords = _readJsonLines(outputRoot / "rejected" / "frames.jsonl");
            self.assertEqual(len(rawRecords), 33);
            self.assertEqual(len(rejectedRecords), 1);
            self.assertNotIn("modelInput", rawRecords[0]);
            self.assertEqual(rawRecords[0]["extractor"]["runningMode"], "IMAGE");
            with np.load(outputRoot / "processed" / "frames.npz", allow_pickle=False) as dataset:
                self.assertEqual(dataset["features"].shape, (32, 63));
                self.assertEqual(dataset["features"].dtype, np.float32);
                self.assertEqual(set(dataset["participantIds"].tolist()), {"p-local-001"});
                self.assertEqual(dataset["classIds"].shape, (32,));
                acceptedRawSampleIds = {record["sampleId"] for record in rawRecords if record["quality"]["valid"]};
                self.assertEqual(set(dataset["sampleIds"].tolist()), acceptedRawSampleIds);

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

    def testPreservesExistingOutputWhenModelHashIsInvalid(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            imagePath = root / "input" / "train" / "none" / "none__train__p-local-001__capture-001.jpg";
            imagePath.parent.mkdir(parents=True);
            imagePath.write_bytes(b"photo");
            outputRoot = root / "output";
            outputRoot.mkdir();
            sentinelPath = outputRoot / "existing-result.txt";
            sentinelPath.write_text("keep", encoding="utf-8");
            modelPath = root / "wrong-model.task";
            modelPath.write_bytes(b"wrong-model");

            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                runImagePreprocessing(
                    inputRoot=root / "input",
                    outputRoot=outputRoot,
                    modelPath=modelPath,
                    labelsPath=aiRoot / "config" / "labels.json",
                    configPath=aiRoot / "config" / "preprocessing.json",
                    datasetVersion="test-v1",
                    overwrite=True,
                );

            self.assertTrue(sentinelPath.is_file());

    def testPreservesExistingOutputWhenTrainingClassIsMissing(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            imagePath = root / "input" / "train" / "none" / "none__train__p-local-001__capture-001.jpg";
            imagePath.parent.mkdir(parents=True);
            imagePath.write_bytes(b"photo");
            outputRoot = root / "output";
            outputRoot.mkdir();
            sentinelPath = outputRoot / "existing-result.txt";
            sentinelPath.write_text("keep", encoding="utf-8");
            modelPath = root / "model.task";
            modelPath.write_bytes(b"model");

            with self.assertRaisesRegex(ValueError, "Every model class"):
                runImagePreprocessing(
                    inputRoot=root / "input",
                    outputRoot=outputRoot,
                    modelPath=modelPath,
                    labelsPath=aiRoot / "config" / "labels.json",
                    configPath=aiRoot / "config" / "preprocessing.json",
                    datasetVersion="test-v1",
                    overwrite=True,
                    extractor=FakeExtractor(),
                );

            self.assertTrue(sentinelPath.is_file());
            stagingPaths = list(root.glob(".output.staging-*"));
            self.assertEqual(stagingPaths, []);

    def testAbortsWhenSourceImageChangesDuringExtraction(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            _createCompleteTrainDataset(root / "input", aiRoot);
            outputRoot = root / "output";
            outputRoot.mkdir();
            sentinelPath = outputRoot / "existing-result.txt";
            sentinelPath.write_text("keep", encoding="utf-8");
            modelPath = root / "model.task";
            modelPath.write_bytes(b"model");

            with self.assertRaisesRegex(RuntimeError, "Source image changed"):
                runImagePreprocessing(
                    inputRoot=root / "input",
                    outputRoot=outputRoot,
                    modelPath=modelPath,
                    labelsPath=aiRoot / "config" / "labels.json",
                    configPath=aiRoot / "config" / "preprocessing.json",
                    datasetVersion="test-v1",
                    overwrite=True,
                    extractor=MutatingExtractor(),
                );

            self.assertTrue(sentinelPath.is_file());
            self.assertEqual(list(root.glob(".output.staging-*")), []);


def _readJsonLines(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line];


def _createCompleteTrainDataset(inputRoot: Path, aiRoot: Path) -> None:
    labels = loadModelLabels(aiRoot / "config" / "labels.json");
    for index, label in enumerate(labels):
        imagePath = inputRoot / "train" / label.id / f"{label.id}__train__p-local-001__capture-{index:03d}.jpg";
        imagePath.parent.mkdir(parents=True);
        imagePath.write_bytes(f"train-photo-{label.id}".encode("ascii"));


if __name__ == "__main__":
    unittest.main();
