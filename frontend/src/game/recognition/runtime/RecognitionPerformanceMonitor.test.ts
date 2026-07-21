import { describe, expect, it, vi } from "vitest";
import { RecognitionPerformanceMonitor } from "./RecognitionPerformanceMonitor";

describe("RecognitionPerformanceMonitor", () => {
  it("tracks independent rates, latency percentiles, drops, and stale responses", () => {
    let now = 0;
    const monitor = new RecognitionPerformanceMonitor(() => now);
    const listener = vi.fn();
    monitor.subscribe(listener);
    for (let index = 0; index < 10; index += 1) {
      now = index * 100;
      monitor.mark("hand", now);
      monitor.mark("aiRequest", now);
    }
    monitor.recordAiLatency(20);
    monitor.recordAiLatency(100);
    monitor.drop("hand", 2);
    monitor.drop("pose");
    monitor.drop("inference", 3);
    monitor.stale(4);
    const snapshot = monitor.getSnapshot();
    expect(snapshot.handTrackingFps).toBe(10);
    expect(snapshot.aiRequestFps).toBe(10);
    expect(snapshot.aiAverageLatencyMs).toBe(60);
    expect(snapshot.aiP95LatencyMs).toBe(100);
    expect(snapshot.droppedHandFrames).toBe(2);
    expect(snapshot.droppedPoseFrames).toBe(1);
    expect(snapshot.droppedInferenceFrames).toBe(3);
    expect(snapshot.staleResponsesIgnored).toBe(4);
    expect(listener).toHaveBeenCalled();
  });
});
