import json;
from pathlib import Path;
import tempfile;
import unittest;

from fingerspellingAi.config import loadPreprocessingConfig;
from fingerspellingAi.dataset import discoverSamples, parseSampleIdentity;
from fingerspellingAi.labels import loadModelLabels;


class DatasetDiscoveryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.aiRoot = Path(__file__).resolve().parents[1];
        self.labels = loadModelLabels(self.aiRoot / "config" / "labels.json");
        self.config = loadPreprocessingConfig(self.aiRoot / "config" / "preprocessing.json");

    def testNormalizesValidSplitAndPreservesParticipant(self) -> None:
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            imagePath = root / "valid" / "vowel_a" / "vowel_a__valid__p-local-002__capture-001.jpg";
            imagePath.parent.mkdir(parents=True);
            imagePath.write_bytes(b"photo");

            samples, warnings = discoverSamples(root, self.labels, self.config.dataset);

            self.assertEqual(warnings, []);
            self.assertEqual(len(samples), 1);
            self.assertEqual(samples[0].split, "validation");
            self.assertEqual(samples[0].participantId, "p-local-002");
            self.assertEqual(samples[0].source, "team-capture");

    def testRejectsUnknownLabelDirectory(self) -> None:
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            imagePath = root / "train" / "unknown_label" / "image.jpg";
            imagePath.parent.mkdir(parents=True);
            imagePath.write_bytes(b"photo");

            with self.assertRaisesRegex(ValueError, "Unknown label"):
                discoverSamples(root, self.labels, self.config.dataset);

    def testParsesPublicDatasetIdentity(self) -> None:
        participantId, source, groupId = parseSampleIdentity(
            Path("consonant_giyeok") / "consonant_giyeok__train__src-0001__abc123.jpg",
        );

        self.assertIsNone(participantId);
        self.assertEqual(source, "public-dataset");
        self.assertEqual(groupId, "consonant_giyeok:src-0001");

    def testRejectsParticipantSplitLeakage(self) -> None:
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            for index, split in enumerate(("train", "valid")):
                imagePath = root / split / "vowel_a" / f"vowel_a__{split}__p-local-001__capture-001.jpg";
                imagePath.parent.mkdir(parents=True);
                imagePath.write_bytes(f"photo-{index}".encode("ascii"));

            with self.assertRaisesRegex(ValueError, "must not span"):
                discoverSamples(root, self.labels, self.config.dataset);

    def testRejectsDuplicateImageContentsAcrossSplits(self) -> None:
        with tempfile.TemporaryDirectory() as tempDirectory:
            root = Path(tempDirectory);
            for split, participantId in (("train", "p-local-001"), ("test", "p-local-004")):
                imagePath = root / split / "vowel_a" / f"vowel_a__{split}__{participantId}__capture-001.jpg";
                imagePath.parent.mkdir(parents=True);
                imagePath.write_bytes(b"identical-photo");

            with self.assertRaisesRegex(ValueError, "Duplicate image contents"):
                discoverSamples(root, self.labels, self.config.dataset);


if __name__ == "__main__":
    unittest.main();
