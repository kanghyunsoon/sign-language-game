from __future__ import annotations

import asyncio
import json
from functools import partial

from websockets.asyncio.server import ServerConnection, serve

from .messages import (
    GetCapabilitiesRequest,
    HandNotDetectedRequest,
    LandmarkFrameRequest,
    ProtocolError,
    ResetSequenceRequest,
    capabilities_message,
    error_message,
    json_ready,
    parse_request,
)
from .feature_adapter import LANDMARK_COUNT
from .model_adapter import ModelRunner, create_model_runner, load_recognition_readiness
from .recognition_session import RecognitionSession


HOST = "localhost"
PORT = 8765


def process_request(session: RecognitionSession, raw_message: str) -> list[dict[str, object]]:
    request = parse_request(raw_message)
    if isinstance(request, GetCapabilitiesRequest):
        contract = session.contract
        return [
            capabilities_message(
                contract.model_version,
                contract.labels,
                contract.sequence_length,
                load_recognition_readiness(),
            ),
        ]
    if isinstance(request, LandmarkFrameRequest):
        if len(request.landmarks) != LANDMARK_COUNT:
            raise ProtocolError(
                "INVALID_LANDMARK_COUNT",
                f"Expected {LANDMARK_COUNT} landmarks",
            )
        return session.process_landmark_frame(
            request.frame_id,
            request.captured_at,
            request.landmarks,
            request.handedness,
        )
    if isinstance(request, HandNotDetectedRequest):
        return session.process_hand_not_detected(request.captured_at)
    if isinstance(request, ResetSequenceRequest):
        session.reset()
        return []
    raise ProtocolError("UNSUPPORTED_MESSAGE", "Unsupported message type")


async def websocket_handler(connection: ServerConnection, runner: ModelRunner) -> None:
    session = RecognitionSession(runner)
    landmark_count = 0
    missing_count = 0
    connection_label = f"{id(connection):x}"
    print(f"[recognition:{connection_label}] connected", flush=True)
    try:
        async for raw_message in connection:
            try:
                if not isinstance(raw_message, str):
                    raise ProtocolError("INVALID_MESSAGE", "Binary messages are not supported")
                message_type = json.loads(raw_message).get("type")
                responses = process_request(session, raw_message)
                if message_type == "LANDMARK_FRAME":
                    landmark_count += 1
                    if landmark_count == 1 or landmark_count % 30 == 0:
                        response_types = ",".join(str(item.get("type")) for item in responses) or "NONE"
                        print(f"[recognition:{connection_label}] landmarks={landmark_count} responses={response_types}", flush=True)
                elif message_type == "HAND_NOT_DETECTED":
                    missing_count += 1
                    if missing_count == 1 or missing_count % 30 == 0:
                        print(f"[recognition:{connection_label}] hand-missing={missing_count}", flush=True)
            except ProtocolError as error:
                responses = [error_message(error.code, error.message)]
            except ValueError as error:
                responses = [error_message("INVALID_INPUT", str(error))]
            for response in responses:
                await connection.send(json.dumps(json_ready(response), ensure_ascii=False))
    finally:
        session.reset()
        print(f"[recognition:{connection_label}] disconnected landmarks={landmark_count} hand-missing={missing_count}", flush=True)


async def run_server(runner: ModelRunner) -> None:
    handler = partial(websocket_handler, runner=runner)
    async with serve(handler, HOST, PORT):
        print(f"AI WebSocket server listening on ws://{HOST}:{PORT}")
        await asyncio.get_running_loop().create_future()


def main() -> None:
    runner = create_model_runner()
    asyncio.run(run_server(runner))


if __name__ == "__main__":
    main()
