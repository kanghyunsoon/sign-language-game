import type { BattleBodyTransform, BattleLetterState, ServerBattleMessage } from "./battleTransportTypes";

const TYPES = new Set(["START_MATCH", "MATCH_STARTED", "GAME_START", "SHARED_TARGET", "SHARED_TARGET_CLAIMED", "IDLE_REMOVAL_SELECTED", "IDLE_REMOVAL_EXECUTED", "SPAWN_LETTER", "REMOVE_LETTER_ACCEPTED", "REMOVE_LETTER_REJECTED", "SCORE_UPDATED", "COMBO_UPDATED", "ATTACK_CREATED", "ATTACK_APPLIED", "MATCH_FINISHED", "RESULT_RECORDED", "PLAYER_DISCONNECTED", "PLAYER_RECONNECTED", "BODY_TRANSFORM_BATCH", "BOARD_SNAPSHOT", "LETTER_SPAWNED_SYNC", "LETTER_STATE_SYNC", "LETTER_REMOVED_SYNC", "OTTER_TRANSFER"]);
const STATES = new Set<BattleLetterState>(["FALLING", "SETTLED", "REMOVING", "REMOVED"]);

export class BattleMessageParseError extends Error {}

export function parseBattleMessage(data: string | unknown): ServerBattleMessage {
  let value: unknown = data;
  if (typeof data === "string") {
    try { value = JSON.parse(data) as unknown; } catch { throw new BattleMessageParseError("Battle message is not valid JSON."); }
  }
  const message = object(value, "message");
  const type = string(message.type, "type");
  if (!TYPES.has(type)) throw new BattleMessageParseError(`Unsupported battle message type: ${type}`);
  number(message.sequence, "sequence");
  if (type === "BODY_TRANSFORM_BATCH" || type === "BOARD_SNAPSHOT") array(message.bodies, "bodies").forEach(parseBody);
  if (type === "BOARD_SNAPSHOT" && message.boardChecksum !== undefined) string(message.boardChecksum, "boardChecksum");
  if (type === "SPAWN_LETTER" && message.normalizedY !== undefined) number(message.normalizedY, "normalizedY");
  if (type === "IDLE_REMOVAL_SELECTED" || type === "IDLE_REMOVAL_EXECUTED") array(message.targets, "targets").forEach(parseIdleRemovalTarget);
  if (type === "LETTER_SPAWNED_SYNC") parseBody(object(message.body, "body"));
  if (type === "LETTER_STATE_SYNC" && !STATES.has(string(message.state, "state") as BattleLetterState)) throw new BattleMessageParseError("Invalid letter state.");
  validateRequired(message, type);
  return message as unknown as ServerBattleMessage;
}

function parseIdleRemovalTarget(value: unknown): void {
  const target = object(value, "target");
  string(target.playerId, "target.playerId");
  string(target.letterId, "target.letterId");
  string(target.symbol, "target.symbol");
  number(target.normalizedX, "target.normalizedX");
  number(target.normalizedY, "target.normalizedY");
}

function parseBody(value: unknown): BattleBodyTransform {
  const body = object(value, "body");
  string(body.id, "body.id"); string(body.symbol, "body.symbol");
  for (const key of ["x", "y", "angle", "velocityX", "velocityY", "angularVelocity"] as const) number(body[key], `body.${key}`);
  if (!STATES.has(string(body.state, "body.state") as BattleLetterState)) throw new BattleMessageParseError("Invalid body state.");
  return body as unknown as BattleBodyTransform;
}

function validateRequired(message: Record<string, unknown>, type: string): void {
  const common: Record<string, readonly string[]> = {
    MATCH_STARTED: ["matchId", "roomId", "playerIds", "startAt"], GAME_START: ["matchId", "roomId", "playerIds", "startAt"],
    SHARED_TARGET: ["matchId", "targetId", "symbol", "presentedAt"],
    SHARED_TARGET_CLAIMED: ["matchId", "targetId", "winnerPlayerId", "symbol", "score", "combo", "maxCombo", "removedCount", "acceptedAt"],
    IDLE_REMOVAL_SELECTED: ["matchId", "removalId", "targets", "selectedAt", "executeAt"],
    IDLE_REMOVAL_EXECUTED: ["matchId", "removalId", "targets", "executedAt"],
    SPAWN_LETTER: ["matchId", "playerId", "letterId", "spawnIndex", "symbol", "spawnAt", "normalizedX", "initialAngle"],
    REMOVE_LETTER_ACCEPTED: ["playerId", "letterId", "symbol", "score", "combo", "maxCombo", "removedCount", "acceptedAt"],
    REMOVE_LETTER_REJECTED: ["code", "message", "rejectedAt"], SCORE_UPDATED: ["playerId", "score"], COMBO_UPDATED: ["playerId", "combo", "maxCombo"],
    ATTACK_CREATED: ["attackId", "attackerPlayerId", "targetPlayerId", "attackType", "amount", "sourceCombo", "createdAt"], ATTACK_APPLIED: ["attackId", "attackerPlayerId", "targetPlayerId", "attackType", "amount", "sourceCombo", "createdAt"],
    MATCH_FINISHED: ["matchId", "reason", "finishedAt"], RESULT_RECORDED: ["matchId", "recordedAt"], PLAYER_DISCONNECTED: ["playerId"], PLAYER_RECONNECTED: ["playerId"],
    BODY_TRANSFORM_BATCH: ["matchId", "playerId", "sentAt", "bodies"], BOARD_SNAPSHOT: ["matchId", "playerId", "sentAt", "bodies"],
    LETTER_SPAWNED_SYNC: ["matchId", "playerId", "body"], LETTER_STATE_SYNC: ["matchId", "playerId", "letterId", "state"], LETTER_REMOVED_SYNC: ["matchId", "playerId", "letterId"],
    OTTER_TRANSFER: ["matchId", "sourcePlayerId", "targetPlayerId", "sourceLetterId", "sourceNormalizedX", "symbol", "direction", "pickupAt", "throwAt"],
  };
  for (const key of common[type] ?? []) if (!(key in message)) throw new BattleMessageParseError(`Missing ${key}.`);
}

function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new BattleMessageParseError(`${name} must be an object.`); return value as Record<string, unknown>; }
function string(value: unknown, name: string): string { if (typeof value !== "string" || value.length === 0) throw new BattleMessageParseError(`${name} must be a non-empty string.`); return value; }
function number(value: unknown, name: string): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new BattleMessageParseError(`${name} must be finite.`); return value; }
function array(value: unknown, name: string): readonly unknown[] { if (!Array.isArray(value)) throw new BattleMessageParseError(`${name} must be an array.`); return value; }
