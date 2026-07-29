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


def write_hybrid_bundle(directory: Path, *, wrong_composition: bool = False, missing_head: bool = False) -> Path:
    """Write a two-component bundle so gate/head loading can be checked."""
    import joblib
    from sklearn.ensemble import ExtraTreesClassifier
    from sklearn.neighbors import KNeighborsClassifier

    from numbermodel.adapter import COMPOSITION

    generator = np.random.default_rng(1)
    features = generator.normal(size=(len(LABELS) * 8, FEATURE_SIZE)).astype(np.float32)
    targets = np.tile(np.arange(len(LABELS)), 8)
    directory.mkdir(parents=True, exist_ok=True)

    components = []
    pieces = [("gate", "number-gate.joblib", ExtraTreesClassifier(n_estimators=3, random_state=0))]
    if not missing_head:
        pieces.append(("head", "number-head.joblib", KNeighborsClassifier(n_neighbors=3)))
    for role, filename, estimator in pieces:
        estimator.fit(features, targets)
        path = directory / filename
        joblib.dump(estimator, path)
        components.append(
            {
                "role": role,
                "artifact": filename,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "format": "sklearn-test",
            },
        )
    manifest = {
        "schemaVersion": 1,
        "modelVersion": MODEL_VERSION,
        "format": "hybrid-gate-head",
        "labels": list(LABELS),
        "featureVersion": "v3",
        "featureSize": FEATURE_SIZE,
        "frameInput": True,
        "components": components,
        "composition": "something else" if wrong_composition else COMPOSITION,
        "evaluation": "evaluation.json",
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return directory


class HybridBundleTests(unittest.TestCase):
    def test_loads_a_gate_and_head_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            adapter = NumberModelAdapter(write_hybrid_bundle(Path(directory)))

            self.assertTrue(adapter.is_hybrid)
            self.assertEqual(adapter.contract.labels, LABELS)

            probabilities = adapter.predict_frame(sample_landmarks())
            self.assertEqual(probabilities.shape, (11,))
            self.assertAlmostEqual(float(probabilities.sum()), 1.0, places=5)
            self.assertTrue((probabilities >= 0).all())

    def test_composition_matches_the_adapter_formula(self) -> None:
        """The stored formula is checked so a bundle cannot be scored one way and served another."""
        with tempfile.TemporaryDirectory() as directory:
            bundle = write_hybrid_bundle(Path(directory), wrong_composition=True)
            with self.assertRaises(ValueError):
                NumberModelAdapter(bundle)

    def test_rejects_a_bundle_missing_a_component(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bundle = write_hybrid_bundle(Path(directory), missing_head=True)
            with self.assertRaises(ValueError):
                NumberModelAdapter(bundle)

    def test_single_model_bundle_is_not_flagged_hybrid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            adapter = NumberModelAdapter(write_bundle(Path(directory)))
            self.assertFalse(adapter.is_hybrid)


class ComposeSoftTests(unittest.TestCase):
    def test_gate_owns_the_none_probability(self) -> None:
        from numbermodel.adapter import compose_soft
        from numbermodel.labels import NONE_INDEX, NUMBER_INDEXES

        gate = np.zeros((1, 11), dtype=np.float32)
        gate[0, NONE_INDEX] = 0.3
        gate[0, NUMBER_INDEXES[0]] = 0.7
        head = np.zeros((1, 11), dtype=np.float32)
        head[0, NUMBER_INDEXES[8]] = 1.0  # head is certain the digit is `9`

        out = compose_soft(gate, head)

        self.assertAlmostEqual(float(out[0, NONE_INDEX]), 0.3, places=6)
        self.assertAlmostEqual(float(out[0, NUMBER_INDEXES[8]]), 0.7, places=6)
        self.assertAlmostEqual(float(out.sum()), 1.0, places=5)

    def test_falls_back_to_the_gate_when_the_head_has_no_digit_mass(self) -> None:
        from numbermodel.adapter import compose_soft
        from numbermodel.labels import NONE_INDEX, NUMBER_INDEXES

        gate = np.zeros((1, 11), dtype=np.float32)
        gate[0, NONE_INDEX] = 0.2
        gate[0, NUMBER_INDEXES[3]] = 0.8
        head = np.zeros((1, 11), dtype=np.float32)
        head[0, NONE_INDEX] = 1.0

        out = compose_soft(gate, head)

        self.assertAlmostEqual(float(out[0, NUMBER_INDEXES[3]]), 0.8, places=6)
        self.assertAlmostEqual(float(out.sum()), 1.0, places=5)


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
