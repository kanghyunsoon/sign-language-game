from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np

NUMBER_MODEL_ROOT = Path(__file__).resolve().parents[1]
if str(NUMBER_MODEL_ROOT) not in sys.path:
    sys.path.insert(0, str(NUMBER_MODEL_ROOT))

from numbermodel.adapter import NumberModelAdapter  # noqa: E402
from numbermodel.labels import LABELS, NUMBER_LABELS  # noqa: E402
from server import main as server_main  # noqa: E402
from server import messages as msg  # noqa: E402
from server.recognition_session import RecognitionSession  # noqa: E402
from tests.test_adapter import write_bundle  # noqa: E402  reuse the minimal bundle helper


def landmark_frame(frame_id: int = 1, captured_at: int = 1000, count: int = 21) -> str:
    return json.dumps(
        {
            "type": "LANDMARK_FRAME",
            "frameId": frame_id,
            "capturedAt": captured_at,
            "handedness": "RIGHT",
            "landmarks": [
                {"x": 0.1 + i * 0.01, "y": 0.2 + i * 0.005, "z": -0.01 * i} for i in range(count)
            ],
        },
    )


def load_jamo_messages():
    """Import the jamo server's protocol module, or None when it is absent."""
    if not msg.SOURCE_FILE.is_file():
        return None
    server_root = msg.SOURCE_FILE.parents[1]
    if str(server_root) not in sys.path:
        sys.path.insert(0, str(server_root))
    from app import messages as jamo  # noqa: PLC0415

    return jamo


class ProtocolParityTests(unittest.TestCase):
    """The wire format has to stay interchangeable with the jamo server.

    A frontend is supposed to be able to point at either port. If the shared
    protocol changes and this copy does not, the two drift apart silently, so the
    source hash is pinned and the parsers are compared on the same payloads.
    """

    def test_source_protocol_is_unchanged(self) -> None:
        if not msg.SOURCE_FILE.is_file():
            self.skipTest(f"jamo protocol not present at {msg.SOURCE_FILE}")
        source_bytes = msg.SOURCE_FILE.read_bytes().replace(b"\r\n", b"\n")
        digest = hashlib.sha256(source_bytes).hexdigest()
        self.assertEqual(
            digest,
            msg.SOURCE_SHA256,
            "game-ai-dev-server/app/messages.py changed. Compare it against "
            "server/messages.py, port anything that affects the wire format, and "
            "update SOURCE_SHA256.",
        )

    def test_both_parsers_agree_on_every_request_type(self) -> None:
        jamo = load_jamo_messages()
        if jamo is None:
            self.skipTest("jamo protocol not present")
        payloads = [
            '{"type":"GET_CAPABILITIES"}',
            '{"type":"RESET_SEQUENCE"}',
            '{"type":"HAND_NOT_DETECTED","capturedAt":5}',
            landmark_frame(),
        ]
        for payload in payloads:
            with self.subTest(payload=payload[:40]):
                ours = msg.parse_request(payload)
                theirs = jamo.parse_request(payload)
                self.assertEqual(type(ours).__name__, type(theirs).__name__)
                if isinstance(ours, msg.LandmarkFrameRequest):
                    self.assertEqual(ours.frame_id, theirs.frame_id)
                    self.assertEqual(ours.captured_at, theirs.captured_at)
                    self.assertEqual(ours.handedness, theirs.handedness)
                    self.assertEqual(len(ours.landmarks), len(theirs.landmarks))
                    self.assertEqual(
                        [(p.x, p.y, p.z) for p in ours.landmarks],
                        [(p.x, p.y, p.z) for p in theirs.landmarks],
                    )

    def test_both_parsers_reject_the_same_things_with_the_same_codes(self) -> None:
        jamo = load_jamo_messages()
        if jamo is None:
            self.skipTest("jamo protocol not present")
        bad = [
            "not json",
            "[]",
            '{"type":"NOPE"}',
            '{"type":"HAND_NOT_DETECTED"}',
            '{"type":"HAND_NOT_DETECTED","capturedAt":true}',
            '{"type":"LANDMARK_FRAME","frameId":1,"capturedAt":1,"handedness":"RIGHT","landmarks":{}}',
            '{"type":"LANDMARK_FRAME","frameId":1,"capturedAt":1,"handedness":"","landmarks":[]}',
            '{"type":"LANDMARK_FRAME","frameId":1,"capturedAt":1,"handedness":"RIGHT","landmarks":[{"x":1,"y":2}]}',
            '{"type":"LANDMARK_FRAME","frameId":1,"capturedAt":1,"handedness":"RIGHT","landmarks":[{"x":1,"y":2,"z":"a"}]}',
        ]
        for payload in bad:
            with self.subTest(payload=payload[:50]):
                with self.assertRaises(msg.ProtocolError) as ours:
                    msg.parse_request(payload)
                with self.assertRaises(jamo.ProtocolError) as theirs:
                    jamo.parse_request(payload)
                self.assertEqual(ours.exception.code, theirs.exception.code)

    def test_response_builders_produce_the_same_shapes(self) -> None:
        jamo = load_jamo_messages()
        if jamo is None:
            self.skipTest("jamo protocol not present")
        pairs = [
            (msg.prediction_message(1, "9", 0.5, False, 7, [{"symbol": "9", "confidence": 0.5}]),
             jamo.prediction_message(1, "9", 0.5, False, 7, [{"symbol": "9", "confidence": 0.5}])),
            (msg.error_message("A", "b"), jamo.error_message("A", "b")),
            (msg.hand_released_message(3), jamo.hand_released_message(3)),
            (msg.sign_confirmed_message("9", 0.9, 4, "v"), jamo.sign_confirmed_message("9", 0.9, 4, "v")),
        ]
        for ours, theirs in pairs:
            with self.subTest(kind=ours["type"]):
                self.assertEqual(ours, theirs)

    def test_capabilities_keeps_the_shared_keys(self) -> None:
        jamo = load_jamo_messages()
        if jamo is None:
            self.skipTest("jamo protocol not present")
        readiness = {"confirmationAuthority": "FRONTEND_TEMPORAL_DECODER",
                     "classes": [{"symbol": "1", "threshold": 0.5, "competitiveEligible": True}]}
        ours = msg.capabilities_message("number-10-v1", ("1", "2"), 1, readiness, "v3")
        theirs = jamo.capabilities_message("jamo-31-v1", ("1", "2"), 10, readiness)
        # Every key the jamo server emits must still be present, so a client
        # reading the shared fields cannot break.
        self.assertTrue(set(theirs).issubset(set(ours)), set(theirs) - set(ours))
        self.assertEqual(ours["competitiveSymbols"], theirs["competitiveSymbols"])
        self.assertEqual(ours["confidenceThresholds"], theirs["confidenceThresholds"])
        self.assertEqual(ours["sequenceLength"], 1)
        self.assertTrue(ours["frameInput"])
        self.assertEqual(ours["featureVersion"], "v3")


class ServerRequestTests(unittest.TestCase):
    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.adapter = NumberModelAdapter(write_bundle(Path(self._directory.name)))
        self.session = RecognitionSession(self.adapter)

    def tearDown(self) -> None:
        self._directory.cleanup()

    def test_landmark_frame_returns_one_prediction(self) -> None:
        responses = server_main.process_request(self.session, landmark_frame(frame_id=4, captured_at=99))
        self.assertEqual(len(responses), 1)
        message = responses[0]
        self.assertEqual(message["type"], "PREDICTION")
        self.assertEqual(message["frameId"], 4)
        self.assertEqual(message["predictedAt"], 99)
        self.assertIn(message["symbol"], LABELS)
        # The server never confirms; the browser decoder does.
        self.assertFalse(message["isStable"])
        self.assertEqual(len(message["topCandidates"]), 5)

    def test_wrong_landmark_count_is_a_protocol_error(self) -> None:
        with self.assertRaises(msg.ProtocolError) as raised:
            server_main.process_request(self.session, landmark_frame(count=20))
        self.assertEqual(raised.exception.code, "INVALID_LANDMARK_COUNT")

    def test_hand_not_detected_and_reset_return_nothing(self) -> None:
        self.assertEqual(server_main.process_request(self.session, '{"type":"HAND_NOT_DETECTED","capturedAt":1}'), [])
        self.assertEqual(server_main.process_request(self.session, '{"type":"RESET_SEQUENCE"}'), [])

    def test_unsupported_message_is_rejected(self) -> None:
        with self.assertRaises(msg.ProtocolError) as raised:
            server_main.process_request(self.session, '{"type":"SOMETHING_ELSE"}')
        self.assertEqual(raised.exception.code, "UNSUPPORTED_MESSAGE")

    def test_every_response_survives_json_serialisation(self) -> None:
        responses = server_main.process_request(self.session, landmark_frame())
        text = json.dumps(msg.json_ready(responses[0]), ensure_ascii=False)
        self.assertEqual(json.loads(text)["type"], "PREDICTION")

    def test_session_reports_the_bundle_contract(self) -> None:
        self.assertEqual(self.session.contract.labels, LABELS)
        self.assertEqual(self.session.contract.output_size, 11)
        self.assertEqual(self.session.contract.feature_version, "v3")

    def test_capabilities_lists_the_number_symbols(self) -> None:
        responses = server_main.process_request(self.session, '{"type":"GET_CAPABILITIES"}')
        message = responses[0]
        self.assertEqual(message["type"], "CAPABILITIES")
        self.assertEqual(message["supportedSymbols"], list(LABELS))
        self.assertEqual(message["sequenceLength"], 1)
        self.assertEqual(message["confirmationAuthority"], "FRONTEND_TEMPORAL_DECODER")
        # Nothing is certified yet, so no symbol may be used competitively.
        self.assertEqual(message["competitiveSymbols"], [])
        self.assertEqual(set(message["confidenceThresholds"]), set(NUMBER_LABELS))

    def test_port_differs_from_the_jamo_server(self) -> None:
        self.assertEqual(server_main.PORT, 8766)
        self.assertEqual(server_main.SEQUENCE_LENGTH, 1)


class PathRoutingTests(unittest.TestCase):
    """Only the model's own path may connect.

    The jamo server answers on every path, so pointing a client at the wrong
    port still opens a socket there and the mismatch surfaces much later. This
    server names the model in the path so the mistake fails at connect time.
    """

    def test_default_path_names_the_model(self) -> None:
        self.assertEqual(server_main.PATH, "/number")

    def test_query_string_and_trailing_slash_do_not_change_the_path(self) -> None:
        for raw in ("/number", "/number/", "/number?token=abc", "/number/?a=1&b=2", "/number#x"):
            with self.subTest(raw=raw):
                self.assertEqual(server_main.normalise_path(raw), "/number")

    def test_matching_path_is_accepted(self) -> None:
        for raw in ("/number", "/number/", "/number?room=7"):
            with self.subTest(raw=raw):
                self.assertIsNone(server_main.check_path(_Connection(), _Request(raw)))

    def test_other_paths_are_refused_with_404(self) -> None:
        for raw in ("/", "/ws", "/jamo", "/number-model", "/numbers"):
            with self.subTest(raw=raw):
                response = server_main.check_path(_Connection(), _Request(raw))
                self.assertIsNotNone(response, f"{raw} should not have been accepted")
                self.assertEqual(response.status, 404)
                # The body has to say which server was reached; a bare 404 sends
                # the reader looking at their own code first.
                self.assertIn("sign-number", response.body)
                self.assertIn(server_main.PATH, response.body)


class _Request:
    def __init__(self, path: str) -> None:
        self.path = path


class _Response:
    def __init__(self, status: int, body: str) -> None:
        self.status = status
        self.body = body


class _Connection:
    """Stands in for ServerConnection, which cannot be built without a socket."""

    @staticmethod
    def respond(status, body):  # noqa: ANN001 - mirrors the library's signature
        return _Response(int(status), body)


if __name__ == "__main__":
    unittest.main()
