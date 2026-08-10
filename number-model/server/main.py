"""WebSocket server for the number-only model.

Implements the same contract as `game-ai-dev-server/app/main.py`, so a frontend
can point at either one. Same request types, same field names, same error codes,
same logging shape. It listens on a different port because the two are meant to
run side by side while the number model is still being evaluated.

    ws://localhost:8766/number   number-only, 10 digits + none
    ws://localhost:8765          the jamo server, unchanged

The path is required and any other path is refused with 404. The jamo server
accepts every path, so a client pointed at the wrong port there still connects
and then behaves oddly for reasons that show up much later. Naming the model in
the path makes that mistake fail at connect time with a message that says which
server was reached.

Like the jamo server it receives only MediaPipe landmarks. No camera, image, or
video data reaches this process.

Run:
    cd number-model && python -m server.main
    HANDPRACTICE_NUMBER_MODEL_DIR=<dir>           # to point at another bundle
    HANDPRACTICE_NUMBER_PATH=/number              # to serve a different path
"""

from __future__ import annotations

import asyncio
from functools import partial
import json
import os

from http import HTTPStatus

from websockets.asyncio.server import Request, Response, ServerConnection, serve

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
PATH = os.getenv("HANDPRACTICE_NUMBER_PATH", "/number")
# One frame in, one distribution out. Reported so a client reading
# `sequenceLength` sees a truthful value rather than the jamo server's 10.
SEQUENCE_LENGTH = 1


def normalise_path(raw_path: str) -> str:
    """Strip the query string and any trailing slash, so `/number/?x=1` matches."""
    path = raw_path.split("?", 1)[0].split("#", 1)[0]
    return path.rstrip("/") or "/"


def check_path(connection: ServerConnection, request: Request) -> Response | None:
    """Refuse anything but the model's path, and say what was reached.

    Returning a response here rejects during the HTTP handshake, so a wrong path
    fails at `new WebSocket(...)` rather than after a connection that never
    answers as expected.
    """
    if normalise_path(request.path) == normalise_path(PATH):
        return None
    body = (
        f"Not found: {request.path}\n"
        f"This is the sign-number model server. Connect to ws://{HOST}:{PORT}{PATH}\n"
    )
    return connection.respond(HTTPStatus.NOT_FOUND, body)


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
    async with serve(handler, HOST, PORT, process_request=check_path):
        print(f"Number AI WebSocket server listening on ws://{HOST}:{PORT}{PATH}")
        print(f"  model {adapter.contract.model_version}, {adapter.contract.output_size} classes, feature {adapter.contract.feature_version}")
        await asyncio.get_running_loop().create_future()


def main() -> None:
    adapter = NumberModelAdapter()
    asyncio.run(run_server(adapter))


if __name__ == "__main__":
    main()
