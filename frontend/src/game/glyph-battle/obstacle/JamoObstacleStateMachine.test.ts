import { describe, expect, it } from "vitest";
import { JamoObstacleStateMachine } from "./JamoObstacleStateMachine";

describe("JamoObstacleStateMachine", () => {
  it("rejects invalid transitions", () => {
    const machine = new JamoObstacleStateMachine();
    expect(() => machine.transition("ACTIVE")).toThrow("CREATED -> ACTIVE");
    machine.transition("WARNING");
    machine.transition("FALLING");
    machine.transition("ACTIVE");
    machine.transition("COUNTERED");
    expect(() => machine.transition("TRAVERSING")).toThrow("COUNTERED -> TRAVERSING");
  });
});
