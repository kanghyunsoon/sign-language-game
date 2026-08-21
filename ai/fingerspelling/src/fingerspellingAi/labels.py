"""Model label loading and validation.""";

from dataclasses import dataclass;
from pathlib import Path;

from .config import loadJson;


@dataclass(frozen=True)
class LabelDefinition:
    id: str;
    displayName: str;
    category: str;


def loadModelLabels(path: Path) -> list[LabelDefinition]:
    payload = loadJson(path);
    labelsById = {
        item["id"]: LabelDefinition(
            id=item["id"],
            displayName=item["displayName"],
            category=item["category"],
        )
        for item in payload["labels"]
    };
    jamoIds = payload["recognitionModes"]["jamo"];
    modelIds = [labelId for labelId in jamoIds if labelId != "transition"];

    if len(modelIds) != 32 or modelIds[0] != "none":
        raise ValueError("The jamo model must contain none followed by 31 fingerspelling labels.");
    if len(modelIds) != len(set(modelIds)):
        raise ValueError("Model label ids must be unique.");
    missingIds = [labelId for labelId in modelIds if labelId not in labelsById];
    if missingIds:
        raise ValueError(f"Unknown model label ids: {missingIds}");

    return [labelsById[labelId] for labelId in modelIds];
