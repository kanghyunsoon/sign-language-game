"""PyTorch model used for single-frame fingerspelling classification.""";

from collections.abc import Sequence;

import torch;
from torch import nn;


class FingerspellingMlp(nn.Module):
    def __init__(
        self,
        inputSize: int,
        hiddenSizes: Sequence[int],
        classCount: int,
        dropout: float,
        featureMean: torch.Tensor | None = None,
        featureStd: torch.Tensor | None = None,
    ) -> None:
        super().__init__();
        mean = torch.zeros(inputSize, dtype=torch.float32) if featureMean is None else featureMean.float();
        std = torch.ones(inputSize, dtype=torch.float32) if featureStd is None else featureStd.float();
        if mean.shape != (inputSize,) or std.shape != (inputSize,):
            raise ValueError("Feature normalization vectors must match the model input size.");
        self.register_buffer("featureMean", mean);
        self.register_buffer("featureStd", std);

        layers: list[nn.Module] = [];
        previousSize = inputSize;
        for hiddenSize in hiddenSizes:
            layers.extend(
                [
                    nn.Linear(previousSize, hiddenSize),
                    nn.LayerNorm(hiddenSize),
                    nn.ReLU(),
                    nn.Dropout(dropout),
                ],
            );
            previousSize = hiddenSize;
        layers.append(nn.Linear(previousSize, classCount));
        self.network = nn.Sequential(*layers);

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        normalized = (features - self.featureMean) / self.featureStd;
        return self.network(normalized);


def calculateFeatureStatistics(features: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    if features.ndim != 2 or features.shape[1] != 63:
        raise ValueError("Training features must have shape [N, 63].");
    featureMean = features.mean(dim=0);
    featureStd = features.std(dim=0, unbiased=False);
    featureStd = torch.where(featureStd < 1e-6, torch.ones_like(featureStd), featureStd);
    return featureMean, featureStd;
