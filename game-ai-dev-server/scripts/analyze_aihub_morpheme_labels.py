"""Summarize AI Hub dataset 103 CROWD morpheme labels without copying raw data."""

from __future__ import annotations

import argparse
import collections
import json
import statistics
import unicodedata
from pathlib import Path


CHOSEONG = tuple("ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ")
JUNGSEONG = tuple("ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ")
JONGSEONG = ("", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ")
EXPANSIONS = {
    "ㄲ": ("ㄱ", "ㄱ"), "ㄸ": ("ㄷ", "ㄷ"), "ㅃ": ("ㅂ", "ㅂ"), "ㅆ": ("ㅅ", "ㅅ"), "ㅉ": ("ㅈ", "ㅈ"),
    "ㄳ": ("ㄱ", "ㅅ"), "ㄵ": ("ㄴ", "ㅈ"), "ㄶ": ("ㄴ", "ㅎ"), "ㄺ": ("ㄹ", "ㄱ"), "ㄻ": ("ㄹ", "ㅁ"),
    "ㄼ": ("ㄹ", "ㅂ"), "ㄽ": ("ㄹ", "ㅅ"), "ㄾ": ("ㄹ", "ㅌ"), "ㄿ": ("ㄹ", "ㅍ"), "ㅀ": ("ㄹ", "ㅎ"), "ㅄ": ("ㅂ", "ㅅ"),
    "ㅘ": ("ㅗ", "ㅏ"), "ㅙ": ("ㅗ", "ㅐ"), "ㅝ": ("ㅜ", "ㅓ"), "ㅞ": ("ㅜ", "ㅔ"),
}
TARGET_JAMO = set("ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣㅐㅒㅔㅖㅢㅚㅟ")


def normalized_tokens(text: str) -> tuple[list[str], list[str]]:
    tokens: list[str] = []
    unsupported: list[str] = []
    for character in text:
        codepoint = ord(character)
        raw_tokens: tuple[str, ...]
        if 0xAC00 <= codepoint <= 0xD7A3:
            offset = codepoint - 0xAC00
            raw_tokens = (CHOSEONG[offset // 588], JUNGSEONG[(offset % 588) // 28], JONGSEONG[offset % 28])
        elif character in TARGET_JAMO:
            raw_tokens = (character,)
        elif character.isdigit():
            tokens.append(f"NUM_{character}")
            continue
        elif character.isspace() or unicodedata.category(character).startswith("P"):
            continue
        else:
            unsupported.append(character)
            continue
        for token in raw_tokens:
            if not token:
                continue
            expanded = EXPANSIONS.get(token, (token,))
            if all(part in TARGET_JAMO for part in expanded):
                tokens.extend(expanded)
            else:
                unsupported.append(token)
    return tokens, unsupported


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-root", type=Path, required=True)
    parser.add_argument("--validation-root", type=Path, required=True)
    return parser.parse_args()


def percentile(values: list[int], fraction: float) -> int:
    return sorted(values)[int(fraction * (len(values) - 1))]


def main() -> None:
    args = parse_args()
    rows: list[dict[str, object]] = []
    for split, root in (("train", args.train_root), ("validation", args.validation_root)):
        for path in root.rglob("*.json"):
            payload = json.loads(path.read_text(encoding="utf-8"))
            segment = payload["data"][0]
            rows.append(
                {
                    "split": split,
                    "signer": path.parent.name,
                    "text": segment["attributes"][0]["name"],
                    "clipSeconds": float(payload["metaData"]["duration"]),
                    "signedSeconds": float(segment["end"]) - float(segment["start"]),
                }
            )

    summary: dict[str, object] = {}
    for split in ("train", "validation"):
        part = [row for row in rows if row["split"] == split]
        lengths = [len(str(row["text"])) for row in part]
        clip_seconds = [float(row["clipSeconds"]) for row in part]
        signed_seconds = [float(row["signedSeconds"]) for row in part]
        summary[split] = {
            "clips": len(part),
            "signers": len({str(row["signer"]) for row in part}),
            "uniqueLabels": len({str(row["text"]) for row in part}),
            "characters": sum(lengths),
            "averageLabelLength": statistics.mean(lengths),
            "medianLabelLength": statistics.median(lengths),
            "p95LabelLength": percentile(lengths, 0.95),
            "averageClipSeconds": statistics.mean(clip_seconds),
            "averageSignedSeconds": statistics.mean(signed_seconds),
            "clipsBySigner": dict(sorted(collections.Counter(str(row["signer"]) for row in part).items())),
        }

    character_counts = collections.Counter(character for row in rows for character in str(row["text"]))
    label_counts = collections.Counter(str(row["text"]) for row in rows)
    token_counts: collections.Counter[str] = collections.Counter()
    unsupported_counts: collections.Counter[str] = collections.Counter()
    labels_with_unsupported = 0
    for row in rows:
        tokens, unsupported = normalized_tokens(str(row["text"]))
        token_counts.update(tokens)
        unsupported_counts.update(unsupported)
        labels_with_unsupported += bool(unsupported)
    summary["all"] = {
        "clips": len(rows),
        "uniqueLabels": len(label_counts),
        "distinctCharacters": len(character_counts),
        "topCharacters": character_counts.most_common(50),
        "topLabels": label_counts.most_common(30),
        "normalizedTargetTokens": sum(token_counts.values()),
        "normalizedTokenCounts": dict(sorted(token_counts.items())),
        "labelsWithUnsupportedCharacters": labels_with_unsupported,
        "unsupportedCharacterCounts": unsupported_counts.most_common(),
    }
    # ASCII escapes keep Korean labels intact in Windows/remote terminals with an unknown code page.
    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
