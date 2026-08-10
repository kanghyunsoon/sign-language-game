// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { HandLandmarkFrame } from "../types/landmark";
import { LineRaceContextualCandidateResolver } from "../../glyph-battle/recognition";
import type { LineRaceInputContext } from "../../glyph-battle/recognition";
import { PythonWebSocketSignRecognizer, type WebSocketLike } from "./PythonWebSocketSignRecognizer";

class FakeSocket implements WebSocketLike {
  readyState = WebSocket.OPEN;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

const frame = (frameId: number, capturedAt = Date.now()): HandLandmarkFrame => ({
  frameId,
  capturedAt,
  handedness: "RIGHT",
  landmarks: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
});

describe("PythonWebSocketSignRecognizer latest-only adapter", () => {
  it("reconnects after an unexpected close and restores the connected state", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const recognizer = new PythonWebSocketSignRecognizer({
      url: "ws://test",
      createWebSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const listener = vi.fn();
    recognizer.subscribe(listener);

    const firstConnection = recognizer.connect();
    const first = sockets[0]!;
    first.onopen?.(new Event("open"));
    await firstConnection;
    first.onclose?.(new CloseEvent("close"));
    expect(recognizer.getConnectionState()).toBe("DISCONNECTED");

    await vi.advanceTimersByTimeAsync(500);
    const replacement = sockets[1]!;
    expect(replacement).not.toBe(first);
    expect(recognizer.getConnectionState()).toBe("CONNECTING");
    replacement.onopen?.(new Event("open"));
    expect(recognizer.getConnectionState()).toBe("CONNECTED");
    recognizer.disconnect();
    vi.useRealTimers();
  });

  it("keeps the Python request JSON unchanged and ignores responses for unknown frames", async () => {
    const socket = new FakeSocket();
    const recognizer = new PythonWebSocketSignRecognizer({
      url: "ws://test",
      createWebSocket: () => socket,
    });
    const listener = vi.fn();
    recognizer.subscribe(listener);
    const connected = recognizer.connect();
    socket.onopen?.(new Event("open"));
    await connected;
    recognizer.sendLandmarkFrame(frame(1));
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"LANDMARK_FRAME"')));
    const request = JSON.parse(socket.send.mock.calls.map(([value]) => value).find((value) => value.includes("LANDMARK_FRAME"))!);
    expect(request).not.toHaveProperty("requestId");
    expect(request).not.toHaveProperty("sequence");
    expect(request.frameId).toBe(1);

    socket.onmessage?.({ data: JSON.stringify({ type: "PREDICTION", frameId: 99, symbol: "ㄱ", confidence: .9, isStable: false, predictedAt: Date.now() }) } as MessageEvent<string>);
    expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: "PREDICTION", frameId: 99 }));
    socket.onmessage?.({ data: JSON.stringify({ type: "PREDICTION", frameId: 1, symbol: "ㄱ", confidence: .9, isStable: false, predictedAt: Date.now() }) } as MessageEvent<string>);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "PREDICTION", frameId: 1 }));
    recognizer.disconnect();
  });

  it("clears frontend inference state and resets the Python sequence", async () => {
    const socket = new FakeSocket();
    const recognizer = new PythonWebSocketSignRecognizer({ url: "ws://test", createWebSocket: () => socket });
    const connected = recognizer.connect();
    socket.onopen?.(new Event("open"));
    await connected;
    recognizer.resetRecognitionSession();
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "RESET_SEQUENCE" }));
    recognizer.disconnect();
  });

  it("uses frontend temporal confirmation and ignores Python confirmation messages", async () => {
    const socket = new FakeSocket();
    const recognizer = new PythonWebSocketSignRecognizer({
      url: "ws://test",
      createWebSocket: () => socket,
      aiInferenceFps: 1000,
      decoderConfig: {
        minimumConfidence: .75, candidateWindowSize: 3, minimumCandidateVotes: 3, minimumStableDurationMs: 30,
        movementThreshold: .035, maximumPredictionAgeMs: 250, releasePoseDistanceThreshold: .12,
        releaseMinimumDurationMs: 50, noHandReleaseDurationMs: 40, differentSymbolReleaseVotes: 2,
      },
    });
    const listener = vi.fn(); recognizer.subscribe(listener);
    const connected = recognizer.connect(); socket.onopen?.(new Event("open")); await connected;
    const startedAt = Date.now() - 100;
    for (let index = 1; index <= 3; index += 1) {
      recognizer.sendLandmarkFrame(frame(index, startedAt + index * 20));
      await vi.waitFor(() => expect(landmarkRequests(socket)).toHaveLength(index));
      socket.onmessage?.({ data: JSON.stringify({ type: "PREDICTION", frameId: index, symbol: "ㄱ", confidence: .95, isStable: true, predictedAt: Date.now() }) } as MessageEvent<string>);
    }
    expect(listener.mock.calls.filter(([event]) => event.type === "SIGN_CONFIRMED")).toHaveLength(1);
    socket.onmessage?.({ data: JSON.stringify({ type: "SIGN_CONFIRMED", symbol: "ㄱ", confidence: 1, confirmedAt: Date.now(), modelVersion: "python" }) } as MessageEvent<string>);
    expect(listener.mock.calls.filter(([event]) => event.type === "SIGN_CONFIRMED")).toHaveLength(1);
    recognizer.disconnect();
  });

  it("keeps only the newest pending frame while Python inference is in flight", async () => {
    const socket = new FakeSocket();
    const recognizer = new PythonWebSocketSignRecognizer({ url: "ws://test", createWebSocket: () => socket, aiInferenceFps: 1000 });
    const listener = vi.fn(); recognizer.subscribe(listener);
    const connected = recognizer.connect(); socket.onopen?.(new Event("open")); await connected;
    recognizer.sendLandmarkFrame(frame(1, 100));
    recognizer.sendLandmarkFrame(frame(2, 110));
    recognizer.sendLandmarkFrame(frame(3, 120));
    expect(landmarkRequests(socket)).toHaveLength(1);
    socket.onmessage?.({ data: JSON.stringify({ type: "PREDICTION", frameId: 1, symbol: "ㄱ", confidence: .9, isStable: false, predictedAt: 100 }) } as MessageEvent<string>);
    expect(landmarkRequests(socket)).toHaveLength(2);
    expect(JSON.parse(landmarkRequests(socket)[1]!).frameId).toBe(3);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "PREDICTION", symbol: "ㄱ" }));
    recognizer.disconnect();
  });

  it("uses a qualified contextual second candidate while preserving raw top-1 diagnostics", async () => {
    const socket = new FakeSocket();
    let context = playingContext(["ㄱ"]);
    const recognizer = contextualRecognizer(socket, () => context);
    const listener = vi.fn();
    recognizer.subscribe(listener);
    const connected = recognizer.connect(); socket.onopen?.(new Event("open")); await connected;
    sendCapabilities(socket);

    const startedAt = Date.now() - 100;
    for (let index = 1; index <= 4; index += 1) {
      recognizer.sendLandmarkFrame(frame(index, startedAt + index * 20));
      await vi.waitFor(() => expect(landmarkRequests(socket)).toHaveLength(index));
      sendPrediction(socket, index, [
        { symbol: "ㅌ", confidence: .95 },
        { symbol: "ㄱ", confidence: .8 },
      ]);
    }

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: "PREDICTION", symbol: "ㅌ",
    }));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: "CONTEXTUAL_SELECTION", selectedCandidate: { symbol: "ㄱ", confidence: .8 },
    }));
    expect(listener.mock.calls.filter(([event]) => event.type === "SIGN_CONFIRMED" && event.symbol === "ㄱ")).toHaveLength(1);
    context = playingContext(["ㄴ"]);
    recognizer.disconnect();
  });

  it("rejects a stale response and clears old votes when the line-race context changes", async () => {
    const socket = new FakeSocket();
    let context = playingContext(["ㄱ"]);
    const recognizer = contextualRecognizer(socket, () => context);
    const listener = vi.fn(); recognizer.subscribe(listener);
    const connected = recognizer.connect(); socket.onopen?.(new Event("open")); await connected;
    sendCapabilities(socket);
    const startedAt = Date.now() - 160;

    // Two votes are accumulated in the old context, but are not enough to confirm.
    for (let index = 1; index <= 2; index += 1) {
      recognizer.sendLandmarkFrame(frame(index, startedAt + index * 20));
      await vi.waitFor(() => expect(landmarkRequests(socket)).toHaveLength(index));
      sendPrediction(socket, index, [{ symbol: "ㄱ", confidence: .9 }]);
    }
    // Frame 3 was captured under ㄱ, then its response arrives after the hand changed.
    recognizer.sendLandmarkFrame(frame(3, startedAt + 60));
    await vi.waitFor(() => expect(landmarkRequests(socket)).toHaveLength(3));
    context = playingContext(["ㄴ"]);
    sendPrediction(socket, 3, [{ symbol: "ㄱ", confidence: .9 }]);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: "CONTEXTUAL_SELECTION", rejectionReason: "STALE_CONTEXT",
    }));
    expect(listener.mock.calls.filter(([event]) => event.type === "SIGN_CONFIRMED")).toHaveLength(0);

    // One new-context vote must not combine with the two old votes.
    recognizer.sendLandmarkFrame(frame(4, startedAt + 80));
    await vi.waitFor(() => expect(landmarkRequests(socket)).toHaveLength(4));
    sendPrediction(socket, 4, [{ symbol: "ㄴ", confidence: .9 }]);
    expect(listener.mock.calls.filter(([event]) => event.type === "SIGN_CONFIRMED")).toHaveLength(0);
    for (let index = 5; index <= 6; index += 1) {
      recognizer.sendLandmarkFrame(frame(index, startedAt + index * 20));
      await vi.waitFor(() => expect(landmarkRequests(socket)).toHaveLength(index));
      sendPrediction(socket, index, [{ symbol: "ㄴ", confidence: .9 }]);
    }
    expect(listener.mock.calls.filter(([event]) => event.type === "SIGN_CONFIRMED" && event.symbol === "ㄴ")).toHaveLength(1);
    recognizer.disconnect();
  });
});

function landmarkRequests(socket: FakeSocket): string[] {
  return socket.send.mock.calls.map(([value]) => value as string).filter((value) => value.includes("LANDMARK_FRAME"));
}

function playingContext(attackHand: readonly string[]): LineRaceInputContext {
  return {
    matchState: "PLAYING", attackHand, attackCooldownEndsAt: 0, now: Date.now(),
    pendingObstacleCount: 0, maxPendingObstacles: 3,
    supportedSymbols: ["ㄱ", "ㄴ", "ㅌ"], counterableObstacles: [],
  };
}

function contextualRecognizer(socket: FakeSocket, getContext: () => LineRaceInputContext): PythonWebSocketSignRecognizer {
  return new PythonWebSocketSignRecognizer({
    url: "ws://test", createWebSocket: () => socket, aiInferenceFps: 1000,
    predictionSelector: new LineRaceContextualCandidateResolver(getContext),
    decoderConfig: {
      minimumConfidence: .5, candidateWindowSize: 3, minimumCandidateVotes: 3, minimumStableDurationMs: 30,
      movementThreshold: .035, maximumPredictionAgeMs: 250, releasePoseDistanceThreshold: .12,
      releaseMinimumDurationMs: 50, noHandReleaseDurationMs: 40, differentSymbolReleaseVotes: 2,
    },
  });
}

function sendCapabilities(socket: FakeSocket): void {
  socket.onmessage?.({ data: JSON.stringify({
    type: "CAPABILITIES", modelVersion: "test", supportedSymbols: ["ㄱ", "ㄴ", "ㅌ"], sequenceLength: 30,
  }) } as MessageEvent<string>);
}

function sendPrediction(socket: FakeSocket, frameId: number, topCandidates: readonly { symbol: string; confidence: number }[]): void {
  socket.onmessage?.({ data: JSON.stringify({
    type: "PREDICTION", frameId, symbol: topCandidates[0]!.symbol,
    confidence: topCandidates[0]!.confidence, isStable: true, predictedAt: Date.now(), topCandidates,
  }) } as MessageEvent<string>);
}
