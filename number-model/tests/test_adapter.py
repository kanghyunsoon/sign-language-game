from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from numbermodel.features import FEATURE_SIZE, Landmark, landmarks_to_feature
from numbermodel.adapter import (
    LABELS,
    MODEL_VERSION,
    NONE_LABEL,
    NUMBER_LABELS,
    NumberModelAdapter,
)


def sample_landmarks() -> tuple[Landmark, ...]:
    return tuple(
        Landmark(x=0.1 + index * 0.01, y=0.2 + index * 0.005, z=-0.01 * index)
        for index in range(21)
    )


def write_bundle(
    directory: Path,
    *,
    labels: list[str] | None = None,
    feature_version: str = "v3",
    feature_size: int = FEATURE_SIZE,
    frame_input: bool = True,
    corrupt_hash: bool = False,
    fitted_classes: list[int] | None = None,
) -> Path:
    """Write a minimal loadable bundle so contract checks run without training."""
    import joblib
    from sklearn.ensemble import ExtraTreesClassifier

    classes = fitted_classes if fitted_classes is not None else list(range(len(LABELS)))
    generator = np.random.default_rng(0)
    features = generator.normal(size=(len(classes) * 3, FEATURE_SIZE)).astype(np.float32)
    targets = np.repeat(np.asarray(classes), 3)
    model = ExtraTreesClassifier(n_estimators=3, random_state=0).fit(features, targets)

    directory.mkdir(parents=True, exist_ok=True)
    artifact_path = directory / "number-10.joblib"
    joblib.dump(model, artifact_path)
    digest = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    manifest = {
        "schemaVersion": 1,
        "modelVersion": MODEL_VERSION,
        "format": "sklearn-extra-trees",
        "artifact": artifact_path.name,
        "sha256": "0" * 64 if corrupt_hash else digest,
        "labels": labels if labels is not None else list(LABELS),
        "featureVersion": feature_version,
        "featureSize": feature_size,
        "frameInput": frame_input,
        "evaluation": "evaluation.json",
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return directory


class NumberLabelContractTests(unittest.TestCase):
    def test_labels_are_ten_numbers_then_none(self) -> None:
        self.assertEqual(NUMBER_LABELS, tuple(str(value) for value in range(1, 11)))
        self.assertEqual(LABELS, NUMBER_LABELS + (NONE_LABEL,))
        self.assertEqual(len(LABELS), 11)
        self.assertEqual(len(set(LABELS)), len(LABELS))

    def test_feature_v3_matches_the_adapter_input_size(self) -> None:
        feature = landmarks_to_feature(sample_landmarks(), "RIGHT")
        self.assertEqual(feature.shape, (FEATURE_SIZE,))
        self.assertEqual(FEATURE_SIZE, 78)
        self.assertTrue(np.isfinite(feature).all())

    def test_left_hand_is_mirrored_rather_than_rejected(self) -> None:
        landmarks = sample_landmarks()
        left = landmarks_to_feature(landmarks, "LEFT")
        right = landmarks_to_feature(landmarks, "RIGHT")
        self.assertEqual(left.shape, right.shape)
        self.assertFalse(np.allclose(left, right))


class NumberModelAdapterTests(unittest.TestCase):
    def test_loads_a_valid_bundle_and_returns_eleven_probabilities(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            adapter = NumberModelAdapter(write_bundle(Path(directory)))

            self.assertEqual(adapter.contract.labels, LABELS)
            self.assertEqual(adapter.contract.feature_size, FEATURE_SIZE)
            self.assertEqual(adapter.contract.feature_version, "v3")
            self.assertEqual(adapter.contract.output_size, 11)

            probabilities = adapter.predict_frame(sample_landmarks())
            self.assertEqual(probabilities.shape, (11,))
            self.assertAlmostEqual(float(probabilities.sum()), 1.0, places=5)
            self.assertTrue((probabilities >= 0).all())

    def test_batch_and_single_feature_paths_agree(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            adapter = NumberModelAdapter(write_bundle(Path(directory)))
            feature = landmarks_to_feature(sample_landmarks(), "RIGHT")

            single = adapter.predict_feature(feature)
            batch = adapter.predict_features(np.stack([feature, feature]))

            self.assertEqual(batch.shape, (2, 11))
            np.testing.assert_allclose(single, batch[0], rtol=1e-6)

    def test_top_candidates_are_ordered_and_named(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            adapter = NumberModelAdapter(write_bundle(Path(directory)))
            probabilities = adapter.predict_frame(sample_landmarks())

            candidates = adapter.top_candidates(probabilities, limit=3)

            self.assertEqual(len(candidates), 3)
            self.assertTrue(all(item["symbol"] in LABELS for item in candidates))
            confidences = [item["confidence"] for item in candidates]
            self.assertEqual(confidences, sorted(confidences, reverse=True))

    def test_rejects_a_tampered_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bundle = write_bundle(Path(directory), corrupt_hash=True)
            with self.assertRaises(ValueError):
                NumberModelAdapter(bundle)

    def test_rejects_labels_outside_the_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bundle = write_bundle(Path(directory), labels=[*NUMBER_LABELS, "0"])
            with self.assertRaises(ValueError):
                NumberModelAdapter(bundle)

    def test_rejects_a_non_v3_feature_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bundle = write_bundle(Path(directory), feature_version="v2", feature_size=55)
            with self.assertRaises(ValueError):
                NumberModelAdapter(bundle)

    def test_rejects_a_sequence_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bundle = write_bundle(Path(directory), frame_input=False)
            with self.assertRaises(ValueError):
                NumberModelAdapter(bundle)

    def test_rejects_a_model_whose_class_order_would_shuffle_probabilities(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            # A model fitted without every class emits fewer, differently ordered
            # columns; silently trusting it would mislabel predictions.
            bundle = write_bundle(Path(directory), fitted_classes=[0, 1, 2])
            with self.assertRaises(ValueError):
                NumberModelAdapter(bundle)


if __name__ == "__main__":
    unittest.main()
