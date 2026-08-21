"""Prepare reproducible AI Hub 103 frame selections for sequence training.

The source labels contain only phrase-level start/end times.  This script therefore
does not invent per-character boundaries.  It samples a compact sequence inside the
annotated signing interval and leaves alignment to a CTC model.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from analyze_aihub_morpheme_labels import normalized_tokens


FRAME_RE = re.compile(
    r"^(?P<directory>.+/(?P<clip>NIA_SL_FS\d+_CROWD\d+_F)/)"
    r"(?P=clip)_(?P<frame>\d+)_keypoints\.json$"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label-root", type=Path, required=True)
    parser.add_argument("--file-manifest", type=Path, required=True)
    parser.add_argument("--split", required=True)
    parser.add_argument("--output-jsonl", type=Path, required=True)
    parser.add_argument("--output-members", type=Path, required=True)
    parser.add_argument("--min-frames", type=int, default=16)
    parser.add_argument("--max-frames", type=int, default=32)
    return parser.parse_args()


def load_labels(root: Path) -> dict[str, dict[str, object]]:
    labels: dict[str, dict[str, object]] = {}
    for path in root.rglob("*_morpheme.json"):
        payload = json.loads(path.read_text(encoding="utf-8"))
        segment = payload["data"][0]
        text = str(segment["attributes"][0]["name"])
        tokens, unsupported = normalized_tokens(text)
        clip = path.name.removesuffix("_morpheme.json")
        labels[clip] = {
            "text": text,
            "tokens": tokens,
            "unsupported": unsupported,
            "duration": float(payload["metaData"]["duration"]),
            "start": float(segment["start"]),
            "end": float(segment["end"]),
        }
    return labels


def scan_manifest(path: Path) -> tuple[dict[str, int], dict[str, str]]:
    max_frame: dict[str, int] = {}
    directory: dict[str, str] = {}
    with path.open("r", encoding="utf-8", errors="strict") as handle:
        for raw_line in handle:
            match = FRAME_RE.match(raw_line.strip().replace("\\", "/"))
            if not match:
                continue
            clip = match.group("clip")
            frame = int(match.group("frame"))
            if frame > max_frame.get(clip, -1):
                max_frame[clip] = frame
            directory.setdefault(clip, match.group("directory"))
    return max_frame, directory


def evenly_spaced_indices(first: int, last: int, count: int) -> list[int]:
    if last <= first or count <= 1:
        return [first]
    return sorted({round(first + index * (last - first) / (count - 1)) for index in range(count)})


def main() -> None:
    args = parse_args()
    if not 1 <= args.min_frames <= args.max_frames:
        raise ValueError("expected 1 <= min-frames <= max-frames")

    labels = load_labels(args.label_root)
    max_frames, directories = scan_manifest(args.file_manifest)
    args.output_jsonl.parent.mkdir(parents=True, exist_ok=True)
    args.output_members.parent.mkdir(parents=True, exist_ok=True)

    kept = unsupported = missing = 0
    token_total = frame_total = 0
    with args.output_jsonl.open("w", encoding="utf-8") as metadata, args.output_members.open(
        "w", encoding="utf-8", newline="\n"
    ) as members:
        for clip in sorted(labels):
            label = labels[clip]
            tokens = list(label["tokens"])
            if label["unsupported"] or not tokens:
                unsupported += 1
                continue
            if clip not in max_frames:
                missing += 1
                continue
            duration = float(label["duration"])
            max_frame = max_frames[clip]
            if duration <= 0 or max_frame <= 0:
                missing += 1
                continue

            first = max(0, min(max_frame, round(float(label["start"]) / duration * max_frame)))
            last = max(first, min(max_frame, round(float(label["end"]) / duration * max_frame)))
            requested = min(args.max_frames, max(args.min_frames, 2 * len(tokens) + 1))
            indices = evenly_spaced_indices(first, last, requested)
            prefix = directories[clip]
            member_names = [f"{prefix}{clip}_{index:012d}_keypoints.json" for index in indices]
            for member_name in member_names:
                members.write(member_name + "\n")
            metadata.write(
                json.dumps(
                    {
                        "split": args.split,
                        "clip": clip,
                        "text": label["text"],
                        "tokens": tokens,
                        "frameIndices": indices,
                        "members": member_names,
                        "duration": duration,
                        "signStart": label["start"],
                        "signEnd": label["end"],
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                + "\n"
            )
            kept += 1
            token_total += len(tokens)
            frame_total += len(indices)

    print(
        json.dumps(
            {
                "split": args.split,
                "labels": len(labels),
                "clipsInKeypointManifest": len(max_frames),
                "keptClips": kept,
                "unsupportedClips": unsupported,
                "missingOrEmptyKeypointClips": missing,
                "tokens": token_total,
                "selectedFrames": frame_total,
                "minFrames": args.min_frames,
                "maxFrames": args.max_frames,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
