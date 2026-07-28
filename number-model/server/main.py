"""WebSocket server for the number-only model.

Implements the same contract as `game-ai-dev-server/app/main.py`, so a frontend
can point at either one. Same request types, same field names, same error codes,
same logging shape. It listens on a different port because the two are meant to
run side by side while the number model is still being evaluated.

    ws://localhost:8766      number-only, 10 digits + none
    ws://localhost:8765      the jamo server, unchanged

Like the jamo server it receives only MediaPipe landmarks. No camera, image, or
video data reaches this process.

Run:
    cd number-model && python -m server.main
    HANDPRACTICE_NUMBER_MODEL_DIR=<dir>           # to point at another bundle
"""

from __future__ import annotations

import asyncio
from functools import partial
import json
import os

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
from .recognition_session import RecognitionSession
from numbermodel.adapter import NumberModelAdapter, load_number_readiness
from numbermodel.features import LANDMARK_COUNT

HOST = os.getenv("HANDPRACTICE_NUMBER_HOST", "localhost")
PORT = int(os.getenv("HANDPRACTICE_NUMBER_PORT", "8766"))
# One frame in, one distribution out. Reported so a client reading
# `sequenceLength` sees a truthful value rather than the jamo server's 10.
SEQUENCE_LENGTH = 1


def process_request(session: RecognitionSession, raw_message: str) -> list[dict[str, object]]:
    request = parse_request(raw_message)
    if isinstance(request, GetCapabilitiesRequest):
        contract = session.contract
        return [
            capabilities_message(
                contract.model_version,
                contract.labels,
                SEQUENCE_LENGTH,
                load_number_readiness(),
                contract.feature_version,
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


async def websocket_handler(connection: ServerConnection, adapter: NumberModelAdapter) -> None:
    session = RecognitionSession(adapter)
    landmark_count = 0
    missing_count = 0
    connection_label = f"{id(connection):x}"
    print(f"[number:{connection_label}] connected", flush=True)
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
                        print(f"[number:{connection_label}] landmarks={landmark_count} responses={response_types}", flush=True)
                elif message_type == "HAND_NOT_DETECTED":
                    missing_count += 1
                    if missing_count == 1 or missing_count % 30 == 0:
                        print(f"[number:{connection_label}] hand-missing={missing_count}", flush=True)
            except ProtocolError as error:
                responses = [error_message(error.code, error.message)]
            except ValueError as error:
                responses = [error_message("INVALID_INPUT", str(error))]
            for response in responses:
                await connection.send(json.dumps(json_ready(response), ensure_ascii=False))
    finally:
        session.reset()
        print(f"[number:{connection_label}] disconnected landmarks={landmark_count} hand-missing={missing_count}", flush=True)


async def run_server(adapter: NumberModelAdapter) -> None:
    handler = partial(websocket_handler, adapter=adapter)
    async with serve(handler, HOST, PORT):
        print(f"Number AI WebSocket server listening on ws://{HOST}:{PORT}")
        print(f"  model {adapter.contract.model_version}, {adapter.contract.output_size} classes, feature {adapter.contract.feature_version}")
        await asyncio.get_running_loop().create_future()


def main() -> None:
    adapter = NumberModelAdapter()
    asyncio.run(run_server(adapter))


if __name__ == "__main__":
    main()
