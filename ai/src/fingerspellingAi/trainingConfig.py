"""Training configuration loading and validation.""";

from dataclasses import dataclass;
from pathlib import Path;

from .config import loadJson;


@dataclass(frozen=True)
class ModelConfig:
    inputSize: int;
    hiddenSizes: tuple[int, ...];
    dropout: float;


@dataclass(frozen=True)
class OptimizationConfig:
    epochs: int;
    batchSize: int;
    learningRate: float;
    weightDecay: float;
    classWeighting: str;
    gradientClipNorm: float;


@dataclass(frozen=True)
class EarlyStoppingConfig:
    monitor: str;
    patience: int;
    minimumDelta: float;


@dataclass(frozen=True)
class CalibrationConfig:
    defaultThreshold: float;
    minimumValidationSamplesPerClass: int;
    minimumThreshold: float;
    maximumThreshold: float;


@dataclass(frozen=True)
class RuntimeConfig:
    numWorkers: int;
    pinMemory: bool;
    onnxOpsetVersion: int;


@dataclass(frozen=True)
class ReportingConfig:
    weakClassLimit: int;
    confusionPairLimit: int;
    minimumValidationMacroF1: float;
    minimumClassRecall: float;
    maximumNoneFalseAcceptRate: float;
    maximumGeneralizationGap: float;


@dataclass(frozen=True)
class TrainingConfig:
    schemaVersion: str;
    seed: int;
    device: str;
    model: ModelConfig;
    optimization: OptimizationConfig;
    earlyStopping: EarlyStoppingConfig;
    calibration: CalibrationConfig;
    runtime: RuntimeConfig;
    reporting: ReportingConfig;


def loadTrainingConfig(path: Path) -> TrainingConfig:
    payload = loadJson(path);
    model = payload["model"];
    optimization = payload["optimization"];
    earlyStopping = payload["earlyStopping"];
    calibration = payload["calibration"];
    runtime = payload["runtime"];
    reporting = payload.get("reporting", {});
    config = TrainingConfig(
        schemaVersion=str(payload["schemaVersion"]),
        seed=int(payload["seed"]),
        device=str(payload["device"]),
        model=ModelConfig(
            inputSize=int(model["inputSize"]),
            hiddenSizes=tuple(int(size) for size in model["hiddenSizes"]),
            dropout=float(model["dropout"]),
        ),
        optimization=OptimizationConfig(
            epochs=int(optimization["epochs"]),
            batchSize=int(optimization["batchSize"]),
            learningRate=float(optimization["learningRate"]),
            weightDecay=float(optimization["weightDecay"]),
            classWeighting=str(optimization["classWeighting"]),
            gradientClipNorm=float(optimization["gradientClipNorm"]),
        ),
        earlyStopping=EarlyStoppingConfig(
            monitor=str(earlyStopping["monitor"]),
            patience=int(earlyStopping["patience"]),
            minimumDelta=float(earlyStopping["minimumDelta"]),
        ),
        calibration=CalibrationConfig(
            defaultThreshold=float(calibration["defaultThreshold"]),
            minimumValidationSamplesPerClass=int(calibration["minimumValidationSamplesPerClass"]),
            minimumThreshold=float(calibration["minimumThreshold"]),
            maximumThreshold=float(calibration["maximumThreshold"]),
        ),
        runtime=RuntimeConfig(
            numWorkers=int(runtime["numWorkers"]),
            pinMemory=bool(runtime["pinMemory"]),
            onnxOpsetVersion=int(runtime["onnxOpsetVersion"]),
        ),
        reporting=ReportingConfig(
            weakClassLimit=int(reporting.get("weakClassLimit", 5)),
            confusionPairLimit=int(reporting.get("confusionPairLimit", 8)),
            minimumValidationMacroF1=float(reporting.get("minimumValidationMacroF1", 0.8)),
            minimumClassRecall=float(reporting.get("minimumClassRecall", 0.6)),
            maximumNoneFalseAcceptRate=float(reporting.get("maximumNoneFalseAcceptRate", 0.05)),
            maximumGeneralizationGap=float(reporting.get("maximumGeneralizationGap", 0.15)),
        ),
    );
    _validateTrainingConfig(config);
    return config;


def _validateTrainingConfig(config: TrainingConfig) -> None:
    if config.schemaVersion != "1.0.0":
        raise ValueError(f"Unsupported training schema version: {config.schemaVersion}");
    if config.device not in {"auto", "cpu", "cuda"}:
        raise ValueError("Training device must be auto, cpu, or cuda.");
    if config.model.inputSize != 63:
        raise ValueError("The fingerspelling model input size must be 63.");
    if not config.model.hiddenSizes or any(size <= 0 for size in config.model.hiddenSizes):
        raise ValueError("Model hidden sizes must contain positive integers.");
    if not 0.0 <= config.model.dropout < 1.0:
        raise ValueError("Model dropout must be in [0, 1).");
    if config.optimization.epochs < 1 or config.optimization.batchSize < 1:
        raise ValueError("Epochs and batch size must be positive.");
    if config.optimization.learningRate <= 0.0 or config.optimization.weightDecay < 0.0:
        raise ValueError("Learning rate must be positive and weight decay cannot be negative.");
    if config.optimization.classWeighting not in {"balanced", "none"}:
        raise ValueError("Class weighting must be balanced or none.");
    if config.optimization.gradientClipNorm < 0.0:
        raise ValueError("Gradient clip norm cannot be negative.");
    if config.earlyStopping.monitor not in {"macroF1", "loss"}:
        raise ValueError("Early stopping monitor must be macroF1 or loss.");
    if config.earlyStopping.patience < 1 or config.earlyStopping.minimumDelta < 0.0:
        raise ValueError("Early stopping patience must be positive and minimum delta cannot be negative.");
    if config.calibration.minimumValidationSamplesPerClass < 1:
        raise ValueError("Minimum validation samples per class must be positive.");
    if not 0.0 <= config.calibration.minimumThreshold <= config.calibration.maximumThreshold <= 1.0:
        raise ValueError("Calibration thresholds must be ordered within [0, 1].");
    if not config.calibration.minimumThreshold <= config.calibration.defaultThreshold <= config.calibration.maximumThreshold:
        raise ValueError("Default threshold must be within the configured calibration range.");
    if config.runtime.numWorkers < 0:
        raise ValueError("Number of workers cannot be negative.");
    if not 12 <= config.runtime.onnxOpsetVersion <= 20:
        raise ValueError("ONNX opset version must be between 12 and 20.");
    if config.reporting.weakClassLimit < 1 or config.reporting.confusionPairLimit < 1:
        raise ValueError("Report class and confusion limits must be positive.");
    reportRates = (
        config.reporting.minimumValidationMacroF1,
        config.reporting.minimumClassRecall,
        config.reporting.maximumNoneFalseAcceptRate,
        config.reporting.maximumGeneralizationGap,
    );
    if any(rate < 0.0 or rate > 1.0 for rate in reportRates):
        raise ValueError("Report metric criteria must be within [0, 1].");
