import { describe, expect, it, vi } from "vitest";

import { BattleResultRequestError } from "./BattleResultClient";
import { submitBattleResult } from "./BattleResultSubmission";

describe("submitBattleResult", () => {
  it("lets the primary reporter submit immediately", async () => {
    const report = vi.fn(async () => undefined);
    const wait = vi.fn(async () => undefined);
    await expect(submitBattleResult({ primary: true, report, wait })).resolves.toBe("RECORDED");
    expect(wait).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledOnce();
  });

  it("lets the secondary reporter submit after the fallback delay", async () => {
    const report = vi.fn(async () => undefined);
    const wait = vi.fn(async () => undefined);
    await expect(submitBattleResult({ primary: false, report, wait })).resolves.toBe("RECORDED");
    expect(wait).toHaveBeenCalledWith(1_500);
    expect(report).toHaveBeenCalledOnce();
  });

  it("cancels the secondary request when the primary result was observed", async () => {
    const report = vi.fn(async () => undefined);
    await expect(submitBattleResult({
      primary: false,
      report,
      wait: async () => undefined,
      cancelled: () => true,
    })).resolves.toBe("CANCELLED");
    expect(report).not.toHaveBeenCalled();
  });

  it("treats a 409 as an idempotent recorded result", async () => {
    await expect(submitBattleResult({
      primary: true,
      report: async () => { throw new BattleResultRequestError(409, null); },
    })).resolves.toBe("ALREADY_RECORDED");
  });

  it("preserves authorization failures", async () => {
    await expect(submitBattleResult({
      primary: true,
      report: async () => { throw new BattleResultRequestError(403, null); },
    })).rejects.toMatchObject({ status: 403 });
  });
});
