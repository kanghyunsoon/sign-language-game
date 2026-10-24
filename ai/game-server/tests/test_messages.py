from __future__ import annotations

import json
import unittest

from app.messages import ProtocolError, parse_request
from app.main import handle_message, process_request
from app.recognition_session import RecognitionSession

from tests.helpers import MockModelRunner, landmark_frame, valid_landmarks


class MessageParsingTests(unittest.TestCase):
    def test_rejects_landmark_count_other_than_21(self) -> None:
        request = json.loads(landmark_frame(1, 1000))
        request["landmarks"] = list(valid_landmarks()[:20])

        parsed = parse_request(json.dumps(request))
        session = RecognitionSession(MockModelRunner([]))
        with self.assertRaises(ProtocolError) as raised:
            process_request(session, json.dumps(request))
        self.assertEqual(raised.exception.code, "INVALID_LANDMARK_COUNT")

    def test_rejects_non_finite_landmark_coordinate(self) -> None:
        request = json.loads(landmark_frame(1, 1000))
        request["landmarks"][0]["x"] = "not-a-number"

        with self.assertRaises(ProtocolError) as raised:
            parse_request(json.dumps(request))

        self.assertEqual(raised.exception.code, "INVALID_LANDMARK")


class HandleMessageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.session = RecognitionSession(MockModelRunner([]))

    def test_non_object_json_is_an_error_message_not_a_crash(self) -> None:
        for raw in ("[1, 2]", "3", "null", '"text"'):
            message_type, responses = handle_message(self.session, raw)
            self.assertIsNone(message_type)
            self.assertEqual(responses[0]["type"], "ERROR")
            self.assertEqual(responses[0]["code"], "INVALID_MESSAGE")

    def test_invalid_json_and_binary_are_reported(self) -> None:
        self.assertEqual(handle_message(self.session, "{not json")[1][0]["code"], "INVALID_JSON")
        self.assertEqual(handle_message(self.session, b"bytes")[1][0]["code"], "INVALID_MESSAGE")

    def test_unexpected_session_error_keeps_the_connection_usable(self) -> None:
        class BrokenSession:
            def process_landmark_frame(self, *args: object) -> list[dict[str, object]]:
                raise RuntimeError("boom")

        message_type, responses = handle_message(BrokenSession(), landmark_frame(1, 1000))  # type: ignore[arg-type]
        self.assertEqual(message_type, "LANDMARK_FRAME")
        self.assertEqual(responses[0]["code"], "INTERNAL_ERROR")
