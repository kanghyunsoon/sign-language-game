from __future__ import annotations

import unittest

from app.project_paths import REPOSITORY_ROOT


class ProjectPathTests(unittest.TestCase):
    def test_finds_models_and_contracts_from_the_new_top_level_location(self) -> None:
        self.assertTrue((REPOSITORY_ROOT / "models").is_dir())
        self.assertTrue((REPOSITORY_ROOT / "game-contracts").is_dir())


if __name__ == "__main__":
    unittest.main()
