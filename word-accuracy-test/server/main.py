# -*- coding: utf-8 -*-
"""ksl-word-v7 websocket 서버 — word-accuracy-test 롤링 판정기를 감싼 얇은 어댑터.

`inference/`의 RollingGrader가 실제 추론·가드·수형규칙을 담당한다. 이 서버는
JSON 프로토콜 파싱/직렬화와 연결 단위 세션 관리만 한다.
"""
from __future__ import annotations

import asyncio
from functools import partial
import hashlib
from http import HTTPStatus
import json
import os
import sys

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SERVER_DIR)
INFERENCE_DIR = os.path.join(ROOT_DIR, "inference")
# 배포판은 HANDPRACTICE_WORD_MODEL_DIR로 /opt/sudal/ai/models/ksl-word-v7를
# (docker-compose의 기존 word-ai 볼륨 마운트 관례 그대로) 가리키게 한다.
# 값이 없으면 이미지에 구워 넣은 모델을 그대로 쓴다(로컬 실행용).
MODEL_DIR = os.getenv(
    "HANDPRACTICE_WORD_MODEL_DIR",
    os.path.join(ROOT_DIR, "models", "ksl-word-v7"),
)
if INFERENCE_DIR not in sys.path:
    sys.path.insert(0, INFERENCE_DIR)

from websockets.asyncio.server import (  # noqa: E402
    Request,
    Response,
    ServerConnection,
    serve,
)

from rolling import RollingGrader  # noqa: E402

from .messages import (  # noqa: E402
    ClientRequest,
    GetCapabilitiesRequest,
    HandNotDetectedRequest,
    ProtocolError,
    ResetSequenceRequest,
    WordLandmarkFrameRequest,
    capabilities_message,
    error_message,
    json_ready,
    parse_request,
)
from .recognition_session import WordV7RecognitionSession  # noqa: E402

HOST = os.getenv("HANDPRACTICE_WORD_HOST", "localhost")
PORT = int(os.getenv("HANDPRACTICE_WORD_PORT", "8767"))
PATH = os.getenv("HANDPRACTICE_WORD_PATH", "/word")
MODEL_VERSION = os.getenv("HANDPRACTICE_WORD_MODEL_VERSION", "ksl-word-v7")
RECOMMENDED_FPS = int(os.getenv("HANDPRACTICE_WORD_RECOMMENDED_FPS", "18"))
CONFIDENCE_THRESHOLD = float(
    os.getenv("HANDPRACTICE_WORD_CONFIDENCE_THRESHOLD", "0.6"),
)
MINIMUM_FRAMES = int(os.getenv("HANDPRACTICE_WORD_MINIMUM_FRAMES", "16"))
MODEL_SHA256 = os.getenv("HANDPRACTICE_WORD_MODEL_SHA256", "").strip().lower()
# 조기 인정(동작 중 가드·규칙 전부 통과 시 즉시 확정) — 문제가 생기면 이미지
# 재빌드 없이 compose 환경변수만 0으로 바꿔 기존 구간-확정 방식으로 되돌린다.
EARLY_ACCEPT = os.getenv("HANDPRACTICE_WORD_EARLY_ACCEPT", "1").strip().lower() \
    not in ("0", "false", "no")


def normalise_path(raw_path: str) -> str:
    path = raw_path.split("?", 1)[0].split("#", 1)[0]
    return path.rstrip("/") or "/"


def check_path(connection: ServerConnection, request: Request) -> Response | None:
    if normalise_path(request.path) == normalise_path(PATH):
        return None
    body = (
        f"Not found: {request.path}\n"
        f"This is the ksl-word-v7 model server. "
        f"Connect to ws://{HOST}:{PORT}{PATH}\n"
    )
    return connection.respond(HTTPStatus.NOT_FOUND, body)


def process_parsed_request(
    session: WordV7RecognitionSession,
    labels: tuple[str, ...],
    sequence_length: int,
    request: ClientRequest,
) -> list[dict[str, object]]:
    if isinstance(request, GetCapabilitiesRequest):
        return [
            capabilities_message(
                model_version=MODEL_VERSION,
                labels=labels,
                sequence_length=sequence_length,
                minimum_frames=MINIMUM_FRAMES,
                recommended_fps=RECOMMENDED_FPS,
                confidence_threshold=CONFIDENCE_THRESHOLD,
            ),
        ]
    if isinstance(request, WordLandmarkFrameRequest):
        return session.process_landmark_frame(request)
    if isinstance(request, HandNotDetectedRequest):
        return session.process_hand_not_detected(request.captured_at)
    if isinstance(request, ResetSequenceRequest):
        session.reset()
        return []
    raise ProtocolError("UNSUPPORTED_MESSAGE", "Unsupported message type")


async def websocket_handler(
    connection: ServerConnection,
    grader_factory,
    labels: tuple[str, ...],
    sequence_length: int,
    inference_slots: asyncio.Semaphore,
) -> None:
    session = WordV7RecognitionSession(grader_factory())
    frame_count = 0
    connection_label = f"{id(connection):x}"
    print(f"[word-v7:{connection_label}] connected", flush=True)
    try:
        async for raw_message in connection:
            try:
                if not isinstance(raw_message, str):
                    raise ProtocolError("INVALID_MESSAGE", "Binary messages are not supported")
                request = parse_request(raw_message)
                if isinstance(request, (WordLandmarkFrameRequest, HandNotDetectedRequest)):
                    # HAND_NOT_DETECTED도 grader.push()를 거쳐 온셋/오프셋 판정을
                    # 진행시키고, quiet_s가 지나면 그 자리에서 ONNX 추론
                    # (predict_window)까지 할 수 있어 LANDMARK_FRAME과 동일하게
                    # 스레드풀로 뺀다.
                    if isinstance(request, WordLandmarkFrameRequest):
                        frame_count += 1
                    async with inference_slots:
                        responses = await asyncio.to_thread(
                            process_parsed_request,
                            session,
                            labels,
                            sequence_length,
                            request,
                        )
                else:
                    responses = process_parsed_request(
                        session, labels, sequence_length, request,
                    )
            except ProtocolError as error:
                responses = [error_message(error.code, error.message)]
            except Exception as error:  # noqa: BLE001
                print(
                    f"[word-v7:{connection_label}] internal-error={type(error).__name__}: {error}",
                    flush=True,
                )
                responses = [error_message("INTERNAL_ERROR", "Recognition request failed")]
            for response in responses:
                await connection.send(json.dumps(json_ready(response), ensure_ascii=False))
    finally:
        session.reset()
        print(f"[word-v7:{connection_label}] disconnected landmarks={frame_count}", flush=True)


async def run_server(host: str | None = None, port: int | None = None) -> None:
    model_path = os.path.join(MODEL_DIR, "model.int8.onnx")
    labels_path = os.path.join(MODEL_DIR, "labels.json")
    _verify_model_checksum(model_path)

    def grader_factory() -> RollingGrader:
        return RollingGrader(model_path, labels_path, early_accept=EARLY_ACCEPT)

    bootstrap = grader_factory()
    labels = tuple(bootstrap.rec.labels)
    sequence_length = bootstrap.rec.window

    selected_host = host if host is not None else HOST
    selected_port = port if port is not None else PORT
    inference_slots = asyncio.Semaphore(1)
    handler = partial(
        websocket_handler,
        grader_factory=grader_factory,
        labels=labels,
        sequence_length=sequence_length,
        inference_slots=inference_slots,
    )
    async with serve(handler, selected_host, selected_port, process_request=check_path):
        print(f"ksl-word-v7 WebSocket server listening on ws://{selected_host}:{selected_port}{PATH}")
        await asyncio.get_running_loop().create_future()


def _verify_model_checksum(model_path: str) -> None:
    """HANDPRACTICE_WORD_MODEL_SHA256이 비어 있으면 검사를 건너뛴다(로컬 실행용).
    word-model/wordmodel/adapter.py의 체크포인트 체크섬 검증과 같은 패턴이다."""
    if not MODEL_SHA256:
        return
    digest = hashlib.sha256()
    with open(model_path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    actual = digest.hexdigest()
    if actual != MODEL_SHA256:
        raise ValueError(
            "Word v7 model SHA256 does not match HANDPRACTICE_WORD_MODEL_SHA256",
        )


def main() -> None:
    asyncio.run(run_server())


if __name__ == "__main__":
    main()
