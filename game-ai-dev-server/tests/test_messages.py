from __future__ import annotations

import json
import unittest

from app.messages import ProtocolError, parse_request
from app.main import process_request
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
