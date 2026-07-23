from __future__ import annotations

import unittest

import numpy as np

from app.model_adapter import EXPANDED_LABELS, LABELS, HybridModelAdapter, TFLiteModelAdapter, TreeModelAdapter, create_model_runner


class TFLiteModelSmokeTests(unittest.TestCase):
    def test_existing_tflite_model_contract_and_prediction(self) -> None:
        adapter = TFLiteModelAdapter()

        self.assertEqual(adapter.contract.labels, LABELS)
        self.assertEqual(adapter.contract.sequence_length, 10)
        self.assertEqual(adapter.contract.feature_size, 55)
        self.assertEqual(adapter.contract.output_size, 31)

        output = adapter.predict(np.zeros((1, 10, 55), dtype=np.float32))
        self.assertEqual(output.shape, (31,))

    def test_tree_model_contract_and_prediction(self) -> None:
        adapter = TreeModelAdapter()
        output = adapter.predict(np.zeros((1, 10, 55), dtype=np.float32))
        self.assertEqual(adapter.contract.labels, EXPANDED_LABELS)
        self.assertEqual(output.shape, (41,))
        self.assertAlmostEqual(float(output.sum()), 1.0, places=5)

    def test_hybrid_is_default_and_exposes_all_labels(self) -> None:
        adapter = create_model_runner()
        self.assertIsInstance(adapter, HybridModelAdapter)
        self.assertEqual(adapter.contract.labels, EXPANDED_LABELS)
        self.assertEqual(adapter.predict(np.zeros((1, 10, 55), dtype=np.float32)).shape, (41,))

    def test_baseline_can_be_selected_without_code_changes(self) -> None:
        self.assertIsInstance(create_model_runner("baseline"), TFLiteModelAdapter)
