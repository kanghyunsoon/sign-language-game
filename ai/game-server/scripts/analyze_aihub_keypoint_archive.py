#!/usr/bin/env python3
"""Audit an AI Hub sign-language keypoint ZIP without extracting its files."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
import zipfile
from collections import Counter
from pathlib import Path


FRAME_RE = re.compile(
    r"^(?:keypoint|0[12]_crowd_keypoint)/(?P<signer>\d+)/(?P<clip>[^/]+)/[^/]+_(?P<frame>\d+)_keypoints\.json$"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def percentile(values: list[int], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def hand_quality(values: list[float], confidence: float) -> dict[str, float | int | bool]:
    scores = [float(values[index]) for index in range(2, len(values), 3)]
    visible = sum(score >= confidence for score in scores)
    return {
        "points": len(scores),
        "visiblePoints": visible,
        "meanConfidence": statistics.fmean(scores) if scores else 0.0,
        "usable": visible >= 15,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--sample-stride", type=int, default=30)
    parser.add_argument("--confidence", type=float, default=0.20)
    args = parser.parse_args()
    if args.sample_stride < 1:
        parser.error("--sample-stride must be at least 1")

    if args.archive.suffix.lower() == ".txt":
        clip_frames: Counter[str] = Counter()
        signer_frames: Counter[str] = Counter()
        signer_clips: dict[str, set[str]] = {}
        entries = 0
        with args.archive.open("r", encoding="utf-8", errors="replace") as stream:
            for raw_line in stream:
                entries += 1
                match = FRAME_RE.match(raw_line.strip())
                if not match:
                    continue
                signer = match.group("signer"); clip = match.group("clip")
                clip_frames[clip] += 1; signer_frames[signer] += 1
                signer_clips.setdefault(signer, set()).add(clip)
        frames_per_clip = list(clip_frames.values())
        report = {
            "manifest": str(args.archive), "manifestBytes": args.archive.stat().st_size, "manifestSha256": sha256(args.archive),
            "fileEntries": entries, "jsonFrames": sum(clip_frames.values()), "clips": len(clip_frames),
            "signers": sorted(signer_frames), "signerFrames": dict(sorted(signer_frames.items())),
            "signerClips": {key: len(value) for key, value in sorted(signer_clips.items())},
            "framesPerClip": {"min": min(frames_per_clip) if frames_per_clip else None, "median": statistics.median(frames_per_clip) if frames_per_clip else None, "mean": statistics.fmean(frames_per_clip) if frames_per_clip else None, "p95": percentile(frames_per_clip, 0.95), "max": max(frames_per_clip) if frames_per_clip else None},
            "handAudit": {"status": "not-measured", "reason": "filename manifest contains no keypoint confidence values"},
            "limitations": ["Manifest mode audits filenames and clip/frame counts only.", "Use the ZIP input mode for sampled hand-confidence quality."],
        }
        rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(rendered, encoding="utf-8")
        print(rendered, end="")
        return

    clip_frames: Counter[str] = Counter()
    signer_frames: Counter[str] = Counter()
    signer_clips: dict[str, set[str]] = {}
    malformed: list[str] = []
    sampled = Counter()
    sampled_confidence = {"left": [], "right": []}

    with zipfile.ZipFile(args.archive) as archive:
        members = [item for item in archive.infolist() if not item.is_dir()]
        json_members = []
        for member in members:
            match = FRAME_RE.match(member.filename)
            if not match:
                if member.filename.endswith(".json") and len(malformed) < 20:
                    malformed.append(member.filename)
                continue
            json_members.append((member, match))
            signer = match.group("signer")
            clip = match.group("clip")
            clip_frames[clip] += 1
            signer_frames[signer] += 1
            signer_clips.setdefault(signer, set()).add(clip)

        for index, (member, _match) in enumerate(json_members):
            if index % args.sample_stride:
                continue
            payload = json.loads(archive.read(member))
            people = payload.get("people") or {}
            left = hand_quality(people.get("hand_left_keypoints_2d") or [], args.confidence)
            right = hand_quality(people.get("hand_right_keypoints_2d") or [], args.confidence)
            sampled["frames"] += 1
            sampled["leftUsable"] += int(left["usable"])
            sampled["rightUsable"] += int(right["usable"])
            sampled["bothUsable"] += int(left["usable"] and right["usable"])
            sampled["neitherUsable"] += int(not left["usable"] and not right["usable"])
            sampled_confidence["left"].append(float(left["meanConfidence"]))
            sampled_confidence["right"].append(float(right["meanConfidence"]))

    frames_per_clip = list(clip_frames.values())
    sample_count = sampled["frames"]
    report = {
        "archive": str(args.archive),
        "archiveBytes": args.archive.stat().st_size,
        "archiveSha256": sha256(args.archive),
        "fileEntries": len(members),
        "jsonFrames": sum(clip_frames.values()),
        "clips": len(clip_frames),
        "signers": sorted(signer_frames),
        "signerFrames": dict(sorted(signer_frames.items())),
        "signerClips": {key: len(value) for key, value in sorted(signer_clips.items())},
        "framesPerClip": {
            "min": min(frames_per_clip) if frames_per_clip else None,
            "median": statistics.median(frames_per_clip) if frames_per_clip else None,
            "mean": statistics.fmean(frames_per_clip) if frames_per_clip else None,
            "p95": percentile(frames_per_clip, 0.95),
            "max": max(frames_per_clip) if frames_per_clip else None,
        },
        "handAudit": {
            "sampling": f"every {args.sample_stride}th archive frame",
            "sampledFrames": sample_count,
            "confidenceThreshold": args.confidence,
            "usableDefinition": "at least 15 of 21 hand points at or above threshold",
            "leftUsableRate": sampled["leftUsable"] / sample_count if sample_count else None,
            "rightUsableRate": sampled["rightUsable"] / sample_count if sample_count else None,
            "bothUsableRate": sampled["bothUsable"] / sample_count if sample_count else None,
            "neitherUsableRate": sampled["neitherUsable"] / sample_count if sample_count else None,
            "meanLeftConfidence": statistics.fmean(sampled_confidence["left"]) if sample_count else None,
            "meanRightConfidence": statistics.fmean(sampled_confidence["right"]) if sample_count else None,
        },
        "unmatchedJsonExamples": malformed,
        "limitations": [
            "Hand quality is sampled unless --sample-stride 1 is used.",
            "Usable-hand status is a confidence proxy, not a manual correctness label.",
            "Character boundaries require morpheme timing alignment or CTC training.",
        ],
    }
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    main()
