import type { PersonTrack, PoseLandmark } from "./activePlayerTypes";
import type { Handedness, HandLandmark } from "../types/landmark";

export interface Point3D { readonly x: number; readonly y: number; readonly z: number; }
export interface ActivePlayerArmAnchors { readonly leftShoulder?: Point3D; readonly leftElbow?: Point3D; readonly leftWrist?: Point3D; readonly rightShoulder?: Point3D; readonly rightElbow?: Point3D; readonly rightWrist?: Point3D; }
export interface ActiveHandDetectionConfig { readonly maximumDetectedHands: number; readonly minimumHandDetectionConfidence: number; readonly minimumHandPresenceConfidence: number; readonly minimumTrackingConfidence: number; }
export const DEFAULT_ACTIVE_HAND_DETECTION_CONFIG: ActiveHandDetectionConfig = Object.freeze({ maximumDetectedHands: 4, minimumHandDetectionConfidence: .6, minimumHandPresenceConfidence: .6, minimumTrackingConfidence: .6 });
export interface HandCandidate { readonly detectionId: string; readonly landmarks: readonly HandLandmark[]; readonly handedness: Handedness; readonly handednessScore: number; readonly wrist: Point3D; readonly detectedAt: number; }
export interface HandOwnershipScore { readonly handDetectionId: string; readonly activePlayerTrackId: string; readonly poseWristDistanceScore: number; readonly armDirectionScore: number; readonly temporalContinuityScore: number; readonly handednessScore: number; readonly segmentationScore?: number; readonly activePlayerBoundsScore: number; readonly totalScore: number; }
export interface HandOwnershipWeights { readonly poseWristDistance: number; readonly armDirection: number; readonly temporalContinuity: number; readonly handedness: number; readonly segmentation: number; readonly activePlayerBounds: number; }
export interface HandOwnershipConfig { readonly minimumOwnershipScore: number; readonly minimumScoreGap: number; readonly temporaryLostGraceMs: number; readonly maximumMissedFrames: number; readonly maximumNormalizedHandJump: number; readonly weights: HandOwnershipWeights; }
export const DEFAULT_HAND_OWNERSHIP_CONFIG: HandOwnershipConfig = Object.freeze({ minimumOwnershipScore: .62, minimumScoreGap: .05, temporaryLostGraceMs: 900, maximumMissedFrames: 12, maximumNormalizedHandJump: 1.5, weights: Object.freeze({ poseWristDistance: .3, armDirection: .15, temporalContinuity: .2, handedness: .1, segmentation: .15, activePlayerBounds: .1 }) });
export interface ActiveHandTrack { readonly handId: string; readonly ownerTrackId: string; readonly handedness: Handedness; readonly landmarks: readonly HandLandmark[]; readonly lastSeenAt: number; readonly missedFrames: number; readonly ownershipConfidence: number; }
export interface ActiveHandSession { readonly sessionId: string; readonly activePlayerTrackId: string; readonly activeHandId: string; readonly startedAt: number; }
export type HandOwnershipBlockReason = "NO_ACTIVE_PLAYER" | "NO_HAND" | "POSE_ANCHOR_UNAVAILABLE" | "LOW_CONFIDENCE" | "AMBIGUOUS" | "SUDDEN_JUMP" | "TEMPORARILY_LOST";
export interface HandOwnerResolution { readonly selected?: HandCandidate; readonly scores: readonly HandOwnershipScore[]; readonly inputAllowed: boolean; readonly reason?: HandOwnershipBlockReason; }
export interface ActiveHandSnapshot extends HandOwnerResolution { readonly detectedHandCount: number; readonly activeTrack?: ActiveHandTrack; readonly session?: ActiveHandSession; }
export interface SegmentationMask { readonly width: number; readonly height: number; readonly data: Float32Array; }
export function extractArmAnchors(track: PersonTrack): ActivePlayerArmAnchors { const points=track.poseLandmarks;return{leftShoulder:visible(points[11]),leftElbow:visible(points[13]),leftWrist:visible(points[15]),rightShoulder:visible(points[12]),rightElbow:visible(points[14]),rightWrist:visible(points[16])}; }
function visible(point: PoseLandmark | undefined): Point3D | undefined { return point&&(point.visibility??1)>=.5?{x:point.x,y:point.y,z:point.z}:undefined; }
