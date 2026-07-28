from __future__ import annotations

import unittest

import numpy as np

from app.feature_adapter import FEATURE_SIZE_V2, FEATURE_SIZE_V3
from app.model_adapter import LABELS, EnsembleModelAdapter, create_model_runner


class EnsembleModelSmokeTests(unittest.TestCase):
    def test_ensemble_contract_and_prediction(self) -> None:
        adapter = EnsembleModelAdapter()

        self.assertEqual(adapter.contract.labels, LABELS)
        self.assertEqual(adapter.contract.sequence_length, 10)
        self.assertEqual(adapter.contract.output_size, 31)
        self.assertEqual(adapter.feature_sizes, (FEATURE_SIZE_V2, FEATURE_SIZE_V3))

        output = adapter.predict_pair(
            np.zeros((1, 10, FEATURE_SIZE_V2), dtype=np.float32),
            np.zeros((1, 10, FEATURE_SIZE_V3), dtype=np.float32),
        )
        self.assertEqual(output.shape, (31,))
        self.assertAlmostEqual(float(output.sum()), 1.0, places=4)

    def test_default_runner_is_the_ensemble(self) -> None:
        adapter = create_model_runner()
        self.assertIsInstance(adapter, EnsembleModelAdapter)
        self.assertEqual(adapter.contract.labels, LABELS)

    def test_ensemble_can_be_selected_explicitly(self) -> None:
        self.assertIsInstance(create_model_runner("ensemble"), EnsembleModelAdapter)
