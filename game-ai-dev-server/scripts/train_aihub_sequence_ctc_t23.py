"""Train a compact continuous Korean fingerspelling CTC model on physical GPU 2."""

from __future__ import annotations

import argparse
import collections
import json
import os
import random
from pathlib import Path

requested_gpu = os.environ.get("CUDA_VISIBLE_DEVICES")
if requested_gpu != "2":
    raise RuntimeError(f"Physical GPU 2 is required, got CUDA_VISIBLE_DEVICES={requested_gpu!r}")

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-features", type=Path, nargs="+", required=True)
    parser.add_argument("--validation-features", type=Path, required=True)
    parser.add_argument("--test-features", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=96)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=89)
    parser.add_argument("--attempt-id", default="T-23")
    parser.add_argument("--initial-checkpoint", type=Path)
    parser.add_argument("--focus-classes", default="")
    parser.add_argument("--focus-multiplier", type=float, default=1.0)
    parser.add_argument("--skip-test", action="store_true")
    parser.add_argument("--blank-logit-bias", type=float, default=0.0)
    parser.add_argument("--use-delta-features", action="store_true")
    parser.add_argument("--use-temporal-conv", action="store_true")
    parser.add_argument("--coordinate-noise-std", type=float, default=0.0)
    parser.add_argument("--ensemble-checkpoints", type=Path, nargs="+")
    parser.add_argument("--balanced-sampler-alpha", type=float, default=0.0)
    parser.add_argument("--gru-hidden-size", type=int, default=128)
    parser.add_argument("--gru-layers", type=int, default=2)
    return parser.parse_args()


class SequenceDataset(Dataset):
    def __init__(self, paths: list[Path], signer: str | None = None) -> None:
        self.sources: list[dict[str, np.ndarray]] = []
        self.rows: list[tuple[int, int]] = []
        self.class_names: list[str] | None = None
        for source_index, path in enumerate(paths):
            raw = np.load(path, allow_pickle=False)
            source = {name: raw[name] for name in raw.files}
            names = source["class_names"].tolist()
            if self.class_names is None:
                self.class_names = names
            elif self.class_names != names:
                raise ValueError("class order differs between feature files")
            self.sources.append(source)
            for row_index, clip in enumerate(source["clips"].tolist()):
                if signer is None or f"_{signer}_" in clip:
                    self.rows.append((source_index, row_index))

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor, str]:
        source_index, row_index = self.rows[index]
        source = self.sources[source_index]
        f0, f1 = source["feature_offsets"][row_index : row_index + 2]
        t0, t1 = source["target_offsets"][row_index : row_index + 2]
        return (
            torch.from_numpy(source["features"][f0:f1].astype(np.float32)),
            torch.from_numpy(source["targets"][t0:t1].astype(np.int64)),
            str(source["clips"][row_index]),
        )


def collate(rows: list[tuple[torch.Tensor, torch.Tensor, str]]) -> tuple[torch.Tensor, ...]:
    features, targets, _ = zip(*rows)
    lengths = torch.tensor([len(item) for item in features], dtype=torch.long)
    target_lengths = torch.tensor([len(item) for item in targets], dtype=torch.long)
    padded = nn.utils.rnn.pad_sequence(features, batch_first=True)
    return padded, lengths, torch.cat(targets), target_lengths


class CTCModel(nn.Module):
    def __init__(self, input_size: int, classes: int, use_delta_features: bool = False, use_temporal_conv: bool = False, gru_hidden_size: int = 128, gru_layers: int = 2) -> None:
        super().__init__()
        self.use_delta_features = use_delta_features
        self.use_temporal_conv = use_temporal_conv
        effective_input_size = input_size * (2 if use_delta_features else 1)
        self.encoder = nn.Sequential(
            nn.LayerNorm(effective_input_size), nn.Linear(effective_input_size, 192), nn.GELU(), nn.Dropout(0.15)
        )
        self.temporal_conv = nn.Conv1d(192, 192, kernel_size=3, padding=1) if use_temporal_conv else None
        self.gru = nn.GRU(192, gru_hidden_size, num_layers=gru_layers, batch_first=True, bidirectional=True, dropout=0.15 if gru_layers > 1 else 0.0)
        self.classifier = nn.Linear(gru_hidden_size * 2, classes + 1)

    def forward(self, features: torch.Tensor, lengths: torch.Tensor) -> torch.Tensor:
        if self.use_delta_features:
            deltas = torch.zeros_like(features)
            deltas[:, 1:] = features[:, 1:] - features[:, :-1]
            features = torch.cat((features, deltas), dim=-1)
        encoded = self.encoder(features)
        if self.temporal_conv is not None:
            convolved = self.temporal_conv(encoded.transpose(1, 2)).transpose(1, 2)
            encoded = encoded + torch.nn.functional.gelu(convolved)
        packed = nn.utils.rnn.pack_padded_sequence(
            encoded, lengths.cpu(), batch_first=True, enforce_sorted=False
        )
        packed, _ = self.gru(packed)
        encoded, _ = nn.utils.rnn.pad_packed_sequence(
            packed, batch_first=True, total_length=features.shape[1]
        )
        return self.classifier(encoded)


class LogitEnsemble(nn.Module):
    def __init__(self, models: list[nn.Module]) -> None:
        super().__init__()
        self.models = nn.ModuleList(models)

    def forward(self, features: torch.Tensor, lengths: torch.Tensor) -> torch.Tensor:
        return torch.stack([model(features, lengths) for model in self.models]).mean(dim=0)


def greedy_decode(logits: torch.Tensor, lengths: torch.Tensor, blank: int, blank_logit_bias: float = 0.0) -> list[list[int]]:
    adjusted = logits.clone()
    adjusted[..., blank] += blank_logit_bias
    best = adjusted.argmax(dim=-1).cpu().numpy()
    outputs: list[list[int]] = []
    for row, length in zip(best, lengths.tolist()):
        decoded: list[int] = []
        previous = blank
        for token in row[:length]:
            token = int(token)
            if token != blank and token != previous:
                decoded.append(token)
            previous = token
        outputs.append(decoded)
    return outputs


def align(reference: list[int], prediction: list[int]) -> list[tuple[int | None, int | None]]:
    rows, cols = len(reference) + 1, len(prediction) + 1
    cost = np.zeros((rows, cols), dtype=np.int16)
    cost[:, 0] = np.arange(rows)
    cost[0, :] = np.arange(cols)
    for i in range(1, rows):
        for j in range(1, cols):
            cost[i, j] = min(cost[i - 1, j] + 1, cost[i, j - 1] + 1, cost[i - 1, j - 1] + (reference[i - 1] != prediction[j - 1]))
    pairs: list[tuple[int | None, int | None]] = []
    i, j = len(reference), len(prediction)
    while i or j:
        if i and j and cost[i, j] == cost[i - 1, j - 1] + (reference[i - 1] != prediction[j - 1]):
            pairs.append((reference[i - 1], prediction[j - 1])); i -= 1; j -= 1
        elif i and cost[i, j] == cost[i - 1, j] + 1:
            pairs.append((reference[i - 1], None)); i -= 1
        else:
            pairs.append((None, prediction[j - 1])); j -= 1
    return list(reversed(pairs))


def validation_selection_score(metrics: dict[str, object]) -> float:
    """Balance sequence errors and class fairness when selecting a checkpoint."""
    return float(metrics["macroF1"]) - float(metrics["characterErrorRate"])


@torch.no_grad()
def evaluate(model: nn.Module, loader: DataLoader, class_names: list[str], device: torch.device, blank_logit_bias: float = 0.0) -> dict[str, object]:
    model.eval()
    blank = len(class_names)
    correct = np.zeros(blank, dtype=np.int64)
    reference_count = np.zeros(blank, dtype=np.int64)
    predicted_count = np.zeros(blank, dtype=np.int64)
    confusions: collections.Counter[tuple[str, str]] = collections.Counter()
    edits = target_total = exact = sequences = 0
    for features, lengths, flat_targets, target_lengths in loader:
        logits = model(features.to(device), lengths)
        predictions = greedy_decode(logits, lengths, blank, blank_logit_bias)
        cursor = 0
        for prediction, target_length in zip(predictions, target_lengths.tolist()):
            reference = flat_targets[cursor : cursor + target_length].tolist(); cursor += target_length
            pairs = align(reference, prediction)
            sequence_edits = sum(left != right for left, right in pairs)
            edits += sequence_edits; target_total += len(reference); exact += int(sequence_edits == 0); sequences += 1
            for left, right in pairs:
                if left is not None: reference_count[left] += 1
                if right is not None: predicted_count[right] += 1
                if left is not None and left == right: correct[left] += 1
                elif left is not None and right is not None: confusions[(class_names[left], class_names[right])] += 1
    precision = np.divide(correct, predicted_count, out=np.zeros_like(correct, dtype=float), where=predicted_count > 0)
    recall = np.divide(correct, reference_count, out=np.zeros_like(correct, dtype=float), where=reference_count > 0)
    f1 = np.divide(2 * precision * recall, precision + recall, out=np.zeros_like(recall), where=(precision + recall) > 0)
    per_class = {
        name: {"support": int(reference_count[i]), "precision": float(precision[i]), "recall": float(recall[i]), "f1": float(f1[i])}
        for i, name in enumerate(class_names)
    }
    below = [name for name, row in per_class.items() if row["recall"] < 0.93 or row["f1"] < 0.93]
    return {
        "sequenceCount": sequences,
        "characterErrorRate": edits / max(target_total, 1),
        "sequenceExactMatch": exact / max(sequences, 1),
        "microTokenRecall": float(correct.sum() / max(reference_count.sum(), 1)),
        "macroRecall": float(recall.mean()),
        "macroF1": float(f1.mean()),
        "minRecall": float(recall.min()),
        "minF1": float(f1.min()),
        "classesBelow93": below,
        "perClass": per_class,
        "topSubstitutions": [{"target": a, "prediction": b, "count": n} for (a, b), n in confusions.most_common(20)],
    }


def main() -> None:
    args = parse_args()
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed); torch.cuda.manual_seed_all(args.seed)
    torch.backends.cudnn.deterministic = True
    device = torch.device("cuda:0")
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable")
    train_set = SequenceDataset(args.train_features)
    validation_set = SequenceDataset([args.validation_features], signer="CROWD18")
    test_set = SequenceDataset([args.test_features or args.validation_features], signer="CROWD19")
    class_names = train_set.class_names or []
    focus_names = {name for name in args.focus_classes.split(",") if name}
    unknown_focus = focus_names.difference(class_names)
    if unknown_focus:
        raise ValueError(f"unknown focus classes: {sorted(unknown_focus)}")
    focus_ids = {class_names.index(name) for name in focus_names}
    sampler = None
    if args.balanced_sampler_alpha > 0 or (focus_ids and args.focus_multiplier > 1.0):
        class_counts = np.zeros(len(class_names), dtype=np.int64)
        cached_targets: list[list[int]] = []
        for index in range(len(train_set)):
            targets = train_set[index][1].tolist()
            cached_targets.append(targets)
            np.add.at(class_counts, targets, 1)
        weights = []
        for targets in cached_targets:
            weight = 1.0
            if args.balanced_sampler_alpha > 0:
                unique_targets = set(targets)
                weight *= float(np.mean([max(class_counts[token], 1) ** (-args.balanced_sampler_alpha) for token in unique_targets]))
            if focus_ids and args.focus_multiplier > 1.0:
                focus_fraction = sum(token in focus_ids for token in targets) / max(len(targets), 1)
                weight *= 1.0 + (args.focus_multiplier - 1.0) * focus_fraction
            weights.append(weight)
        sampler = WeightedRandomSampler(weights, len(weights), replacement=True)
    train_loader = DataLoader(train_set, batch_size=args.batch_size, shuffle=sampler is None, sampler=sampler, collate_fn=collate, num_workers=2, pin_memory=True)
    validation_loader = DataLoader(validation_set, batch_size=args.batch_size * 2, shuffle=False, collate_fn=collate, num_workers=2)
    test_loader = DataLoader(test_set, batch_size=args.batch_size * 2, shuffle=False, collate_fn=collate, num_workers=2)
    model = CTCModel(128, len(class_names), args.use_delta_features, args.use_temporal_conv, args.gru_hidden_size, args.gru_layers).to(device)
    if args.ensemble_checkpoints:
        models: list[nn.Module] = []
        for checkpoint_path in args.ensemble_checkpoints:
            member = CTCModel(128, len(class_names), args.use_delta_features, args.use_temporal_conv, args.gru_hidden_size, args.gru_layers).to(device)
            saved = torch.load(checkpoint_path, map_location=device, weights_only=True)
            if saved["class_names"] != class_names or int(saved["input_size"]) != 128 or bool(saved.get("use_delta_features", False)) != args.use_delta_features or bool(saved.get("use_temporal_conv", False)) != args.use_temporal_conv or int(saved.get("gru_hidden_size", 128)) != args.gru_hidden_size or int(saved.get("gru_layers", 2)) != args.gru_layers:
                raise ValueError(f"ensemble checkpoint contract differs: {checkpoint_path}")
            member.load_state_dict(saved["state_dict"])
            member.eval()
            models.append(member)
        ensemble = LogitEnsemble(models).to(device)
        validation = evaluate(ensemble, validation_loader, class_names, device, args.blank_logit_bias)
        test = None if args.skip_test else evaluate(ensemble, test_loader, class_names, device, args.blank_logit_bias)
        report = {
            "attemptId": args.attempt_id, "seed": args.seed, "physicalGpu": 2, "logicalDevice": "cuda:0",
            "trainClips": len(train_set), "validationClips": len(validation_set), "testClips": len(test_set),
            "epochs": 0, "history": [], "validation": validation, "test": test,
            "ensembleCheckpoints": [str(path) for path in args.ensemble_checkpoints],
            "blankLogitBias": args.blank_logit_bias, "useDeltaFeatures": args.use_delta_features,
            "useTemporalConv": args.use_temporal_conv, "gruHiddenSize": args.gru_hidden_size, "gruLayers": args.gru_layers,
            "goalPassed": bool(test) and test["microTokenRecall"] >= 0.93 and test["macroF1"] >= 0.93 and not test["classesBelow93"],
            "limitations": ["phrase-level timing only; CTC learns latent character boundaries", "CROWD19 is a development test, not an untouched final certification set"],
        }
        args.output_dir.mkdir(parents=True, exist_ok=True)
        (args.output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({key: report[key] for key in ("attemptId", "trainClips", "validationClips", "testClips", "goalPassed")}), flush=True)
        return
    if args.initial_checkpoint:
        initial = torch.load(args.initial_checkpoint, map_location=device, weights_only=True)
        if initial["class_names"] != class_names or int(initial["input_size"]) != 128 or bool(initial.get("use_delta_features", False)) != args.use_delta_features or bool(initial.get("use_temporal_conv", False)) != args.use_temporal_conv or int(initial.get("gru_hidden_size", 128)) != args.gru_hidden_size or int(initial.get("gru_layers", 2)) != args.gru_layers:
            raise ValueError("initial checkpoint class order, input size, delta-feature, or temporal-conv mode differs")
        model.load_state_dict(initial["state_dict"])
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=1e-4)
    loss_fn = nn.CTCLoss(blank=len(class_names), zero_infinity=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    history: list[dict[str, float]] = []
    best_score = float("-inf")
    for epoch in range(1, args.epochs + 1):
        model.train(); loss_sum = 0.0
        for features, lengths, targets, target_lengths in train_loader:
            features = features.to(device); targets = targets.to(device)
            if args.coordinate_noise_std > 0:
                features = features.clone()
                for base in (0, 63):
                    hand = features[:, :, base : base + 63].reshape(*features.shape[:2], 21, 3)
                    visible = hand[..., 2:3] > 0
                    jitter = torch.randn_like(hand[..., :2]) * args.coordinate_noise_std
                    hand[..., :2] += jitter * visible
            logits = model(features, lengths).log_softmax(dim=-1).transpose(0, 1)
            loss = loss_fn(logits, targets, lengths, target_lengths)
            optimizer.zero_grad(set_to_none=True); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(), 5.0); optimizer.step()
            loss_sum += float(loss.item())
        validation = evaluate(model, validation_loader, class_names, device, args.blank_logit_bias)
        score = validation_selection_score(validation)
        row = {"epoch": epoch, "trainLoss": loss_sum / len(train_loader), "validationCER": validation["characterErrorRate"], "validationMacroF1": validation["macroF1"], "validationSelectionScore": score}
        history.append(row); print(json.dumps(row), flush=True)
        if score > best_score:
            best_score = score
            torch.save({"state_dict": model.state_dict(), "class_names": class_names, "input_size": 128, "use_delta_features": args.use_delta_features, "use_temporal_conv": args.use_temporal_conv, "gru_hidden_size": args.gru_hidden_size, "gru_layers": args.gru_layers, "validation_selection_score": score}, args.output_dir / "best.pt")
    checkpoint = torch.load(args.output_dir / "best.pt", map_location=device, weights_only=True)
    model.load_state_dict(checkpoint["state_dict"])
    validation = evaluate(model, validation_loader, class_names, device, args.blank_logit_bias)
    test = None if args.skip_test else evaluate(model, test_loader, class_names, device, args.blank_logit_bias)
    report = {
        "attemptId": args.attempt_id, "seed": args.seed, "physicalGpu": 2, "logicalDevice": "cuda:0",
        "trainClips": len(train_set), "validationClips": len(validation_set), "testClips": len(test_set),
        "epochs": args.epochs, "history": history, "validation": validation, "test": test,
        "initialCheckpoint": str(args.initial_checkpoint) if args.initial_checkpoint else None,
        "focusClasses": sorted(focus_names), "focusMultiplier": args.focus_multiplier,
        "blankLogitBias": args.blank_logit_bias,
        "useDeltaFeatures": args.use_delta_features,
        "useTemporalConv": args.use_temporal_conv,
        "coordinateNoiseStd": args.coordinate_noise_std,
        "balancedSamplerAlpha": args.balanced_sampler_alpha,
        "gruHiddenSize": args.gru_hidden_size,
        "gruLayers": args.gru_layers,
        "checkpointSelection": "maximize validation macroF1 - CER",
        "goalPassed": bool(test) and test["microTokenRecall"] >= 0.93 and test["macroF1"] >= 0.93 and not test["classesBelow93"],
        "limitations": ["phrase-level timing only; CTC learns latent character boundaries", "CROWD19 is a development test, not an untouched final certification set"],
    }
    (args.output_dir / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("attemptId", "trainClips", "validationClips", "testClips", "goalPassed")}), flush=True)


if __name__ == "__main__":
    main()
