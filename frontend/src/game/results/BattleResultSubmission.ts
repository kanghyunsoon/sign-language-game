import { BattleResultRequestError } from "./BattleResultClient";

export type BattleResultSubmissionOutcome = "RECORDED" | "ALREADY_RECORDED" | "CANCELLED";

export interface BattleResultSubmissionOptions {
  readonly primary: boolean;
  readonly report: () => Promise<unknown>;
  readonly cancelled?: () => boolean;
  readonly fallbackDelayMs?: number;
  readonly wait?: (delayMs: number) => Promise<void>;
}

/**
 * Lets one peer report immediately while the other remains a deterministic
 * fallback. A 409 means another participant already committed the same room
 * result, so it is an idempotent success rather than a user-facing failure.
 */
export async function submitBattleResult({
  primary,
  report,
  cancelled = () => false,
  fallbackDelayMs = 1_500,
  wait = defaultWait,
}: BattleResultSubmissionOptions): Promise<BattleResultSubmissionOutcome> {
  if (!primary) {
    await wait(fallbackDelayMs);
    if (cancelled()) return "CANCELLED";
  }
  try {
    await report();
    return "RECORDED";
  } catch (cause) {
    if (cause instanceof BattleResultRequestError && cause.status === 409) return "ALREADY_RECORDED";
    throw cause;
  }
}

function defaultWait(delayMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
}
