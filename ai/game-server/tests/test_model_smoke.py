from __future__ import annotations

import unittest

import numpy as np

from app.feature_adapter import FEATURE_SIZE_V2, FEATURE_SIZE_V3
from app.model_adapter import LABELS, EnsembleModelAdapter, create_model_runner


class EnsembleModelSmokeTests(unittest.TestCase):
    def test_ensemble_contract_and_prediction(self) -> None:
        # Gate off: this covers the raw ensemble output, which is a probability
        # distribution. The gate deliberately breaks normalisation and is
        # covered by DecisionMarginGateTests.
        adapter = EnsembleModelAdapter(minimum_margin=0.0)

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


class DecisionMarginGateTests(unittest.TestCase):
    """A sloppy handshape sits between two jamo, so its runner-up stays high.

    The gate must suppress the reported confidence in that case while keeping the
    argmax label, and must leave a decisive prediction untouched.
    """

    def _adapter(self, margin: float = 0.25) -> EnsembleModelAdapter:
        return EnsembleModelAdapter(minimum_margin=margin)

    def test_decisive_prediction_passes_through(self) -> None:
        adapter = self._adapter()
        probabilities = np.zeros(31, dtype=np.float32)
        probabilities[6] = 0.90   # ㅅ
        probabilities[21] = 0.05  # ㅠ
        gated = adapter._apply_margin_gate(probabilities)
        np.testing.assert_allclose(gated, probabilities)

    def test_ambiguous_prediction_is_suppressed_but_keeps_label(self) -> None:
        adapter = self._adapter()
        probabilities = np.zeros(31, dtype=np.float32)
        probabilities[6] = 0.48   # ㅅ
        probabilities[21] = 0.44  # ㅠ — only 0.04 behind
        gated = adapter._apply_margin_gate(probabilities)

        self.assertEqual(int(gated.argmax()), 6)
        self.assertLess(float(gated.max()), 0.5)
        self.assertLess(float(gated.max()), float(probabilities.max()))

    def test_gate_can_be_disabled(self) -> None:
        adapter = self._adapter(margin=0.0)
        probabilities = np.zeros(31, dtype=np.float32)
        probabilities[6] = 0.48
        probabilities[21] = 0.44
        np.testing.assert_allclose(adapter._apply_margin_gate(probabilities), probabilities)

    def test_default_margin_is_configured(self) -> None:
        self.assertAlmostEqual(self._adapter().minimum_margin, 0.25)
