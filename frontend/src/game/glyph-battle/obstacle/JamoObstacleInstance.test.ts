import { describe, expect, it } from "vitest";
import { JamoObstacleInstance } from "./JamoObstacleInstance";
import { GIYEOK_TEMPLATE } from "./templates";

function obstacle() { return new JamoObstacleInstance("o1", { ...GIYEOK_TEMPLATE, fallDurationMs: 100, penaltyMs: 200 }, "PLAYER_A", 300, 0, 50, 80); }

describe("JamoObstacleInstance", () => {
  it("advances WARNING, FALLING, and ACTIVE by time", () => {
    const item = obstacle();
    expect(item.state).toBe("WARNING");
    item.update(50); expect(item.state).toBe("FALLING");
    expect(item.snapshot(100).fallProgress).toBe(.5);
    item.update(150); expect(item.state).toBe("ACTIVE");
  });

  it("runs the counter removal lifecycle and rejects traversal", () => {
    const item = obstacle(); item.update(150); item.counter(160);
    expect(item.state).toBe("COUNTERED");
    expect(() => item.startTraversal(170)).toThrow("cannot traverse");
    item.update(340); expect(item.state).toBe("REMOVING");
    item.update(420); expect(item.state).toBe("REMOVED");
  });

  it("runs TRAVERSING, TRAVERSED, REMOVING, and REMOVED", () => {
    const item = obstacle(); item.update(150); item.startTraversal(160);
    expect(item.state).toBe("TRAVERSING");
    item.update(360); expect(item.state).toBe("TRAVERSED");
    item.update(361); expect(item.state).toBe("REMOVING");
    item.update(441); expect(item.state).toBe("REMOVED");
  });
});
