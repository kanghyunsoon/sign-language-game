import json;
from pathlib import Path;
import tempfile;
import unittest;

import numpy as np;

from fingerspellingAi.cli import createParser;
from fingerspellingAi.reporting import writeTrainingReports;
from fingerspellingAi.trainingConfig import ReportingConfig;


class ReportingTest(unittest.TestCase):
    def testWritesReadableReportsAndFlagsInsufficientValidationData(self) -> None:
        classIds = ("none", "consonant_giyeok", "consonant_nieun");
        displayNames = {"none": "NONE", "consonant_giyeok": "ㄱ", "consonant_nieun": "ㄴ"};
        validationConfusion = np.asarray(
            [
                [2, 1, 0],
                [0, 3, 0],
                [0, 2, 0],
            ],
            dtype=np.int64,
        );
        validation = self._metrics(
            sampleCount=8,
            accuracy=0.625,
            macroF1=0.5,
            noneFalseAcceptRate=1.0 / 3.0,
            perClass={
                "none": {"precision": 1.0, "recall": 2.0 / 3.0, "f1": 0.8, "support": 3, "falseAcceptRate": 0.0},
                "consonant_giyeok": {"precision": 0.5, "recall": 1.0, "f1": 2.0 / 3.0, "support": 3, "falseAcceptRate": 0.6},
                "consonant_nieun": {"precision": 0.0, "recall": 0.0, "f1": 0.0, "support": 2, "falseAcceptRate": 0.0},
            },
        );
        train = self._metrics(
            sampleCount=30,
            accuracy=0.95,
            macroF1=0.94,
            noneFalseAcceptRate=0.0,
            perClass=validation["perClass"],
        );
        metrics = {
            "schemaVersion": "1.0.0",
            "modelVersion": "report-test-v1",
            "bestEpoch": 4,
            "completedEpochs": 6,
            "testEvaluated": False,
            "train": train,
            "validation": validation,
            "test": None,
        };
        thresholds = {
            classId: {
                "threshold": 0.8,
                "source": "default_insufficient_validation_samples",
                "validationSupport": validation["perClass"][classId]["support"],
            }
            for classId in classIds
        };
        config = ReportingConfig(
            weakClassLimit=2,
            confusionPairLimit=3,
            minimumValidationMacroF1=0.8,
            minimumClassRecall=0.6,
            maximumNoneFalseAcceptRate=0.05,
            maximumGeneralizationGap=0.15,
        );

        with tempfile.TemporaryDirectory() as tempDirectory:
            outputRoot = Path(tempDirectory);
            report = writeTrainingReports(
                outputRoot=outputRoot,
                modelVersion="report-test-v1",
                createdAt="2026-07-22T00:00:00+00:00",
                gitCommit="test-commit",
                dataset={"version": "dataset-v1", "sampleCount": 38},
                classIds=classIds,
                displayNames=displayNames,
                metrics=metrics,
                validationConfusion=validationConfusion,
                thresholds=thresholds,
                history=[{"epoch": 1, "validationMacroF1": 0.5}],
                runtime={"durationSeconds": 65.0, "peakGpuMemoryBytes": 0, "deviceName": "CPU"},
                reportingConfig=config,
                minimumValidationSamplesPerClass=5,
                baselinePackage=None,
            );

            self.assertEqual(report["status"], "additional_validation_required");
            self.assertEqual(report["weakClasses"][0]["classId"], "consonant_nieun");
            self.assertEqual(report["confusionPairs"][0]["actualClassId"], "consonant_nieun");
            self.assertEqual(report["confusionPairs"][0]["predictedClassId"], "consonant_giyeok");
            self.assertFalse(report["testEvaluated"]);
            self.assertTrue((outputRoot / "training-report.html").is_file());
            self.assertTrue((outputRoot / "training-report.md").is_file());
            persisted = json.loads((outputRoot / "report-data.json").read_text(encoding="utf-8"));
            self.assertEqual(persisted["statusDisplayName"], "추가 검증 필요");
            html = (outputRoot / "training-report.html").read_text(encoding="utf-8");
            self.assertIn("ㄴ", html);
            self.assertIn("Test 평가", html);

    def testTrainCommandDoesNotEvaluateTestUnlessRequested(self) -> None:
        parser = createParser();
        defaultArgs = parser.parse_args(
            ["train", "--dataset", "dataset", "--output", "output", "--model-version", "v1"],
        );
        finalArgs = parser.parse_args(
            [
                "train",
                "--dataset",
                "dataset",
                "--output",
                "output",
                "--model-version",
                "v1",
                "--evaluate-test",
            ],
        );

        self.assertFalse(defaultArgs.evaluate_test);
        self.assertTrue(finalArgs.evaluate_test);

    @staticmethod
    def _metrics(
        sampleCount: int,
        accuracy: float,
        macroF1: float,
        noneFalseAcceptRate: float,
        perClass: dict,
    ) -> dict:
        return {
            "sampleCount": sampleCount,
            "accuracy": accuracy,
            "macroPrecision": macroF1,
            "macroRecall": macroF1,
            "macroF1": macroF1,
            "expectedCalibrationError": 0.1,
            "signFalseAcceptRateOnNone": noneFalseAcceptRate,
            "perClass": perClass,
            "loss": 0.5,
        };


if __name__ == "__main__":
    unittest.main();
