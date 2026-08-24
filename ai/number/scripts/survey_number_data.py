"""Report which number-model inputs actually exist on a machine.

The recognition documents name several data locations, but they were written
across different PCs and a GPU server, so a path being documented says nothing
about it still being there. Run this before planning any extraction round.

Standard library only, so it runs on a bare server with no virtualenv. It reads
directories and hashes files; it never writes, moves, or deletes anything.

Remote use without copying the file first:

    ssh <host> 'python3 -' < ai/game-server/scripts/survey_number_data.py

Local use:

    python3 ai/game-server/scripts/survey_number_data.py --root <extra path>

Output is JSON on stdout, so the result can be pasted back verbatim.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".heic", ".webp", ".bmp"}
PROVIDER_SPLIT_NAMES = {"train", "valid", "validation", "test"}
NUMBER_FOLDER_NAMES = {str(value) for value in range(1, 11)} | {"10-1", "10-2", "none"}

# Locations the recognition documents refer to, relative to the home directory
# unless absolute. Missing entries are reported rather than skipped, because
# "documented but gone" is exactly what this survey is meant to surface.
CANDIDATE_ROOTS = (
    "sign_language_training",
    "sign_language_training/data",
    "sign_language_training/data/ksl-numbers",
    "sign_language_training/data/roboflow",
    "sign_language_training/data/roboflow/sign-language-v1",
    "sign_language_training/data/roboflow/artifacts",
    "sign_language_training/data/oss",
    "sign_language_training/code-v3/outputs",
    "AITraining/korean-fingerspelling",
    "AITraining/korean-fingerspelling/aihub-103",
    "AITraining/korean-fingerspelling/roboflow-v1",
    "AITraining/number-model",
    "C:/AITraining/korean-fingerspelling",
    "C:/AITraining/number-model",
)

PROBE_MODULES = ("numpy", "sklearn", "joblib", "mediapipe", "PIL", "pillow_heif", "torch")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Survey number-model data availability.")
    parser.add_argument("--root", action="append", default=[], help="Extra path to inspect; repeatable")
    parser.add_argument("--max-files", type=int, default=200_000, help="Stop counting a root past this many files")
    parser.add_argument("--label-limit", type=int, default=40, help="Most label folders to list per root")
    return parser.parse_args()


def guess_layout(relatives: list[Path]) -> str:
    """Infer the folder convention the extractor would need."""
    if not relatives:
        return "empty"
    first = {item.parts[0] for item in relatives if len(item.parts) >= 2}
    second = {item.parts[1] for item in relatives if len(item.parts) >= 3}
    if first and first <= PROVIDER_SPLIT_NAMES:
        return "provider"
    if second & NUMBER_FOLDER_NAMES:
        return "participant"
    if first & NUMBER_FOLDER_NAMES:
        return "flat-by-label"
    return "unknown"


def inspect_root(root: Path, max_files: int, label_limit: int) -> dict[str, object]:
    if not root.exists():
        return {"path": str(root), "exists": False}
    if root.is_file():
        return {"path": str(root), "exists": True, "kind": "file", "bytes": root.stat().st_size}

    images: list[Path] = []
    archives: list[dict[str, object]] = []
    arrays: list[dict[str, object]] = []
    truncated = False
    seen = 0
    for current, directories, filenames in os.walk(root):
        directories[:] = [name for name in directories if name not in {".git", "__pycache__", ".venv"}]
        for filename in filenames:
            seen += 1
            if seen > max_files:
                truncated = True
                break
            path = Path(current) / filename
            suffix = path.suffix.lower()
            try:
                size = path.stat().st_size
            except OSError:
                continue
            if suffix in IMAGE_SUFFIXES:
                images.append(path.relative_to(root))
            elif suffix in {".zip", ".tar", ".gz"}:
                archives.append({"path": str(path.relative_to(root)), "bytes": size})
            elif suffix in {".npz", ".npy", ".joblib", ".pt", ".tflite", ".h5"}:
                arrays.append({"path": str(path.relative_to(root)), "bytes": size})
        if truncated:
            break

    by_extension: dict[str, int] = {}
    for item in images:
        by_extension[item.suffix.lower()] = by_extension.get(item.suffix.lower(), 0) + 1

    label_counts: dict[str, int] = {}
    layout = guess_layout(images)
    for item in images:
        parts = item.parts
        if len(parts) < 2:
            key = "(root)"
        elif layout in {"provider", "participant"}:
            # Both conventions put the label one level below a grouping folder.
            key = "/".join(parts[:2])
        else:
            key = parts[0]
        label_counts[key] = label_counts.get(key, 0) + 1

    ordered = sorted(label_counts.items(), key=lambda pair: (-pair[1], pair[0]))
    return {
        "path": str(root),
        "exists": True,
        "kind": "directory",
        "imageCount": len(images),
        "byExtension": by_extension,
        "layoutGuess": layout,
        "labelFolders": dict(ordered[:label_limit]),
        "labelFolderCount": len(ordered),
        "archives": sorted(archives, key=lambda item: -int(item["bytes"]))[:15],
        "modelOrArrayFiles": sorted(arrays, key=lambda item: -int(item["bytes"]))[:15],
        "scanTruncated": truncated,
    }


def find_landmarkers(bases: list[Path], max_hits: int = 5) -> list[dict[str, object]]:
    hits: list[dict[str, object]] = []
    for base in bases:
        if not base.is_dir():
            continue
        for current, directories, filenames in os.walk(base):
            directories[:] = [name for name in directories if name not in {".git", "__pycache__", ".venv"}]
            if "hand_landmarker.task" in filenames:
                path = Path(current) / "hand_landmarker.task"
                digest = hashlib.sha256()
                try:
                    with path.open("rb") as stream:
                        for block in iter(lambda: stream.read(1024 * 1024), b""):
                            digest.update(block)
                    hits.append({"path": str(path), "bytes": path.stat().st_size, "sha256": digest.hexdigest()})
                except OSError:
                    continue
                if len(hits) >= max_hits:
                    return hits
    return hits


def probe_interpreters() -> list[dict[str, object]]:
    """Report interpreters and which packages an extraction round would need."""
    candidates: list[Path] = []
    for name in ("python3", "python"):
        found = shutil.which(name)
        if found:
            candidates.append(Path(found))
    home = Path.home()
    for pattern in ("*/.venv/bin/python", ".venv/bin/python", "*/venv/bin/python", "*/.venv/Scripts/python.exe"):
        candidates.extend(sorted(home.glob(pattern))[:5])

    seen: set[str] = set()
    reports: list[dict[str, object]] = []
    for candidate in candidates:
        key = str(candidate)
        if key in seen or not candidate.exists():
            continue
        seen.add(key)
        script = (
            "import json,sys;"
            "mods={};"
            f"names={list(PROBE_MODULES)!r};"
            "\nfor n in names:\n"
            "    try:\n"
            "        m=__import__(n); mods[n]=getattr(m,'__version__','present')\n"
            "    except Exception as e:\n"
            "        mods[n]=None\n"
            "print(json.dumps({'version': sys.version.split()[0], 'packages': mods}))"
        )
        try:
            output = subprocess.run(
                [str(candidate), "-c", script], capture_output=True, text=True, timeout=90, check=False,
            )
            if output.stdout.strip():
                payload = json.loads(output.stdout.strip().splitlines()[-1])
            else:
                # Windows ships a Store stub named python.exe that prints nothing
                # and exits non-zero. Say so instead of reporting an empty result.
                detail = output.stderr.strip().splitlines()[-1] if output.stderr.strip() else "no output"
                payload = {"error": f"exit {output.returncode}: {detail}", "usable": False}
        except Exception as error:  # a broken interpreter is a finding, not a crash
            payload = {"error": f"{type(error).__name__}: {error}", "usable": False}
        reports.append({"interpreter": key} | payload)
    return reports


def git_checkouts(bases: list[Path]) -> list[dict[str, object]]:
    reports: list[dict[str, object]] = []
    for base in bases:
        if not (base / ".git").exists():
            continue
        def run(*arguments: str) -> str:
            try:
                result = subprocess.run(
                    ["git", "-C", str(base), *arguments], capture_output=True, text=True, timeout=30, check=False,
                )
                return result.stdout.strip()
            except Exception:
                return ""
        reports.append(
            {
                "path": str(base),
                "branch": run("rev-parse", "--abbrev-ref", "HEAD"),
                "commit": run("rev-parse", "--short", "HEAD"),
                "remote": run("config", "--get", "remote.origin.url"),
                "dirty": bool(run("status", "--porcelain")),
            },
        )
    return reports


def main() -> None:
    args = parse_args()
    home = Path.home()
    roots: list[Path] = []
    for entry in [*CANDIDATE_ROOTS, *args.root]:
        path = Path(entry)
        roots.append(path if path.is_absolute() else home / path)

    seen: set[str] = set()
    unique_roots = [root for root in roots if not (str(root) in seen or seen.add(str(root)))]
    search_bases = [path for path in (home / "sign_language_training", home / "AITraining", Path("C:/AITraining")) if path.is_dir()]

    survey = {
        "host": platform.node(),
        "platform": platform.platform(),
        "home": str(home),
        "surveyVersion": 1,
        "roots": [inspect_root(root, args.max_files, args.label_limit) for root in unique_roots],
        "handLandmarkers": find_landmarkers(search_bases + [home / "sign_language_training"]),
        "interpreters": probe_interpreters(),
        "gitCheckouts": git_checkouts([home / "sign_language_training", *search_bases]),
    }
    present = [item for item in survey["roots"] if item.get("exists")]
    survey["summary"] = {
        "rootsChecked": len(unique_roots),
        "rootsPresent": len(present),
        "totalImagesFound": sum(int(item.get("imageCount", 0)) for item in present),
        "numberLikeRoots": [
            item["path"]
            for item in present
            if any(Path(name).name in NUMBER_FOLDER_NAMES for name in item.get("labelFolders", {}))
        ],
    }
    json.dump(survey, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
