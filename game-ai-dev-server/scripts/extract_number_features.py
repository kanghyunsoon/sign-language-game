from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import mediapipe as mp
import numpy as np
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from mediapipe.tasks import python
from mediapipe.tasks.python import vision


SCRIPT_DIR = Path(__file__).resolve().parent
SERVER_ROOT = SCRIPT_DIR.parent
REPOSITORY_ROOT = SERVER_ROOT.parent
sys.path.insert(0, str(SERVER_ROOT))

from app.feature_v2 import landmarks_to_feature  # noqa: E402
from app.messages import Landmark  # noqa: E402


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".heic"}
NUMBER_LABELS = {str(value): str(value) for value in range(1, 10)} | {"10-1": "10", "10-2": "10"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--landmarker",
        type=Path,
        default=REPOSITORY_ROOT / "frontend" / "public" / "mediapipe" / "hand_landmarker.task",
    )
    parser.add_argument("--maximum-side", type=int, default=1024)
    return parser.parse_args()


def load_rgb(path: Path, maximum_side: int) -> np.ndarray:
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image.thumbnail((maximum_side, maximum_side), Image.Resampling.LANCZOS)
        return np.asarray(image)


def main() -> None:
    args = parse_args()
    register_heif_opener()
    paths = sorted(path for path in args.dataset.rglob("*") if path.suffix.lower() in IMAGE_SUFFIXES)
    options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(args.landmarker)),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=1,
        min_hand_detection_confidence=0.25,
        min_hand_presence_confidence=0.25,
    )
    features: list[np.ndarray] = []
    labels: list[str] = []
    splits: list[str] = []
    sources: list[str] = []
    handedness_values: list[str] = []
    failures: list[str] = []
    with vision.HandLandmarker.create_from_options(options) as landmarker:
        for index, path in enumerate(paths, start=1):
            relative = path.relative_to(args.dataset)
            if len(relative.parts) < 3 or relative.parts[0] not in {"train", "test"}:
                continue
            source_label = relative.parts[1]
            label = NUMBER_LABELS.get(source_label)
            if label is None:
                continue
            try:
                rgb = load_rgb(path, args.maximum_side)
                result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
                if not result.hand_landmarks or not result.handedness:
                    failures.append(relative.as_posix())
                    continue
                category = result.handedness[0][0]
                handedness = category.category_name.upper()
                landmarks = tuple(Landmark(x=item.x, y=item.y, z=item.z) for item in result.hand_landmarks[0])
                feature = landmarks_to_feature(landmarks, handedness)
            except Exception as error:  # keep a complete audit instead of silently dropping files
                failures.append(f"{relative.as_posix()}: {type(error).__name__}: {error}")
                continue
            features.append(np.repeat(feature[None, :], 10, axis=0))
            labels.append(label)
            splits.append(relative.parts[0])
            sources.append(relative.as_posix())
            handedness_values.append(handedness)
            if index % 100 == 0:
                print(f"processed {index}/{len(paths)}; accepted={len(features)}; failed={len(failures)}", flush=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.output,
        features=np.asarray(features, dtype=np.float32),
        labels=np.asarray(labels),
        splits=np.asarray(splits),
        sources=np.asarray(sources),
        handedness=np.asarray(handedness_values),
    )
    audit_path = args.output.with_suffix(".audit.json")
    audit_path.write_text(
        json.dumps(
            {
                "dataset": str(args.dataset),
                "images": len(paths),
                "accepted": len(features),
                "failed": len(failures),
                "failures": failures,
                "license": "CC0-1.0",
                "source": "https://www.kaggle.com/datasets/nahyunpark/korean-sign-languageksl-numbers",
            },
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print(audit_path)


if __name__ == "__main__":
    main()
