import type { SignRecognitionEvent } from "../types/events";

export type ServerMessage = Exclude<SignRecognitionEvent, { readonly type: "CONNECTION_STATE" | "CONTEXTUAL_SELECTION" }>;

export class ServerMessageError extends Error {
  constructor(message: string) { super(message); this.name = "ServerMessageError"; }
}

export function parseServerMessage(raw: string): ServerMessage {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new ServerMessageError("Server message is not valid JSON"); }
  if (!isRecord(value) || typeof value.type !== "string") throw new ServerMessageError("Server message must be an object with a type");
  switch (value.type) {
    case "CAPABILITIES": return {
      type: "CAPABILITIES", modelVersion: requiredString(value, "modelVersion"),
      supportedSymbols: requiredStrings(value, "supportedSymbols"), sequenceLength: requiredNonNegativeInteger(value, "sequenceLength"),
      competitiveSymbols: optionalStrings(value, "competitiveSymbols"), confidenceThresholds: optionalNumberRecord(value, "confidenceThresholds"),
      confirmationAuthority: optionalConfirmationAuthority(value),
    };
    case "PREDICTION": return parsePrediction(value);
    case "SIGN_CONFIRMED": return { type: "SIGN_CONFIRMED", symbol: requiredString(value, "symbol"), confidence: requiredProbability(value, "confidence"), confirmedAt: requiredNonNegativeInteger(value, "confirmedAt"), modelVersion: requiredString(value, "modelVersion") };
    case "HAND_RELEASED": return { type: "HAND_RELEASED", releasedAt: requiredNonNegativeInteger(value, "releasedAt") };
    case "ERROR": return { type: "ERROR", code: requiredString(value, "code"), message: requiredString(value, "message") };
    default: throw new ServerMessageError(`Unsupported server message type: ${value.type}`);
  }
}

function parsePrediction(value: Record<string, unknown>): Extract<ServerMessage, { readonly type: "PREDICTION" }> {
  const frameId = requiredNonNegativeInteger(value, "frameId"), symbol = requiredString(value, "symbol");
  const confidence = requiredProbability(value, "confidence"), isStable = requiredBoolean(value, "isStable");
  const predictedAt = requiredNonNegativeInteger(value, "predictedAt"), rawCandidates = value.topCandidates;
  const stage = optionalStage(value), verdict = optionalVerdict(value), feedback = optionalStrings(value, "feedback");
  if (rawCandidates === undefined) return { type: "PREDICTION", frameId, symbol, confidence, isStable, predictedAt, stage, verdict, feedback };
  if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) throw new ServerMessageError("topCandidates must be a non-empty array");
  const topCandidates = rawCandidates.map((candidate, index) => {
    if (!isRecord(candidate)) throw new ServerMessageError(`topCandidates[${index}] must be an object`);
    return { symbol: requiredString(candidate, "symbol"), confidence: requiredProbability(candidate, "confidence") };
  });
  if (new Set(topCandidates.map((candidate) => candidate.symbol)).size !== topCandidates.length) throw new ServerMessageError("topCandidates symbols must be unique");
  if (topCandidates.some((candidate, index) => index > 0 && candidate.confidence > topCandidates[index - 1]!.confidence)) throw new ServerMessageError("topCandidates must be sorted by confidence descending");
  if (topCandidates[0]!.symbol !== symbol || topCandidates[0]!.confidence !== confidence) throw new ServerMessageError("PREDICTION top-1 must match topCandidates[0]");
  return { type: "PREDICTION", frameId, symbol, confidence, isStable, predictedAt, topCandidates, stage, verdict, feedback };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function requiredString(value: Record<string, unknown>, field: string): string { const item = value[field]; if (typeof item !== "string" || item.length === 0) throw new ServerMessageError(`${field} must be a non-empty string`); return item; }
function requiredStrings(value: Record<string, unknown>, field: string): readonly string[] { const item = value[field]; if (!Array.isArray(item) || !item.every((symbol) => typeof symbol === "string" && symbol.length > 0)) throw new ServerMessageError(`${field} must be an array of non-empty strings`); return item; }
function requiredFiniteNumber(value: Record<string, unknown>, field: string): number { const item = value[field]; if (typeof item !== "number" || !Number.isFinite(item)) throw new ServerMessageError(`${field} must be a finite number`); return item; }
function requiredProbability(value: Record<string, unknown>, field: string): number { const item = requiredFiniteNumber(value, field); if (item < 0 || item > 1) throw new ServerMessageError(`${field} must be between 0 and 1`); return item; }
function requiredNonNegativeInteger(value: Record<string, unknown>, field: string): number { const item = value[field]; if (typeof item !== "number" || !Number.isInteger(item) || item < 0) throw new ServerMessageError(`${field} must be a non-negative integer`); return item; }
function requiredBoolean(value: Record<string, unknown>, field: string): boolean { const item = value[field]; if (typeof item !== "boolean") throw new ServerMessageError(`${field} must be a boolean`); return item; }
function optionalStrings(value: Record<string, unknown>, field: string): readonly string[] | undefined { return value[field] === undefined ? undefined : requiredStrings(value, field); }
function optionalNumberRecord(value: Record<string, unknown>, field: string): Readonly<Record<string, number>> | undefined { const item = value[field]; if (item === undefined) return undefined; if (!isRecord(item) || Object.values(item).some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 || entry > 1)) throw new ServerMessageError(`${field} must map symbols to thresholds between 0 and 1`); return item as Record<string, number>; }
function optionalConfirmationAuthority(value: Record<string, unknown>): "FRONTEND_TEMPORAL_DECODER" | undefined { const item = value.confirmationAuthority; if (item === undefined) return undefined; if (item !== "FRONTEND_TEMPORAL_DECODER") throw new ServerMessageError("Unsupported confirmation authority"); return item; }
function optionalStage(value: Record<string, unknown>): "live" | "final" | undefined { const item = value.stage; if (item === undefined) return undefined; if (item !== "live" && item !== "final") throw new ServerMessageError("stage must be live or final"); return item; }
function optionalVerdict(value: Record<string, unknown>): "correct" | "wrong-form" | "out-of-range" | "detail" | undefined {
  const item = value.verdict;
  if (item === undefined) return undefined;
  if (item !== "correct" && item !== "wrong-form" && item !== "out-of-range" && item !== "detail") throw new ServerMessageError("Unsupported verdict");
  return item;
}
