"""Command-line interface for preprocessing, training, and inference.""";

import argparse;
import json;
import os;
from pathlib import Path;
import subprocess;
import sys;
from urllib.request import urlopen;

from .config import calculateSha256, loadPreprocessingConfig;
from .pipeline import runImagePreprocessing;


def createParser() -> argparse.ArgumentParser:
    moduleRoot = Path(__file__).resolve().parents[2];
    parser = argparse.ArgumentParser(description="Korean fingerspelling data pipeline.");
    subparsers = parser.add_subparsers(dest="command", required=True);

    downloadParser = subparsers.add_parser("download-model", help="Download the fixed MediaPipe model asset.");
    downloadParser.add_argument("--output", type=Path, default=moduleRoot / "models" / "hand_landmarker.task");
    downloadParser.add_argument("--config", type=Path, default=moduleRoot / "config" / "preprocessing.json");
    downloadParser.add_argument("--overwrite", action="store_true");

    preprocessParser = subparsers.add_parser("preprocess", help="Extract and normalize landmarks from photos.");
    preprocessParser.add_argument("--input", type=Path, required=True);
    preprocessParser.add_argument("--output", type=Path, required=True);
    preprocessParser.add_argument("--dataset-version", required=True);
    preprocessParser.add_argument("--model", type=Path, default=moduleRoot / "models" / "hand_landmarker.task");
    preprocessParser.add_argument("--labels", type=Path, default=moduleRoot / "config" / "labels.json");
    preprocessParser.add_argument("--config", type=Path, default=moduleRoot / "config" / "preprocessing.json");
    preprocessParser.add_argument("--overwrite", action="store_true");

    trainParser = subparsers.add_parser("train", help="Train and package a single-frame classifier.");
    trainParser.add_argument("--dataset", type=Path, required=True);
    trainParser.add_argument("--output", type=Path, required=True);
    trainParser.add_argument("--model-version", required=True);
    trainParser.add_argument("--labels", type=Path, default=moduleRoot / "config" / "labels.json");
    trainParser.add_argument("--preprocessing-config", type=Path, default=moduleRoot / "config" / "preprocessing.json");
    trainParser.add_argument("--recognition-policy", type=Path, default=moduleRoot / "config" / "recognition-policy.json");
    trainParser.add_argument("--training-config", type=Path, default=moduleRoot / "config" / "training.json");
    trainParser.add_argument("--git-commit", default=None);
    trainParser.add_argument(
        "--evaluate-test",
        action="store_true",
        help="Evaluate the held-out test split for a final candidate.",
    );
    trainParser.add_argument(
        "--baseline-package",
        type=Path,
        default=None,
        help="Compare validation metrics with an existing model package.",
    );
    trainParser.add_argument("--overwrite", action="store_true");

    predictParser = subparsers.add_parser("predict", help="Run ONNX inference for one 63-value feature vector.");
    predictParser.add_argument("--package", type=Path, required=True);
    predictParser.add_argument("--features", type=Path, required=True);
    predictParser.add_argument("--top-k", type=int, default=3);
    return parser;


def main() -> None:
    args = createParser().parse_args();
    if args.command == "download-model":
        _downloadModel(args.output, args.config, args.overwrite);
        return;

    if args.command == "train":
        from .training import runTraining;

        manifest = runTraining(
            datasetRoot=args.dataset,
            outputRoot=args.output,
            modelVersion=args.model_version,
            labelsPath=args.labels,
            preprocessingConfigPath=args.preprocessing_config,
            recognitionPolicyPath=args.recognition_policy,
            trainingConfigPath=args.training_config,
            gitCommit=args.git_commit or _detectGitCommit(moduleRoot),
            overwrite=args.overwrite,
            evaluateTest=args.evaluate_test,
            baselinePackage=args.baseline_package,
            progressCallback=_printTrainingProgress,
        );
        print(json.dumps(manifest, ensure_ascii=False, indent=2));
        return;

    if args.command == "predict":
        from .inference import OnnxFrameClassifier, loadFeaturesJson;

        classifier = OnnxFrameClassifier(args.package);
        prediction = classifier.predict(loadFeaturesJson(args.features), topK=args.top_k);
        print(json.dumps(prediction, ensure_ascii=False, indent=2));
        return;

    manifest = runImagePreprocessing(
        inputRoot=args.input,
        outputRoot=args.output,
        modelPath=args.model,
        labelsPath=args.labels,
        configPath=args.config,
        datasetVersion=args.dataset_version,
        overwrite=args.overwrite,
        progressCallback=_printProgress,
    );
    print(json.dumps(manifest, ensure_ascii=False, indent=2));


def _downloadModel(outputPath: Path, configPath: Path, overwrite: bool) -> None:
    config = loadPreprocessingConfig(configPath);
    if outputPath.exists() and not overwrite:
        digest = calculateSha256(outputPath);
        _verifyModelHash(digest, config.mediaPipe.modelSha256);
        print(f"Model already exists: {outputPath} ({digest})");
        return;

    outputPath.parent.mkdir(parents=True, exist_ok=True);
    tempPath = outputPath.with_suffix(outputPath.suffix + ".tmp");
    try:
        with urlopen(config.mediaPipe.modelUrl, timeout=60) as response:
            with tempPath.open("wb") as outputFile:
                while chunk := response.read(1024 * 1024):
                    outputFile.write(chunk);
        digest = calculateSha256(tempPath);
        _verifyModelHash(digest, config.mediaPipe.modelSha256);
        tempPath.replace(outputPath);
    except Exception:
        tempPath.unlink(missing_ok=True);
        raise;
    print(f"Downloaded model: {outputPath} ({digest})");


def _verifyModelHash(actualHash: str, expectedHash: str) -> None:
    if expectedHash and actualHash.lower() != expectedHash.lower():
        raise ValueError(f"MediaPipe model SHA-256 mismatch: expected {expectedHash}, received {actualHash}.");


def _printProgress(current: int, total: int, relativePath: str) -> None:
    if current == 1 or current == total or current % 100 == 0:
        print(f"[{current}/{total}] {relativePath}", file=sys.stderr);


def _printTrainingProgress(current: int, total: int, metrics: dict[str, float]) -> None:
    if current == 1 or current == total or current % 5 == 0:
        print(
            f"[{current}/{total}] trainLoss={metrics['trainLoss']:.4f} "
            f"validationLoss={metrics['validationLoss']:.4f} "
            f"validationMacroF1={metrics['validationMacroF1']:.4f}",
            file=sys.stderr,
        );


def _detectGitCommit(moduleRoot: Path) -> str:
    environmentCommit = os.environ.get("GIT_COMMIT");
    if environmentCommit:
        return environmentCommit;
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=moduleRoot,
            check=True,
            capture_output=True,
            text=True,
        );
        return completed.stdout.strip();
    except (FileNotFoundError, subprocess.CalledProcessError):
        return "unknown";
