"""WebSocket server for the number-only model.

`number-model` contains a hyphen, so it can never be a Python package name and
the sibling `numbermodel` package cannot be reached with a relative import.
Putting the folder on `sys.path` here means every module in this package can use
plain `from numbermodel... import ...` and the run command stays short.

Run from the `number-model` directory:

    python -m server.main
"""

from __future__ import annotations

from pathlib import Path
import sys

NUMBER_MODEL_ROOT = Path(__file__).resolve().parents[1]
if str(NUMBER_MODEL_ROOT) not in sys.path:
    sys.path.insert(0, str(NUMBER_MODEL_ROOT))
