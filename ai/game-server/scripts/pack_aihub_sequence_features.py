"""Pack selected AI Hub 103 OpenPose JSON frames into a compact CTC dataset."""

from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path

import numpy as np


CLASS_NAMES = (
    "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
    "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅔ", "ㅖ", "ㅢ", "ㅚ", "ㅟ",
    "NUM_0", "NUM_1", "NUM_2", "NUM_3", "NUM_4", "NUM_5", "NUM_6", "NUM_7", "NUM_8", "NUM_9",
)
CLASS_TO_INDEX = {name: index for index, name in enumerate(CLASS_NAMES)}
HAND_KEYS = ("hand_left_keypoints_2d", "hand_right_keypoints_2d")
MCP_INDICES = (5, 9, 13, 17)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", type=Path, required=True)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--extracted-root", type=Path)
    source.add_argument("--archive", type=Path, nargs="+")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--confidence-threshold", type=float, default=0.2)
    return parser.parse_args()


def normalized_hand(raw: object, mirror_x: bool, threshold: float) -> tuple[np.ndarray, float]:
    values = np.asarray(raw, dtype=np.float32)
    if values.size != 63:
        return np.zeros(63, dtype=np.float32), 0.0
    points = values.reshape(21, 3)
    valid = np.isfinite(points).all(axis=1) & (points[:, 2] >= threshold)
    if int(valid.sum()) < 6:
        return np.zeros(63, dtype=np.float32), 0.0
    origin = points[0, :2] if valid[0] else np.median(points[valid, :2], axis=0)
    palm_distances = [np.linalg.norm(points[index, :2] - origin) for index in MCP_INDICES if valid[index]]
    scale = float(np.median(palm_distances)) if palm_distances else 0.0
    if not np.isfinite(scale) or scale <= 1e-6:
        scale = float(np.sqrt(np.mean(np.square(points[valid, :2] - origin))))
    if not np.isfinite(scale) or scale <= 1e-6:
        return np.zeros(63, dtype=np.float32), 0.0
    output = np.zeros((21, 3), dtype=np.float32)
    output[valid, :2] = (points[valid, :2] - origin) / scale
    if mirror_x:
        output[valid, 0] *= -1.0
    output[valid, 2] = np.clip(points[valid, 2], 0.0, 1.0)
    return output.reshape(-1), float(valid.mean())


def frame_feature(raw_json: bytes | str, threshold: float) -> np.ndarray:
    payload = json.loads(raw_json)
    people = payload.get("people", {})
    if isinstance(people, list):
        people = people[0] if people else {}
    left, left_presence = normalized_hand(people.get(HAND_KEYS[0], []), True, threshold)
    right, right_presence = normalized_hand(people.get(HAND_KEYS[1], []), False, threshold)
    return np.concatenate((left, right, np.asarray((left_presence, right_presence), dtype=np.float32)))


def main() -> None:
    args = parse_args()
    features: list[np.ndarray] = []
    feature_offsets = [0]
    targets: list[int] = []
    target_offsets = [0]
    clips: list[str] = []
    missing_frames = 0
    dropped_clips = 0

    archives = [zipfile.ZipFile(path) for path in args.archive] if args.archive else []
    try:
        handle = args.metadata.open("r", encoding="utf-8")
        for line in handle:
            row = json.loads(line)
            clip_features: list[np.ndarray] = []
            for member in row["members"]:
                try:
                    if archives:
                        raw_json = None
                        for archive in archives:
                            try:
                                raw_json = archive.read(member)
                                break
                            except KeyError:
                                continue
                        if raw_json is None:
                            raise KeyError(member)
                    else:
                        path = args.extracted_root / Path(member)
                        raw_json = path.read_text(encoding="utf-8")
                except (FileNotFoundError, KeyError):
                    missing_frames += 1
                    continue
                clip_features.append(frame_feature(raw_json, args.confidence_threshold))
            if not clip_features:
                dropped_clips += 1
                continue
            token_ids = [CLASS_TO_INDEX[token] for token in row["tokens"]]
            features.extend(clip_features)
            targets.extend(token_ids)
            feature_offsets.append(len(features))
            target_offsets.append(len(targets))
            clips.append(row["clip"])
    finally:
        if 'handle' in locals():
            handle.close()
        for archive in archives:
            archive.close()

    feature_array = np.asarray(features, dtype=np.float16)
    if feature_array.ndim != 2 or feature_array.shape[1] != 128:
        raise RuntimeError(f"unexpected feature shape: {feature_array.shape}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.output,
        features=feature_array,
        feature_offsets=np.asarray(feature_offsets, dtype=np.int64),
        targets=np.asarray(targets, dtype=np.int16),
        target_offsets=np.asarray(target_offsets, dtype=np.int64),
        class_names=np.asarray(CLASS_NAMES),
        clips=np.asarray(clips),
        confidence_threshold=np.asarray(args.confidence_threshold, dtype=np.float32),
    )
    print(
        json.dumps(
            {
                "clips": len(clips),
                "frames": len(features),
                "targets": len(targets),
                "missingFrames": missing_frames,
                "droppedClips": dropped_clips,
                "featureShape": list(feature_array.shape),
                "outputBytes": args.output.stat().st_size,
            }
        )
    )


if __name__ == "__main__":
    main()
