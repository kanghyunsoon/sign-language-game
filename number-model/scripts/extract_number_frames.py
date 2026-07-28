"""Extract per-frame `feature_v3` values for the number-only model.

This is deliberately not `extract_number_features.py`. That script repeats each
static image ten times to fit the 10-frame sequence contract, which makes the
`std` and `last - first` halves of the downstream 220-value summary exactly
zero for every number sample while real camera frames are never like that.
The number-only model classifies one frame at a time, so no repetition happens
here and no such train/serve mismatch can be introduced.

One run handles one source directory. Merge sources at training time by passing
several `--features` files to `train_number_model.py`, so each source keeps its
own audit record and license note.

Layouts:
  provider     `<split>/<label>/<image>`        e.g. KSL Numbers train/test folders
  participant  `<participantId>/<label>/<image>` e.g. ai/data/collection-template

`provider` sources carry no signer identity, so their group column stays empty
and the trainer refuses to build a locked test out of them.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import mediapipe as mp
import numpy as np
from PIL import Image, ImageOps
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

try:  # HEIC support is optional: without it only .heic files fail, not the run
    from pillow_heif import register_heif_opener
except ImportError:
    register_heif_opener = None


NUMBER_MODEL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(NUMBER_MODEL_ROOT))

from numbermodel.features import FEATURE_SIZE, REPOSITORY_ROOT, Landmark, landmarks_to_feature  # noqa: E402

# labels, not adapter: the adapter loads joblib and a manifest, neither of which
# a machine that only holds the raw images needs in order to extract features.
from numbermodel.labels import LABELS, SOURCE_LABEL_MAP  # noqa: E402


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".heic"}
PROVIDER_SPLITS = {"train", "valid", "validation", "test"}
SPLIT_ALIASES = {"validation": "valid"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract per-frame feature_v3 values for the number-only model.")
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--layout", choices=("provider", "participant"), default="provider")
    parser.add_argument("--source-name", required=True, help="Provenance tag recorded in the audit file")
    parser.add_argument("--license", required=True, help="License of the source dataset, recorded in the audit file")
    parser.add_argument("--source-url", default="", help="Where the source came from, recorded in the audit file")
    parser.add_argument(
        "--landmarker",
        type=Path,
        default=REPOSITORY_ROOT / "frontend" / "public" / "mediapipe" / "hand_landmarker.task",
    )
    parser.add_argument("--maximum-side", type=int, default=1024)
    parser.add_argument("--minimum-detection-confidence", type=float, default=0.25)
    return parser.parse_args()


def load_rgb(path: Path, maximum_side: int) -> np.ndarray:
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image.thumbnail((maximum_side, maximum_side), Image.Resampling.LANCZOS)
        return np.asarray(image)


def classify_path(relative: Path, layout: str) -> tuple[str, str, str] | None:
    """Return (label, split, group) or None when the path is outside the contract."""
    parts = relative.parts
    if len(parts) < 3:
        return None
    label = SOURCE_LABEL_MAP.get(parts[1])
    if label is None:
        return None
    if layout == "provider":
        split = SPLIT_ALIASES.get(parts[0], parts[0])
        if split not in {SPLIT_ALIASES.get(name, name) for name in PROVIDER_SPLITS}:
            return None
        return label, split, ""
    # Participant layout assigns splits later, by participant, so that no signer
    # appears in more than one split.
    return label, "", parts[0]


def main() -> None:
    args = parse_args()
    heif_supported = register_heif_opener is not None
    if heif_supported:
        register_heif_opener()
    if not args.landmarker.is_file():
        raise FileNotFoundError(f"MediaPipe hand landmarker not found: {args.landmarker}")

    paths = sorted(path for path in args.dataset.rglob("*") if path.suffix.lower() in IMAGE_SUFFIXES)
    heic_count = sum(1 for path in paths if path.suffix.lower() == ".heic")
    if heic_count and not heif_supported:
        # Much of the KSL source is iPhone HEIC, so silently losing it would
        # quietly halve a class rather than fail loudly.
        print(
            f"WARNING: {heic_count} .heic images found but pillow-heif is not installed; "
            "they will all be recorded as failures. Install pillow-heif and rerun.",
            flush=True,
        )
    options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(args.landmarker)),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=1,
        min_hand_detection_confidence=args.minimum_detection_confidence,
        min_hand_presence_confidence=args.minimum_detection_confidence,
    )

    features: list[np.ndarray] = []
    labels: list[str] = []
    splits: list[str] = []
    groups: list[str] = []
    sources: list[str] = []
    handedness_values: list[str] = []
    failures: list[str] = []
    skipped = 0

    with vision.HandLandmarker.create_from_options(options) as landmarker:
        for index, path in enumerate(paths, start=1):
            relative = path.relative_to(args.dataset)
            classified = classify_path(relative, args.layout)
            if classified is None:
                skipped += 1
                continue
            label, split, group = classified
            try:
                rgb = load_rgb(path, args.maximum_side)
                result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
                if not result.hand_landmarks or not result.handedness:
                    failures.append(relative.as_posix())
                    continue
                handedness = result.handedness[0][0].category_name.upper()
                landmarks = tuple(Landmark(x=item.x, y=item.y, z=item.z) for item in result.hand_landmarks[0])
                feature = landmarks_to_feature(landmarks, handedness)
            except Exception as error:  # keep a complete audit instead of silently dropping files
                failures.append(f"{relative.as_posix()}: {type(error).__name__}: {error}")
                continue
            features.append(feature)
            labels.append(label)
            splits.append(split)
            groups.append(group)
            sources.append(relative.as_posix())
            handedness_values.append(handedness)
            if index % 100 == 0:
                print(f"processed {index}/{len(paths)}; accepted={len(features)}; failed={len(failures)}", flush=True)

    # The audit is written before any failure is raised: a run where nothing was
    # accepted is exactly the run whose counts and failure reasons are needed.
    per_label = {label: int(sum(1 for value in labels if value == label)) for label in LABELS}
    audit = {
        "dataset": str(args.dataset),
        "sourceName": args.source_name,
        "license": args.license,
        "sourceUrl": args.source_url,
        "layout": args.layout,
        "featureVersion": "v3",
        "featureSize": FEATURE_SIZE,
        "frameInput": True,
        "images": len(paths),
        "heicImages": heic_count,
        "heifSupported": heif_supported,
        "accepted": len(features),
        "failed": len(failures),
        "skippedOutsideContract": skipped,
        "perLabel": per_label,
        "missingLabels": [label for label, count in per_label.items() if count == 0],
        "groupsPresent": bool(any(groups)),
        "failures": failures,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    audit_path = args.output.with_suffix(".audit.json")
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in audit.items() if key != "failures"}, ensure_ascii=False, indent=2))
    print(audit_path)

    if not features:
        raise RuntimeError(
            f"No frames were accepted. {skipped} files fell outside the --layout contract and "
            f"{len(failures)} failed detection; see {audit_path}",
        )

    stacked = np.asarray(features, dtype=np.float32)
    if stacked.shape[1:] != (FEATURE_SIZE,):
        raise RuntimeError(f"Expected [samples, {FEATURE_SIZE}] features, got {stacked.shape}")

    np.savez_compressed(
        args.output,
        features=stacked,
        labels=np.asarray(labels),
        splits=np.asarray(splits),
        groups=np.asarray(groups),
        sources=np.asarray(sources),
        handedness=np.asarray(handedness_values),
        featureVersion=np.asarray("v3"),
        sourceName=np.asarray(args.source_name),
    )
    print(f"features written: {args.output} {stacked.shape}")


if __name__ == "__main__":
    main()
