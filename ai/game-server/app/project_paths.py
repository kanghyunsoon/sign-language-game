from __future__ import annotations

from pathlib import Path


def find_repository_root(start: Path = Path(__file__)) -> Path:
    """Find the checkout root without depending on this adapter's folder depth."""
    for candidate in start.resolve().parents:
        if (candidate / "models").is_dir() and (candidate / "game-contracts").is_dir():
            return candidate
    raise RuntimeError("Could not locate repository root containing models and game-contracts")


REPOSITORY_ROOT = find_repository_root()
