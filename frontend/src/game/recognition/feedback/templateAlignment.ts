import type { HandLandmark, Handedness } from "../types/landmark";
import { MIDDLE_MCP_INDEX, WRIST_INDEX, validateLandmarks } from "./normalizeLandmarks";
import { rotateVectorAroundZ, subtractVector, vectorLength } from "./vector";

export function alignTemplateToCurrentHand(
  normalizedTemplate: readonly HandLandmark[],
  currentLandmarks: readonly HandLandmark[],
  handedness: Handedness,
): readonly HandLandmark[] {
  validateLandmarks(normalizedTemplate);
  validateLandmarks(currentLandmarks);
  const wrist = currentLandmarks[WRIST_INDEX];
  const middleMcp = currentLandmarks[MIDDLE_MCP_INDEX];
  if (!wrist || !middleMcp) throw new RangeError("Missing palm alignment landmarks");
  const direction = subtractVector(middleMcp, wrist);
  const palmLength = vectorLength(direction);
  const planarLength = Math.hypot(direction.x, direction.y);
  if (palmLength <= 1e-8 || planarLength <= 1e-8) throw new RangeError("Cannot align template to zero-length palm");
  const normalizationRotation = Math.PI / 2 - Math.atan2(direction.y, direction.x);
  return normalizedTemplate.map((landmark) => {
    const unmirrored = handedness === "LEFT" ? { ...landmark, x: -landmark.x } : landmark;
    const unrotated = rotateVectorAroundZ(unmirrored, -normalizationRotation);
    return {
      x: unrotated.x * palmLength + wrist.x,
      y: unrotated.y * palmLength + wrist.y,
      z: unrotated.z * palmLength + wrist.z,
    };
  });
}
