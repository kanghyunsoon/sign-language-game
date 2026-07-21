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
  readonly roomId: string;
  readonly targetUserId?: string;
  readonly connectionId: string;
  readonly sequence: number;
  readonly sentAt: number;
  readonly payload: TPayload;
}

export interface ServerRtcSignalingEnvelope<TPayload> extends ClientRtcSignalingEnvelope<TPayload> {
  readonly senderUserId: string;
}

export interface RtcOfferPayload { readonly sdp: string }
export interface RtcAnswerPayload { readonly sdp: string }
export interface RtcIceCandidatePayload {
  readonly candidate: string;
  readonly sdpMid: string | null;
  readonly sdpMLineIndex: number | null;
  readonly usernameFragment?: string | null;
}
export interface RtcParticipantInfo { readonly userId: string; readonly displayName: string; readonly cameraEnabled: boolean }
export interface RtcParticipantSnapshotPayload { readonly roomId: string; readonly participants: readonly RtcParticipantInfo[] }
export interface RtcPeerLeftPayload { readonly userId: string }
export interface RtcMediaStateChangedPayload { readonly cameraEnabled: boolean; readonly microphoneEnabled: boolean }

export type ServerRtcSignalingMessage = ServerRtcSignalingEnvelope<unknown>;
export type ClientRtcSignalingMessage = ClientRtcSignalingEnvelope<unknown>;
