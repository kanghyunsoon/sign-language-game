from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from PIL import Image, ImageOps


SCRIPT_DIR = Path(__file__).resolve().parent
SERVER_ROOT = SCRIPT_DIR.parent
REPOSITORY_ROOT = SERVER_ROOT.parent.parent  # ai/game-server -> ai -> repo root
sys.path.insert(0, str(SERVER_ROOT))

from app.feature_v2 import landmarks_to_feature  # noqa: E402
from app.feature_v3 import landmarks_to_feature as landmarks_to_feature_v3  # noqa: E402
from app.feature_v4 import landmarks_to_feature as landmarks_to_feature_v4  # noqa: E402
from app.feature_v4 import orientation_proxies  # noqa: E402
from app.messages import Landmark  # noqa: E402


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}
# Roboflow folder names are transliterations.  The five command/non-sign
# folders are deliberately excluded: the deployed model has a 31-jamo contract.
JAMO_LABELS = {
    "giyeok": "ㄱ", "nieun": "ㄴ", "digeut": "ㄷ", "rieul": "ㄹ",
    "mieum": "ㅁ", "bieup": "ㅂ", "siot": "ㅅ", "ieung": "ㅇ",
    "jieut": "ㅈ", "chieut": "ㅊ", "kieuk": "ㅋ", "tieut": "ㅌ",
    "pieup": "ㅍ", "hieut": "ㅎ", "a": "ㅏ", "ya": "ㅑ",
    "eo": "ㅓ", "yeo": "ㅕ", "o": "ㅗ", "yo": "ㅛ", "u": "ㅜ",
    "yu": "ㅠ", "eu": "ㅡ", "i": "ㅣ", "ae": "ㅐ", "yae": "ㅒ",
    "e": "ㅔ", "ye": "ㅖ", "ui": "ㅢ", "oe": "ㅚ", "wi": "ㅟ",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract versioned MediaPipe features from the Roboflow jamo dataset.")
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--landmarker", type=Path,
        default=REPOSITORY_ROOT / "frontend" / "public" / "mediapipe" / "hand_landmarker.task",
    )
    parser.add_argument("--maximum-side", type=int, default=1024)
    parser.add_argument("--feature-version", choices=("v2", "v3", "v4"), default="v2")
    return parser.parse_args()


def load_rgb(path: Path, maximum_side: int) -> np.ndarray:
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image.thumbnail((maximum_side, maximum_side), Image.Resampling.LANCZOS)
        return np.asarray(image)


def main() -> None:
    args = parse_args()
    feature_builder = {
        "v2": landmarks_to_feature,
        "v3": landmarks_to_feature_v3,
        "v4": landmarks_to_feature_v4,
    }[args.feature_version]
    paths = sorted(path for path in args.dataset.rglob("*") if path.suffix.lower() in IMAGE_SUFFIXES)
    features: list[np.ndarray] = []
    labels: list[str] = []
    splits: list[str] = []
    sources: list[str] = []
    handedness_values: list[str] = []
    vertical_direction_y: list[float] = []
    palm_normal_z: list[float] = []
    failures: list[str] = []
    excluded = Counter()
    accepted_by_split = Counter()
    accepted_by_label = Counter()
    options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(args.landmarker)),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=1,
        min_hand_detection_confidence=0.25,
        min_hand_presence_confidence=0.25,
    )
    with vision.HandLandmarker.create_from_options(options) as landmarker:
        for index, path in enumerate(paths, start=1):
            relative = path.relative_to(args.dataset)
            if len(relative.parts) < 3 or relative.parts[0] not in {"train", "valid", "test"}:
                failures.append(f"invalid layout: {relative.as_posix()}")
                continue
            source_label = relative.parts[1]
            label = JAMO_LABELS.get(source_label)
            if label is None:
                excluded[source_label] += 1
                continue
            try:
                rgb = load_rgb(path, args.maximum_side)
                result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
                if not result.hand_landmarks or not result.handedness:
                    failures.append(f"no hand: {relative.as_posix()}")
                    continue
                category = result.handedness[0][0]
                handedness = category.category_name.upper()
                landmarks = tuple(Landmark(x=item.x, y=item.y, z=item.z) for item in result.hand_landmarks[0])
                feature = feature_builder(landmarks, handedness)
                vertical_signal, palm_signal = orientation_proxies(landmarks, handedness)
            except Exception as error:
                failures.append(f"{relative.as_posix()}: {type(error).__name__}: {error}")
                continue
            features.append(np.repeat(feature[None, :], 10, axis=0))
            labels.append(label)
            splits.append(relative.parts[0])
            sources.append(relative.as_posix())
            handedness_values.append(handedness)
            vertical_direction_y.append(vertical_signal)
            palm_normal_z.append(palm_signal)
            accepted_by_split[relative.parts[0]] += 1
            accepted_by_label[label] += 1
            if index % 100 == 0:
                print(f"processed {index}/{len(paths)}; accepted={len(features)}; failed={len(failures)}", flush=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.output, features=np.asarray(features, dtype=np.float32), labels=np.asarray(labels),
        splits=np.asarray(splits), sources=np.asarray(sources), handedness=np.asarray(handedness_values),
        vertical_direction_y=np.asarray(vertical_direction_y, dtype=np.float32),
        palm_normal_z=np.asarray(palm_normal_z, dtype=np.float32),
    )
    audit = {
        "source": "https://universe.roboflow.com/-q9ifs/sign-language-2hatp/dataset/1",
        "license": "CC BY 4.0",
        "imagesDiscovered": len(paths), "accepted": len(features), "failed": len(failures),
        "acceptedBySplit": dict(sorted(accepted_by_split.items())),
        "acceptedByLabel": dict(sorted(accepted_by_label.items())),
        "excludedControlLabels": dict(sorted(excluded.items())), "failures": failures,
        "featureContract": f"10 repeated frames of MediaPipe {args.feature_version} features",
        # `features` is [samples, repeated_frames, feature_dimension].  Record
        # the feature dimension, not the fixed ten-frame static clip length.
        "featureSize": int(features[0].shape[-1]) if features else 0,
        "limitation": "Static, augmented images do not measure temporal motion or hand-palm/back orientation robustness.",
    }
    audit_path = args.output.with_suffix(".audit.json")
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"features": str(args.output), "audit": str(audit_path), "accepted": len(features)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
