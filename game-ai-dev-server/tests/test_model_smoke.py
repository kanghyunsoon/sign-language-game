from __future__ import annotations

import unittest

import numpy as np

from app.feature_adapter import FEATURE_SIZE
from app.model_adapter import LABELS, TFLiteModelAdapter, create_model_runner


class TFLiteModelSmokeTests(unittest.TestCase):
    def test_jamo_tflite_model_contract_and_prediction(self) -> None:
        adapter = TFLiteModelAdapter()

        self.assertEqual(adapter.contract.labels, LABELS)
        self.assertEqual(adapter.contract.sequence_length, 10)
        self.assertEqual(adapter.contract.feature_size, FEATURE_SIZE)
        self.assertEqual(adapter.contract.output_size, 31)

        output = adapter.predict(np.zeros((1, 10, FEATURE_SIZE), dtype=np.float32))
        self.assertEqual(output.shape, (31,))

    def test_baseline_is_default_and_exposes_jamo_labels(self) -> None:
        adapter = create_model_runner()
        self.assertIsInstance(adapter, TFLiteModelAdapter)
        self.assertEqual(adapter.contract.labels, LABELS)
        self.assertEqual(adapter.predict(np.zeros((1, 10, FEATURE_SIZE), dtype=np.float32)).shape, (31,))

    def test_baseline_can_be_selected_without_code_changes(self) -> None:
        self.assertIsInstance(create_model_runner("baseline"), TFLiteModelAdapter)
