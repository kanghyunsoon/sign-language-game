from __future__ import annotations

from pathlib import Path


def find_ai_root(start: Path = Path(__file__)) -> Path:
    """Find the ai/ tree root without depending on this adapter's folder depth."""
    for candidate in start.resolve().parents:
        if (candidate / "models").is_dir() and (candidate / "contracts").is_dir():
            return candidate
    raise RuntimeError("Could not locate ai root containing models and contracts")


AI_ROOT = find_ai_root()
