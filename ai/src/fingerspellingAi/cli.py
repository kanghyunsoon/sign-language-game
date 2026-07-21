"""Command-line interface for model download and image preprocessing.""";

import argparse;
import json;
from pathlib import Path;
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
    return parser;


def main() -> None:
    args = createParser().parse_args();
    if args.command == "download-model":
        _downloadModel(args.output, args.config, args.overwrite);
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
