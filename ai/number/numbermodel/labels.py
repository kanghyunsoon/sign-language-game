"""Label contract for the number-only model.

Deliberately free of imports and filesystem lookups. Feature extraction runs on
machines that hold the raw images but not a full repository checkout, so the
label contract has to be usable without `project_paths`, which resolves the
checkout root by looking for `models/` and `ai/contracts/`.

`number_adapter` re-exports these names, so importing either module gives the
same contract.
"""

from __future__ import annotations


MODEL_VERSION = "number-10-v1"
FEATURE_VERSION = "v3"
NONE_LABEL = "none"

# Sign numbers 1..10. There is no `0`: the KSL source has no zero, and
# model-evaluation.md T-141 corrected the earlier reading of the image track's
# `NUM_0` as digit zero when it is in fact 10.
NUMBER_LABELS = tuple(str(value) for value in range(1, 11))
LABELS = NUMBER_LABELS + (NONE_LABEL,)

# Positions in LABELS, shared so runtime and training index the same columns.
# Plain tuples rather than arrays keep this module free of numpy.
LABEL_INDEX: dict[str, int] = {label: index for index, label in enumerate(LABELS)}
NUMBER_INDEXES: tuple[int, ...] = tuple(LABEL_INDEX[label] for label in NUMBER_LABELS)
NONE_INDEX: int = LABEL_INDEX[NONE_LABEL]

# Source folder name -> canonical label. `10` is captured as two hand-shape
# variants that the class spec treats as one symbol.
SOURCE_LABEL_MAP: dict[str, str] = (
    {name: name for name in NUMBER_LABELS}
    | {"10-1": "10", "10-2": "10"}
    | {name: NONE_LABEL for name in (NONE_LABEL, "ood", "background")}
)
