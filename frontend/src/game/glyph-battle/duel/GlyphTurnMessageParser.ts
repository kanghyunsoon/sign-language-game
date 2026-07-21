import { LineRaceMessageParseError } from "../contracts";
import type { GlyphTurnChoiceCommand, GlyphTurnServerEvent } from "./GlyphTurnMatchContract";

const EVENT_TYPES = new Set(["GLYPH_TURN_CHOICE_LOCKED", "GLYPH_TURN_RESOLVED", "GLYPH_DUEL_SNAPSHOT"]);

/** Parses only the public wire shape of the replacement Glyph Turn Match module. */
export function parseGlyphTurnChoiceCommand(raw: string | unknown): GlyphTurnChoiceCommand {
  const message = parseObject(raw);
  if (requiredString(message, "type") !== "GLYPH_TURN_CHOICE_COMMAND") throw new LineRaceMessageParseError("Unsupported glyph-turn command type.");
  requiredUuid(message, "commandId");
  requiredUuid(message, "matchId");
  requiredPositiveInteger(message, "turn");
  requiredString(message, "symbol");
  requiredEpoch(message, "chosenAt");
  return message as unknown as GlyphTurnChoiceCommand;
}

export function parseGlyphTurnServerEvent(raw: string | unknown): GlyphTurnServerEvent {
  const message = parseObject(raw);
  const type = requiredString(message, "type");
  if (!EVENT_TYPES.has(type)) throw new LineRaceMessageParseError(`Unsupported glyph-turn event type: ${type}`);
  requiredUuid(message, "eventId");
  requiredUuid(message, "matchId");
  requiredInteger(message, "sequence");
  requiredEpoch(message, "occurredAt");
  requiredPositiveInteger(message, "turn");
  if (type === "GLYPH_TURN_CHOICE_LOCKED") {
    requiredUuid(message, "playerId");
    for (const secret of ["symbol", "role", "element"]) if (secret in message) throw new LineRaceMessageParseError(`Locked choice must not contain ${secret}.`);
    requiredEpoch(message, "turnEndsAt");
  } else if (type === "GLYPH_TURN_RESOLVED") {
    requiredPair(message, "choices");
    requiredPair(message, "fighters");
  } else {
    requiredEpoch(message, "serverTime");
    requiredStringArray(message, "lockedPlayerIds");
    requiredPair(message, "fighters");
    const phase = requiredString(message, "phase");
    if (!["PLANNING", "REVEAL", "FINISHED"].includes(phase)) throw new LineRaceMessageParseError("Invalid phase.");
    if (phase === "PLANNING") requiredEpoch(message, "turnEndsAt");
  }
  return message as unknown as GlyphTurnServerEvent;
}

function parseObject(raw: string | unknown): Record<string, unknown> {
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw) as unknown; } catch { throw new LineRaceMessageParseError("Glyph-turn message is not valid JSON."); }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LineRaceMessageParseError("Glyph-turn message must be an object.");
  return value as Record<string, unknown>;
}
function requiredString(value: Record<string, unknown>, field: string): string { const item = value[field]; if (typeof item !== "string" || !item.length) throw new LineRaceMessageParseError(`Invalid ${field}.`); return item; }
function requiredUuid(value: Record<string, unknown>, field: string): void { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requiredString(value, field))) throw new LineRaceMessageParseError(`Invalid ${field} UUID.`); }
function requiredInteger(value: Record<string, unknown>, field: string): void { const item = value[field]; if (!Number.isSafeInteger(item) || (item as number) < 0) throw new LineRaceMessageParseError(`Invalid ${field}.`); }
function requiredPositiveInteger(value: Record<string, unknown>, field: string): void { requiredInteger(value, field); if ((value[field] as number) < 1) throw new LineRaceMessageParseError(`Invalid ${field}.`); }
function requiredEpoch(value: Record<string, unknown>, field: string): void { requiredInteger(value, field); }
function requiredPair(value: Record<string, unknown>, field: string): void { if (!Array.isArray(value[field]) || value[field].length !== 2) throw new LineRaceMessageParseError(`Invalid ${field}.`); }
function requiredStringArray(value: Record<string, unknown>, field: string): void { if (!Array.isArray(value[field]) || value[field].some((item) => typeof item !== "string")) throw new LineRaceMessageParseError(`Invalid ${field}.`); }
