import { describe, expect, it } from "vitest";
import { isLineRaceDevHarnessEnabled, isLineRaceMockBotPracticeEnabled, isLineRaceServerBotEnabled, type LineRaceFeatureFlags } from "./LineRaceFeatureFlags";

const enabled: LineRaceFeatureFlags = {
  enabled: true,
  devHarnessEnabled: true,
  frontendMockBotEnabled: false,
  serverBotEnabled: false,
};

describe("line-race dev harness feature flag", () => {
  it("never exposes the route in production", () => {
    expect(isLineRaceDevHarnessEnabled(false, enabled)).toBe(false);
    expect(isLineRaceDevHarnessEnabled(true, enabled)).toBe(true);
    expect(isLineRaceDevHarnessEnabled(true, { ...enabled, devHarnessEnabled: false })).toBe(false);
    expect(isLineRaceDevHarnessEnabled(true, { ...enabled, enabled: false })).toBe(false);
  });
  it("exposes mock bot practice only behind its development flag", () => {
    expect(isLineRaceMockBotPracticeEnabled(false, { ...enabled, frontendMockBotEnabled: true })).toBe(false);
    expect(isLineRaceMockBotPracticeEnabled(true, enabled)).toBe(false);
    expect(isLineRaceMockBotPracticeEnabled(true, { ...enabled, frontendMockBotEnabled: true })).toBe(true);
  });
  it("keeps the real server bot available independently of developer tooling", () => {
    expect(isLineRaceServerBotEnabled(false, { ...enabled, serverBotEnabled: true })).toBe(true);
    expect(isLineRaceServerBotEnabled(true, enabled)).toBe(false);
    expect(isLineRaceServerBotEnabled(true, { ...enabled, enabled: false, serverBotEnabled: true })).toBe(false);
  });
});
