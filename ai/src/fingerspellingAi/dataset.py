"""Dataset discovery and immutable sample metadata.""";

from dataclasses import dataclass;
from pathlib import Path;
import re;

from .config import DatasetConfig;
from .labels import LabelDefinition;


SPLIT_ALIASES = {"train": "train", "valid": "validation", "validation": "validation", "test": "test"};
PARTICIPANT_PATTERN = re.compile(r"^p-[a-z0-9-]+$");


@dataclass(frozen=True)
class ImageSample:
    path: Path;
    relativePath: str;
    split: str;
    labelId: str;
    classIndex: int;
    source: str;
    participantId: str | None;
    groupId: str;


def discoverSamples(
    inputRoot: Path,
    labels: list[LabelDefinition],
    config: DatasetConfig,
) -> tuple[list[ImageSample], list[str]]:
    if not inputRoot.is_dir():
        raise FileNotFoundError(f"Dataset root does not exist: {inputRoot}");

    labelToIndex = {label.id: index for index, label in enumerate(labels)};
    samples: list[ImageSample] = [];
    warnings: list[str] = [];
    expectedInputSplits = {"train", "valid", "validation", "test"};
    unknownDirectories = sorted(
        path.name
        for path in inputRoot.iterdir()
        if path.is_dir() and path.name.lower() not in expectedInputSplits
    );
    if unknownDirectories:
        warnings.append(f"Ignored unknown dataset directories: {', '.join(unknownDirectories)}");

    for inputSplit in ("train", "valid", "validation", "test"):
        splitPath = inputRoot / inputSplit;
        if not splitPath.is_dir():
            continue;
        split = SPLIT_ALIASES[inputSplit];
        for labelPath in sorted(path for path in splitPath.iterdir() if path.is_dir()):
            if labelPath.name not in labelToIndex:
                raise ValueError(f"Unknown label directory: {labelPath}");
            for imagePath in sorted(path for path in labelPath.rglob("*") if path.is_file()):
                if imagePath.suffix.lower() not in config.imageExtensions:
                    continue;
                participantId, source, groupId = parseSampleIdentity(imagePath);
                samples.append(
                    ImageSample(
                        path=imagePath,
                        relativePath=imagePath.relative_to(inputRoot).as_posix(),
                        split=split,
                        labelId=labelPath.name,
                        classIndex=labelToIndex[labelPath.name],
                        source=source,
                        participantId=participantId,
                        groupId=groupId,
                    ),
                );

    if not samples:
        raise ValueError(f"No supported images found below: {inputRoot}");
    _validateParticipantSplits(samples);
    return samples, warnings;


def parseSampleIdentity(imagePath: Path) -> tuple[str | None, str, str]:
    tokens = imagePath.stem.lower().split("__");
    identityToken = tokens[2] if len(tokens) >= 3 else imagePath.stem.lower();
    if PARTICIPANT_PATTERN.fullmatch(identityToken):
        return identityToken, "team-capture", identityToken;
    scopedGroupId = f"{imagePath.parent.name}:{identityToken}";
    if identityToken.startswith("src-"):
        return None, "public-dataset", scopedGroupId;
    if identityToken.startswith("local-"):
        return None, "team-capture-legacy", scopedGroupId;
    return None, "unknown", scopedGroupId;


def _validateParticipantSplits(samples: list[ImageSample]) -> None:
    participantSplits: dict[str, set[str]] = {};
    for sample in samples:
        if sample.participantId is None:
            continue;
        participantSplits.setdefault(sample.participantId, set()).add(sample.split);
    leakedParticipants = {
        participantId: sorted(splits)
        for participantId, splits in participantSplits.items()
        if len(splits) > 1
    };
    if leakedParticipants:
        raise ValueError(f"Participants must not span multiple splits: {leakedParticipants}");
