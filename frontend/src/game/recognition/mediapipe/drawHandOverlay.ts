import { HAND_CONNECTIONS, landmarkToCanvasPoint, type TrackedHand } from "../../../shared/mediapipe";
import { HAND_BONES } from "../feedback/handConnections";
import type { BoneFeedback } from "../feedback/types";
import type { HandLandmark } from "../types/landmark";

export interface HandOverlayState {
  readonly referenceLandmarks?: readonly HandLandmark[];
  readonly feedback?: readonly BoneFeedback[];
}

export function drawHandOverlay(
  context: CanvasRenderingContext2D,
  hands: readonly TrackedHand[],
  overlayStates: readonly HandOverlayState[] = [],
): void {
  const { width, height } = context.canvas;
  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const [handIndex, hand] of hands.entries()) {
    const overlay = overlayStates[handIndex];
    if (overlay?.referenceLandmarks) {
      drawReferenceSkeleton(context, overlay.referenceLandmarks);
    }
    const feedbackByBone = new Map(overlay?.feedback?.map((item) => [item.boneId, item]));
    context.fillStyle = "#ffffff";
    context.lineWidth = Math.max(2, width / 320);

    for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
      context.strokeStyle = strokeColor(
        feedbackByBone.get(boneIdForConnection(startIndex, endIndex)),
        hand.handedness,
      );
      const start = landmarkToCanvasPoint(hand.landmarks[startIndex], width, height);
      const end = landmarkToCanvasPoint(hand.landmarks[endIndex], width, height);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }

    for (const landmark of hand.landmarks) {
      const point = landmarkToCanvasPoint(landmark, width, height);
      context.beginPath();
      context.arc(point.x, point.y, Math.max(2.5, width / 210), 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawReferenceSkeleton(
  context: CanvasRenderingContext2D,
  landmarks: readonly HandLandmark[],
): void {
  const { width, height } = context.canvas;
  context.save();
  context.strokeStyle = "rgba(96, 194, 232, 0.78)";
  context.lineWidth = Math.max(1.5, width / 430);
  context.setLineDash([6, 5]);
  for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
    const startLandmark = landmarks[startIndex];
    const endLandmark = landmarks[endIndex];
    if (!startLandmark || !endLandmark) continue;
    const start = landmarkToCanvasPoint(startLandmark, width, height);
    const end = landmarkToCanvasPoint(endLandmark, width, height);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  context.restore();
}

function boneIdForConnection(startIndex: number, endIndex: number): string {
  return HAND_BONES.find((bone) => bone.startIndex === startIndex && bone.endIndex === endIndex)?.id ?? "";
}

function strokeColor(feedback: BoneFeedback | undefined, handedness: TrackedHand["handedness"]): string {
  if (feedback?.status === "WRONG") return "#e03131";
  if (feedback?.status === "CLOSE") return "#f59f00";
  return handedness === "LEFT" ? "#20c997" : "#ffd43b";
}
