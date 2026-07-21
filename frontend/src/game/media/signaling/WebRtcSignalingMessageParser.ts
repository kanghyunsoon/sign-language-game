import type { ServerRtcSignalingMessage } from "./WebRtcSignalingMessages";

const TYPES = new Set([
  "RTC_PARTICIPANT_SNAPSHOT", "RTC_PEER_JOINED", "RTC_PEER_LEFT", "RTC_OFFER", "RTC_ANSWER",
  "RTC_ICE_CANDIDATE", "RTC_ICE_RESTART_REQUEST", "RTC_MEDIA_STATE_CHANGED",
]);

export function parseWebRtcSignalingMessage(raw: string): ServerRtcSignalingMessage {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || !TYPES.has(value.type as string)) throw new Error("Unsupported RTC signaling message type.");
  for (const field of ["roomId", "senderUserId", "connectionId"] as const) {
    if (typeof value[field] !== "string" || value[field].length === 0) throw new Error(`Invalid RTC signaling ${field}.`);
  }
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0 || !Number.isFinite(value.sentAt)) {
    throw new Error("Invalid RTC signaling sequence or sentAt.");
  }
  if (!isRecord(value.payload)) throw new Error("Invalid RTC signaling payload.");
  return value as unknown as ServerRtcSignalingMessage;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
