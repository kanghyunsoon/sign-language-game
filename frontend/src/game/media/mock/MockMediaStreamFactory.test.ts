import { describe, expect, it, vi } from "vitest";
import { MockMediaStreamFactory } from "./MockMediaStreamFactory";

describe("MockMediaStreamFactory", () => {
  it("creates an animated canvas stream and owns its cleanup", () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const context = { fillStyle: "", font: "", fillRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillText: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => context, captureStream: vi.fn(() => stream) } as unknown as HTMLCanvasElement;
    const requestFrame = vi.fn(() => 7);
    const cancelFrame = vi.fn();
    const factory = new MockMediaStreamFactory({ createCanvas: () => canvas, requestFrame, cancelFrame, now: () => new Date(0) });
    expect(factory.create("dev-user")).toBe(stream);
    expect(canvas.captureStream).toHaveBeenCalledWith(15);
    expect(context.fillText).toHaveBeenCalledWith("dev-user", 24, 48);
    factory.stop(stream);
    expect(cancelFrame).toHaveBeenCalledWith(7);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
