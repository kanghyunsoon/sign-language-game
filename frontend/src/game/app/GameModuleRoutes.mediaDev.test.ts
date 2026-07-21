import { describe, expect, it } from "vitest";
import { isGameMediaDevHarnessEnabled, isRecognitionCrowdTestEnabled } from "./GameModuleRoutes";

describe("media dev harness routing", () => {
  it("is not exposed when the host is running a production build", () => {
    expect(isGameMediaDevHarnessEnabled(false)).toBe(false);
    expect(isGameMediaDevHarnessEnabled(true)).toBe(true);
  });
  it("keeps the crowd recognition harness development-only",()=>{
    expect(isRecognitionCrowdTestEnabled(false)).toBe(false);
    expect(isRecognitionCrowdTestEnabled(true)).toBe(true);
  });
});
