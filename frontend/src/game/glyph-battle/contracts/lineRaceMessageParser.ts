import type { LineRaceClientCommand } from "./lineRaceCommands";
import { LineRaceMessageParseError } from "./lineRaceErrors";
import type { LineRaceServerEvent } from "./lineRaceEvents";

const COMMAND_TYPES = new Set(["LINE_RACE_SIGN_ATTACK_COMMAND", "LINE_RACE_COUNTER_COMMAND"]);
const EVENT_TYPES = new Set([
  "LINE_RACE_MATCH_STARTED",
  "LINE_RACE_HAND_DEALT",
  "LINE_RACE_ATTACK_ACCEPTED",
  "LINE_RACE_ATTACK_REJECTED",
  "LINE_RACE_COUNTER_SUCCEEDED",
  "LINE_RACE_COUNTER_FAILED",
  "LINE_RACE_OBSTACLE_CREATED",
  "LINE_RACE_OBSTACLE_FALLING",
  "LINE_RACE_OBSTACLE_ACTIVATED",
  "LINE_RACE_TRAVERSAL_STARTED",
  "LINE_RACE_TRAVERSAL_FINISHED",
  "LINE_RACE_OBSTACLE_REMOVED",
  "LINE_RACE_PROGRESS_UPDATED",
  "LINE_RACE_MATCH_FINISHED",
  "LINE_RACE_MATCH_SNAPSHOT",
]);

const EVENT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  LINE_RACE_MATCH_STARTED: ["roomId", "config", "players", "startAt", "finishDeadlineAt"],
  LINE_RACE_HAND_DEALT: ["playerId", "hand"],
  LINE_RACE_ATTACK_ACCEPTED: ["attackerPlayerId", "targetPlayerId", "consumedSymbol", "obstacle", "combo"],
  LINE_RACE_ATTACK_REJECTED: ["commandId", "reason"],
  LINE_RACE_COUNTER_SUCCEEDED: ["playerId", "obstacleId", "symbol", "counterAt"],
  LINE_RACE_COUNTER_FAILED: ["commandId", "playerId", "obstacleId", "reason"],
  LINE_RACE_OBSTACLE_CREATED: ["obstacleId", "obstacle"],
  LINE_RACE_OBSTACLE_FALLING: ["obstacleId", "fallingStartedAt"],
  LINE_RACE_OBSTACLE_ACTIVATED: ["obstacleId", "activatedAt", "counterDeadlineAt"],
  LINE_RACE_TRAVERSAL_STARTED: ["obstacleId", "playerId", "templateId", "traversalStartedAt", "traversalFinishAt"],
  LINE_RACE_TRAVERSAL_FINISHED: ["obstacleId", "playerId", "traversalFinishedAt", "accumulatedPenaltyMs"],
  LINE_RACE_OBSTACLE_REMOVED: ["obstacleId", "reason"],
  LINE_RACE_PROGRESS_UPDATED: ["serverTime", "players"],
  LINE_RACE_MATCH_FINISHED: ["roomId", "finishReason", "results", "startedAt", "finishedAt"],
  LINE_RACE_MATCH_SNAPSHOT: ["snapshot"],
};

export function parseLineRaceCommand(raw: string | unknown): LineRaceClientCommand {
  const message = parseObject(raw);
  const type = requiredString(message, "type");
  if (!COMMAND_TYPES.has(type)) throw new LineRaceMessageParseError(`Unsupported line-race command type: ${type}`);
  requiredUuid(message, "commandId");
  requiredUuid(message, "matchId");
  requiredString(message, "symbol");
  requiredEpoch(message, "recognizedAt");
  if (type === "LINE_RACE_COUNTER_COMMAND") requiredUuid(message, "obstacleId");
  return message as unknown as LineRaceClientCommand;
}

export function parseLineRaceEvent(raw: string | unknown): LineRaceServerEvent {
  const message = parseObject(raw);
  const type = requiredString(message, "type");
  if (!EVENT_TYPES.has(type)) throw new LineRaceMessageParseError(`Unsupported line-race event type: ${type}`);
  requiredUuid(message, "eventId");
  requiredUuid(message, "matchId");
  requiredInteger(message, "sequence");
  requiredEpoch(message, "occurredAt");
  for (const field of EVENT_FIELDS[type] ?? []) {
    if (!(field in message)) throw new LineRaceMessageParseError(`Missing ${field}.`);
  }
  return message as unknown as LineRaceServerEvent;
}

function parseObject(raw: string | unknown): Record<string, unknown> {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      throw new LineRaceMessageParseError("Line-race message is not valid JSON.");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LineRaceMessageParseError("Line-race message must be an object.");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: Record<string, unknown>, field: string): string {
  const item = value[field];
  if (typeof item !== "string" || item.length === 0) throw new LineRaceMessageParseError(`Invalid ${field}.`);
  return item;
}

function requiredUuid(value: Record<string, unknown>, field: string): void {
  const item = requiredString(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item)) {
    throw new LineRaceMessageParseError(`Invalid ${field} UUID.`);
  }
}

function requiredInteger(value: Record<string, unknown>, field: string): void {
  const item = value[field];
  if (!Number.isSafeInteger(item) || (item as number) < 0) throw new LineRaceMessageParseError(`Invalid ${field}.`);
}

function requiredEpoch(value: Record<string, unknown>, field: string): void {
  requiredInteger(value, field);
}
