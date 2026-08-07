// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { WordWebSocketSignRecognizer } from "./WordWebSocketSignRecognizer";
import type { WebSocketLike } from "../../../game/recognition/websocket/PythonWebSocketSignRecognizer";
import type { WordLandmarkFrame, WordPoseKeypoints } from "./wordRecognitionTypes";

class FakeSocket implements WebSocketLike {
  readyState = WebSocket.OPEN;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

const point = (): WordPoseKeypoints[keyof WordPoseKeypoints] => ({ x: 0.5, y: 0.5, z: 0 });

const pose: WordPoseKeypoints = {
  nose: point(), leftEar: point(), rightEar: point(),
  leftShoulder: point(), rightShoulder: point(),
  leftElbow: point(), rightElbow: point(),
  leftWrist: point(), rightWrist: point(),
};

const hand = () => ({
  handedness: "RIGHT" as const,
  score: 0.9,
  landmarks: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
});

const frame = (overrides: Partial<WordLandmarkFrame> = {}): WordLandmarkFrame => ({
  frameId: 1,
  capturedAt: Date.now(),
  frameWidth: 1280,
  frameHeight: 720,
  hands: { left: null, right: hand() },
  pose,
  ...overrides,
});

describe("WordWebSocketSignRecognizer wire format", () => {
  it("wraps pose keypoints under pose.landmarks on the wire (server contract)", () => {
    const socket = new FakeSocket();
    const recognizer = new WordWebSocketSignRecognizer({
      url: "ws://test",
      createWebSocket: () => socket,
    });
    void recognizer.connect();
    socket.onopen?.(new Event("open"));
    socket.send.mockClear();

    recognizer.sendLandmarkFrame(frame());

    const sent = JSON.parse(socket.send.mock.calls[0]![0] as string);
    expect(sent.type).toBe("LANDMARK_FRAME");
    expect(sent.pose).toEqual({ landmarks: pose });
  });

  it("sends pose: null when no pose was detected", () => {
    const socket = new FakeSocket();
    const recognizer = new WordWebSocketSignRecognizer({
      url: "ws://test",
      createWebSocket: () => socket,
    });
    void recognizer.connect();
    socket.onopen?.(new Event("open"));
    socket.send.mockClear();

    recognizer.sendLandmarkFrame(frame({ pose: null }));

    const sent = JSON.parse(socket.send.mock.calls[0]![0] as string);
    expect(sent.pose).toBeNull();
  });
});
