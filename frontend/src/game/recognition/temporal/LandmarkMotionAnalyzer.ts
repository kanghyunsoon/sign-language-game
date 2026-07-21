import { palmScale } from "./LandmarkPoseDistance";
import { EMPTY_MOTION_SNAPSHOT, type LandmarkMotionSnapshot, type NormalizedLandmark } from "./signDecoderTypes";

const FINGER_INDICES = [4, 8, 12, 16, 20] as const;

export interface LandmarkMotionAnalyzer {
  analyze(landmarks: readonly NormalizedLandmark[], capturedAt: number, movementThreshold: number): LandmarkMotionSnapshot;
  reset(): void;
}

export class NormalizedLandmarkMotionAnalyzer implements LandmarkMotionAnalyzer {
  private previous: readonly NormalizedLandmark[] | null = null;
  private previousAt = Number.NEGATIVE_INFINITY;
  private stableSince: number | null = null;
  private snapshot: LandmarkMotionSnapshot = EMPTY_MOTION_SNAPSHOT;

  analyze(landmarks: readonly NormalizedLandmark[], capturedAt: number, movementThreshold: number): LandmarkMotionSnapshot {
    if (landmarks.length !== 21 || capturedAt <= this.previousAt) return this.snapshot;
    if (!this.previous) {
      this.previous = copy(landmarks);
      this.previousAt = capturedAt;
      this.stableSince = capturedAt;
      this.snapshot = { ...EMPTY_MOTION_SNAPSHOT, stableDurationMs: 0 };
      return this.snapshot;
    }
    const scale = Math.max(1e-6, (palmScale(this.previous) + palmScale(landmarks)) / 2);
    const elapsedScale = (1000 / 24) / Math.max(1, capturedAt - this.previousAt);
    const movements = landmarks.map((point, index) => distance(point, this.previous![index]!) / scale * elapsedScale);
    const wristVelocity = movements[0] ?? 0;
    const fingerVelocity = FINGER_INDICES.reduce((sum, index) => sum + movements[index]!, 0) / FINGER_INDICES.length;
    const averageVelocity = movements.reduce((sum, value) => sum + value, 0) / movements.length;
    const maximumVelocity = Math.max(...movements);
    // Finger articulation is weighted more than pure wrist translation.
    const motionValue = Math.max(fingerVelocity, averageVelocity * 0.75);
    // Hysteresis prevents normal MediaPipe landmark jitter from alternating
    // MOVING/TRACKING on every frame while still blocking a real transition.
    const moving = motionValue >= movementThreshold * (this.snapshot.moving ? .65 : 1);
    if (moving) this.stableSince = null;
    else if (this.stableSince === null) this.stableSince = capturedAt;
    this.snapshot = {
      averageVelocity,
      maximumVelocity,
      wristVelocity,
      fingerVelocity,
      stableDurationMs: this.stableSince === null ? 0 : Math.max(0, capturedAt - this.stableSince),
      moving,
    };
    this.previous = copy(landmarks);
    this.previousAt = capturedAt;
    return this.snapshot;
  }

  reset(): void {
    this.previous = null;
    this.previousAt = Number.NEGATIVE_INFINITY;
    this.stableSince = null;
    this.snapshot = EMPTY_MOTION_SNAPSHOT;
  }
}

function copy(points: readonly NormalizedLandmark[]): NormalizedLandmark[] { return points.map((point) => ({ ...point })); }
function distance(a: NormalizedLandmark, b: NormalizedLandmark): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
