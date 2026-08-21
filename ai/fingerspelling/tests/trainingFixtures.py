import json;
from pathlib import Path;

import numpy as np;

from fingerspellingAi.config import calculateJsonSha256, calculateSha256, loadPreprocessingConfig;
from fingerspellingAi.labels import loadModelLabels;


def writeSyntheticDataset(
    datasetRoot: Path,
    labelsPath: Path,
    preprocessingConfigPath: Path,
    trainSamplesPerClass: int = 3,
) -> None:
    labels = loadModelLabels(labelsPath);
    classIds = [label.id for label in labels];
    features = [];
    labelIndices = [];
    labelIds = [];
    sampleIds = [];
    participantIds = [];
    groupIds = [];
    splits = [];
    sources = [];
    splitCounts = {"train": 0, "validation": 0, "test": 0};
    labelCounts = {classId: 0 for classId in classIds};
    trainLabelCounts = {classId: 0 for classId in classIds};
    for split in splitCounts:
        sampleCount = trainSamplesPerClass if split == "train" else 1;
        for classIndex, classId in enumerate(classIds):
            for sampleIndex in range(sampleCount):
                feature = np.zeros(63, dtype=np.float32);
                feature[classIndex] = 2.0;
                feature[32 + classIndex % 31] = float(sampleIndex) * 0.01;
                features.append(feature);
                labelIndices.append(classIndex);
                labelIds.append(classId);
                sampleIds.append(f"{split}-{classId}-{sampleIndex}");
                participantIds.append(f"p-{split}-{sampleIndex}");
                groupIds.append(f"g-{split}-{classId}-{sampleIndex}");
                splits.append(split);
                sources.append("synthetic-test");
                splitCounts[split] += 1;
                labelCounts[classId] += 1;
                if split == "train":
                    trainLabelCounts[classId] += 1;

    processedPath = datasetRoot / "processed" / "frames.npz";
    processedPath.parent.mkdir(parents=True);
    np.savez_compressed(
        processedPath,
        features=np.stack(features).astype(np.float32),
        labelIndices=np.asarray(labelIndices, dtype=np.int64),
        labelIds=np.asarray(labelIds),
        sampleIds=np.asarray(sampleIds),
        participantIds=np.asarray(participantIds),
        groupIds=np.asarray(groupIds),
        splits=np.asarray(splits),
        sources=np.asarray(sources),
        classIds=np.asarray(classIds),
    );
    preprocessingConfig = loadPreprocessingConfig(preprocessingConfigPath);
    manifest = {
        "schemaVersion": "1.0.0",
        "datasetVersion": "synthetic-v1",
        "acceptedSampleCount": len(features),
        "featureShape": [len(features), 63],
        "classCount": len(classIds),
        "classIds": classIds,
        "acceptedBySplit": splitCounts,
        "acceptedByLabel": labelCounts,
        "acceptedTrainByLabel": trainLabelCounts,
        "artifacts": {"processedDataset": "processed/frames.npz"},
        "identity": {
            "labelsSha256": calculateSha256(labelsPath),
            "preprocessingConfigSha256": calculateSha256(preprocessingConfigPath),
            "labelsCanonicalSha256": calculateJsonSha256(labelsPath),
            "preprocessingConfigCanonicalSha256": calculateJsonSha256(preprocessingConfigPath),
            "mediaPipeModelSha256": "test-model",
        },
        "normalization": {
            "originLandmarkIndex": preprocessingConfig.normalization.originLandmarkIndex,
            "scaleLandmarkIndices": list(preprocessingConfig.normalization.scaleLandmarkIndices),
            "canonicalHandedness": preprocessingConfig.normalization.canonicalHandedness,
            "scaleEpsilon": preprocessingConfig.normalization.scaleEpsilon,
            "applyRotationNormalization": preprocessingConfig.normalization.applyRotationNormalization,
        },
    };
    (datasetRoot / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    );


def writeFastTrainingConfig(sourcePath: Path, targetPath: Path) -> None:
    payload = json.loads(sourcePath.read_text(encoding="utf-8"));
    payload["model"]["hiddenSizes"] = [32];
    payload["model"]["dropout"] = 0.0;
    payload["optimization"]["epochs"] = 2;
    payload["optimization"]["batchSize"] = 64;
    payload["earlyStopping"]["patience"] = 2;
    payload["calibration"]["minimumValidationSamplesPerClass"] = 1;
    targetPath.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8");
