#!/usr/bin/env python3
"""Create a compact per-clip manifest from an AIHub CROWD keypoint ZIP.

The sequence manifest builder only needs each clip's directory and largest frame
index.  Storing every frame name would create hundreds of megabytes of text, so
this tool writes one actual ZIP member name per clip without extracting raw data.
"""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from collections import Counter
from pathlib import Path


FRAME_RE = re.compile(
    r"^(?:keypoint|0[12]_crowd_keypoint)/(?P<signer>\d+)/(?P<clip>[^/]+)/"
    r"[^/]+_(?P<frame>\d+)_keypoints\.json$"
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    latest: dict[str, tuple[int, str, str]] = {}
    unmatched_json = 0
    with zipfile.ZipFile(args.archive) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            match = FRAME_RE.match(member.filename)
            if match is None:
                unmatched_json += int(member.filename.endswith(".json"))
                continue
            clip = match.group("clip")
            candidate = (int(match.group("frame")), member.filename, match.group("signer"))
            if clip not in latest or candidate[0] > latest[clip][0]:
                latest[clip] = candidate

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as stream:
        for clip in sorted(latest):
            stream.write(latest[clip][1] + "\n")

    by_signer = Counter(signer for _, _, signer in latest.values())
    print(
        json.dumps(
            {
                "archive": str(args.archive),
                "clips": len(latest),
                "clipsBySigner": dict(sorted(by_signer.items())),
                "unmatchedJsonEntries": unmatched_json,
                "output": str(args.output),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
