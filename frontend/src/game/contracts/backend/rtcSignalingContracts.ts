import type { EpochMillis, ExternalUuid } from "./soloContracts";

export type RtcSignalingMessageType =
  | "RTC_PARTICIPANT_SNAPSHOT"
  | "RTC_PEER_JOINED"
  | "RTC_PEER_LEFT"
  | "RTC_OFFER"
  | "RTC_ANSWER"
  | "RTC_ICE_CANDIDATE"
  | "RTC_ICE_RESTART_REQUEST"
  | "RTC_MEDIA_STATE_CHANGED";

export interface ClientRtcSignalingEnvelope<TPayload> {
  readonly type: RtcSignalingMessageType;
  readonly roomId: ExternalUuid;
  readonly targetUserId?: ExternalUuid;
  readonly connectionId: string;
  readonly sequence: number;
  readonly sentAt: EpochMillis;
  readonly payload: TPayload;
}

export interface ServerRtcSignalingEnvelope<TPayload> extends ClientRtcSignalingEnvelope<TPayload> {
  readonly senderUserId: ExternalUuid;
}

export interface RtcOfferPayload { readonly sdp: string; }
export interface RtcAnswerPayload { readonly sdp: string; }
export interface RtcIceCandidatePayload {
  readonly candidate: string;
  readonly sdpMid: string | null;
  readonly sdpMLineIndex: number | null;
  readonly usernameFragment?: string | null;
}
export interface RtcParticipantSnapshotPayload {
  readonly roomId: ExternalUuid;
  readonly participants: readonly RtcParticipant[];
}
export interface RtcParticipant {
  readonly userId: ExternalUuid;
  readonly displayName: string;
  readonly cameraEnabled: boolean;
}
export interface RtcPeerJoinedPayload extends RtcParticipant {}
export interface RtcPeerLeftPayload { readonly userId: ExternalUuid; }
export interface RtcMediaStateChangedPayload {
  readonly cameraEnabled: boolean;
  readonly microphoneEnabled: boolean;
}
export interface RtcIceRestartRequestPayload {}
export interface RtcParticipantSnapshotRequestPayload {}

export interface WebRtcClientConfig {
  readonly iceServers: readonly WebRtcIceServer[];
}
export interface WebRtcIceServer {
  readonly urls: string | readonly string[];
  readonly username?: string;
  readonly credential?: string;
}

export type ClientRtcSignalingMessage =
  | ClientRtcSignalingEnvelope<RtcParticipantSnapshotRequestPayload>
  | ClientRtcSignalingEnvelope<RtcOfferPayload>
  | ClientRtcSignalingEnvelope<RtcAnswerPayload>
  | ClientRtcSignalingEnvelope<RtcIceCandidatePayload>
  | ClientRtcSignalingEnvelope<RtcIceRestartRequestPayload>
  | ClientRtcSignalingEnvelope<RtcMediaStateChangedPayload>;

