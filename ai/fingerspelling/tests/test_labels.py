from pathlib import Path;
import unittest;

from fingerspellingAi.labels import loadModelLabels;


class ModelLabelsTest(unittest.TestCase):
    def testLoadsFixedJamoModelOrder(self) -> None:
        aiRoot = Path(__file__).resolve().parents[1];

        labels = loadModelLabels(aiRoot / "config" / "labels.json");

        self.assertEqual(len(labels), 32);
        self.assertEqual(labels[0].id, "none");
        self.assertNotIn("transition", [label.id for label in labels]);
        self.assertEqual(labels[-1].id, "vowel_i");


if __name__ == "__main__":
    unittest.main();
