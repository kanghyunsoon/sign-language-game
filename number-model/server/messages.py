"""WebSocket protocol for the number-only server.

The wire format is deliberately identical to `game-ai-dev-server/app/messages.py`
so a frontend can point at either server without changing a line. Request types,
field names, error codes, and response shapes all match.

Copied from : game-ai-dev-server/app/messages.py
Source commit: 42aced2

Only two things differ, and both follow from this model classifying one frame
instead of a ten-frame window:

  * `CAPABILITIES` reports `sequenceLength: 1` and adds `frameInput` and
    `featureVersion`, so a client can tell the two servers apart if it wants to.
  * There is no sequence to accumulate, so `RESET_SEQUENCE` only clears the
    hand-missing timer.

`tests/test_server_messages.py` pins the wire format, and the source hash below
is checked so the shared protocol cannot change without this copy noticing.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
from typing import TypeAlias

import numpy as np

SOURCE_FILE = Path(__file__).resolve().parents[2] / "game-ai-dev-server" / "app" / "messages.py"
SOURCE_SHA256 = "3dc8f77ecba346b3dfaa1db41bea5af7ff9a06878344c2e895241f6e8f5b1d0d"

class ProtocolError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Landmark:
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class GetCapabilitiesRequest:
    pass


@dataclass(frozen=True)
class LandmarkFrameRequest:
    frame_id: int
    captured_at: int
    handedness: str
    landmarks: tuple[Landmark, ...]


@dataclass(frozen=True)
class HandNotDetectedRequest:
    captured_at: int


@dataclass(frozen=True)
class ResetSequenceRequest:
    pass


ClientRequest: TypeAlias = (
    GetCapabilitiesRequest
    | LandmarkFrameRequest
    | HandNotDetectedRequest
    | ResetSequenceRequest
)
JsonValue: TypeAlias = None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]


def parse_request(raw_message: str) -> ClientRequest:
    try:
        payload = json.loads(raw_message)
    except json.JSONDecodeError as error:
        raise ProtocolError("INVALID_JSON", "Message must be valid JSON") from error
    if not isinstance(payload, dict):
        raise ProtocolError("INVALID_MESSAGE", "Message must be a JSON object")

    message_type = payload.get("type")
    if message_type == "GET_CAPABILITIES":
        return GetCapabilitiesRequest()
    if message_type == "RESET_SEQUENCE":
        return ResetSequenceRequest()
    if message_type == "HAND_NOT_DETECTED":
        return HandNotDetectedRequest(captured_at=_required_int(payload, "capturedAt"))
    if message_type == "LANDMARK_FRAME":
        landmarks_value = payload.get("landmarks")
        if not isinstance(landmarks_value, list):
            raise ProtocolError("INVALID_LANDMARKS", "landmarks must be an array")
        return LandmarkFrameRequest(
            frame_id=_required_int(payload, "frameId"),
            captured_at=_required_int(payload, "capturedAt"),
            handedness=_required_string(payload, "handedness"),
            landmarks=tuple(_parse_landmark(value, index) for index, value in enumerate(landmarks_value)),
        )
    raise ProtocolError("UNSUPPORTED_MESSAGE", "Unsupported message type")


def capabilities_message(
    model_version: str,
    supported_symbols: tuple[str, ...],
    sequence_length: int,
    readiness: dict[str, object] | None = None,
    feature_version: str | None = None,
) -> dict[str, JsonValue]:
    message: dict[str, JsonValue] = {
        "type": "CAPABILITIES",
        "modelVersion": model_version,
        "supportedSymbols": list(supported_symbols),
        "sequenceLength": sequence_length,
    }
    if feature_version is not None:
        # Frame input rather than a window; stated so a client can tell the two
        # servers apart without guessing from sequenceLength.
        message["frameInput"] = sequence_length == 1
        message["featureVersion"] = feature_version
    if readiness is not None:
        classes = readiness.get("classes", [])
        if not isinstance(classes, list):
            raise ValueError("readiness classes must be a list")
        message["confirmationAuthority"] = str(readiness.get("confirmationAuthority"))
        message["competitiveSymbols"] = [
            str(item["symbol"]) for item in classes
            if isinstance(item, dict) and item.get("competitiveEligible") is True
        ]
        message["confidenceThresholds"] = {
            str(item["symbol"]): float(item["threshold"]) for item in classes
            if isinstance(item, dict) and isinstance(item.get("threshold"), (int, float))
        }
    return message


def prediction_message(
    frame_id: int,
    symbol: str,
    confidence: float,
    is_stable: bool,
    predicted_at: int,
    top_candidates: list[dict[str, object]] | None = None,
) -> dict[str, JsonValue]:
    message: dict[str, JsonValue] = {
        "type": "PREDICTION",
        "frameId": frame_id,
        "symbol": symbol,
        "confidence": confidence,
        "isStable": is_stable,
        "predictedAt": predicted_at,
    }
    if top_candidates is not None:
        message["topCandidates"] = top_candidates
    return message


def sign_confirmed_message(
    symbol: str,
    confidence: float,
    confirmed_at: int,
    model_version: str,
) -> dict[str, JsonValue]:
    return {
        "type": "SIGN_CONFIRMED",
        "symbol": symbol,
        "confidence": confidence,
        "confirmedAt": confirmed_at,
        "modelVersion": model_version,
    }


def hand_released_message(released_at: int) -> dict[str, JsonValue]:
    return {"type": "HAND_RELEASED", "releasedAt": released_at}


def error_message(code: str, message: str) -> dict[str, JsonValue]:
    return {"type": "ERROR", "code": code, "message": message}


def json_ready(value: JsonValue | np.generic | np.ndarray) -> JsonValue:
    if isinstance(value, np.generic):
        return json_ready(value.item())
    if isinstance(value, np.ndarray):
        return json_ready(value.tolist())
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if isinstance(value, dict):
        return {key: json_ready(item) for key, item in value.items()}
    return value


def _required_int(payload: dict[str, object], key: str) -> int:
    value = payload.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ProtocolError("INVALID_MESSAGE", f"{key} must be an integer")
    return value


def _required_string(payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise ProtocolError("INVALID_MESSAGE", f"{key} must be a non-empty string")
    return value


def _parse_landmark(value: object, index: int) -> Landmark:
    if not isinstance(value, dict):
        raise ProtocolError("INVALID_LANDMARK", f"landmarks[{index}] must be an object")
    coordinates: list[float] = []
    for axis in ("x", "y", "z"):
        coordinate = value.get(axis)
        if isinstance(coordinate, bool) or not isinstance(coordinate, (int, float)):
            raise ProtocolError("INVALID_LANDMARK", f"landmarks[{index}].{axis} must be numeric")
        converted = float(coordinate)
        if not math.isfinite(converted):
            raise ProtocolError("INVALID_LANDMARK", f"landmarks[{index}].{axis} must be finite")
        coordinates.append(converted)
    return Landmark(*coordinates)
