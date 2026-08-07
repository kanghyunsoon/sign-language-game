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

describe("WordWebSocketSignRecognizer v7 stage/verdict confirmation", () => {
  it("confirms immediately on stage:final + verdict:correct, bypassing the frame-vote decoder's confidence gate", () => {
    const socket = new FakeSocket();
    const recognizer = new WordWebSocketSignRecognizer({
      url: "ws://test",
      createWebSocket: () => socket,
    });
    const events: Array<{ type: string }> = [];
    recognizer.subscribe((event) => events.push(event));

    void recognizer.connect();
    socket.onopen?.(new Event("open"));
    recognizer.sendLandmarkFrame(frame({ frameId: 7 }));

    // Low confidence — would never accumulate enough legacy-decoder votes to
    // confirm on its own, yet the server already validated it via guards.
    socket.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "PREDICTION", frameId: 7, symbol: "ship", confidence: 0.09,
          isStable: true, predictedAt: 1000, stage: "final", verdict: "correct",
        }),
      }),
    );

    const confirmed = events.find((event) => event.type === "SIGN_CONFIRMED");
    expect(confirmed).toMatchObject({ symbol: "ship", confidence: 0.09 });
  });

  it("does not confirm on stage:final + verdict:wrong-form", () => {
    const socket = new FakeSocket();
    const recognizer = new WordWebSocketSignRecognizer({
      url: "ws://test",
      createWebSocket: () => socket,
    });
    const events: Array<{ type: string }> = [];
    recognizer.subscribe((event) => events.push(event));

    void recognizer.connect();
    socket.onopen?.(new Event("open"));
    recognizer.sendLandmarkFrame(frame({ frameId: 8 }));

    socket.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "PREDICTION", frameId: 8, symbol: "wrong", confidence: 0.7,
          isStable: true, predictedAt: 1000, stage: "final", verdict: "wrong-form",
          feedback: ["역방향으로 수행했어요"],
        }),
      }),
    );

    expect(events.some((event) => event.type === "SIGN_CONFIRMED")).toBe(false);
  });
});
