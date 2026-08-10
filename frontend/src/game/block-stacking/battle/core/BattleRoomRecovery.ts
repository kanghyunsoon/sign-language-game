import type { BattleRoomSession } from "../room";

const REJOIN_DELAYS_MS = [0, 350, 700, 1_200, 1_700, 2_200, 2_700] as const;

export interface BattleRoomRecoveryOptions {
  readonly roomCode: string;
  readonly joinRoom: (roomCode: string) => Promise<BattleRoomSession>;
  readonly active?: () => boolean;
  readonly wait?: (delayMs: number) => Promise<void>;
}

/**
 * Rejoins throughout the backend's disconnect grace period. A refresh can
 * temporarily race cleanup of the previous socket, which is reported as a
 * conflict or a transient server failure even though the room still exists.
 */
export async function recoverBattleRoom(options: BattleRoomRecoveryOptions): Promise<BattleRoomSession> {
  const active = options.active ?? (() => true);
  const wait = options.wait ?? ((delayMs) => new Promise((resolve) => window.setTimeout(resolve, delayMs)));
  let lastError: unknown = new Error("Room recovery was not attempted.");

  for (const delayMs of REJOIN_DELAYS_MS) {
    if (!active()) throw new BattleRoomRecoveryCancelledError();
    if (delayMs > 0) await wait(delayMs);
    if (!active()) throw new BattleRoomRecoveryCancelledError();
    try {
      return await options.joinRoom(options.roomCode);
    } catch (cause) {
      lastError = cause;
      if (!isRetryableRecoveryError(cause)) throw cause;
    }
  }

  throw lastError;
}

export class BattleRoomRecoveryCancelledError extends Error {
  constructor() {
    super("Battle room recovery was cancelled.");
    this.name = "BattleRoomRecoveryCancelledError";
  }
}

export function isMissingOrForbiddenRoom(cause: unknown): boolean {
  const status = requestStatus(cause);
  return status === 401 || status === 403 || status === 404 || status === 410;
}

function isRetryableRecoveryError(cause: unknown): boolean {
  const status = requestStatus(cause);
  if (status === 409 || (status !== null && status >= 500 && status <= 599)) return true;
  return cause instanceof TypeError || (cause instanceof Error && /network|fetch|connection/i.test(cause.message));
}

function requestStatus(cause: unknown): number | null {
  if (!(cause instanceof Error)) return null;
  const match = cause.message.match(/\((\d{3})\)/);
  return match ? Number(match[1]) : null;
}
