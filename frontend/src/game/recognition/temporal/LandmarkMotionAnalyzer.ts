import { palmScale } from "./LandmarkPoseDistance";
import { EMPTY_MOTION_SNAPSHOT, type LandmarkMotionSnapshot, type NormalizedLandmark } from "./signDecoderTypes";

const FINGER_INDICES = [4, 8, 12, 16, 20] as const;

// Frontal fingerspelling (ㅓ, ㅕ, ㅔ, ㅖ) points the fingers at the camera. MediaPipe then
// loses depth ordering on the occluded fingertips and the landmarks oscillate back and
// forth between frames without actually going anywhere. That inflates the per-frame
// velocity, keeps the decoder in MOVING, and clearCandidate() wipes the candidate on every
// frame, so nothing is ever confirmed until the user rotates the wrist out of the
// degenerate pose. Real motion travels in one direction, so compare the net displacement
// against the path actually walked over a short window and scale the velocity by that
// ratio. Jitter walks a long path with almost no net displacement and gets suppressed;
// a real transition keeps a ratio near 1 and passes through unchanged.
//
// The ratio is squared before it is applied. A plain linear scale is not enough: with a
// 5-frame window the ratio of pure alternation swings between 0 and 0.25 depending on
// window parity, which is still enough to flip MOVING back on every other frame.
const DIRECTIONALITY_WINDOW = 5;
const DIRECTIONALITY_FULL_CREDIT = 0.55;
const DIRECTIONALITY_FLOOR = 0.1;

export interface LandmarkMotionAnalyzer {
  analyze(landmarks: readonly NormalizedLandmark[], capturedAt: number, movementThreshold: number): LandmarkMotionSnapshot;
  reset(): void;
}

export class NormalizedLandmarkMotionAnalyzer implements LandmarkMotionAnalyzer {
  private previous: readonly NormalizedLandmark[] | null = null;
  private previousAt = Number.NEGATIVE_INFINITY;
  private stableSince: number | null = null;
  private snapshot: LandmarkMotionSnapshot = EMPTY_MOTION_SNAPSHOT;
  private readonly history: NormalizedLandmark[][] = [];

  analyze(landmarks: readonly NormalizedLandmark[], capturedAt: number, movementThreshold: number): LandmarkMotionSnapshot {
    if (landmarks.length !== 21 || capturedAt <= this.previousAt) return this.snapshot;
    if (!this.previous) {
      this.previous = copy(landmarks);
      this.previousAt = capturedAt;
      this.stableSince = capturedAt;
      this.pushHistory(landmarks);
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
    this.pushHistory(landmarks);
    // Suppress non-directional MediaPipe jitter before thresholding.
    const jitterRatio = this.directionality();
    const credited = clamp(jitterRatio / DIRECTIONALITY_FULL_CREDIT, 0, 1);
    const jitterFactor = Math.max(credited * credited, DIRECTIONALITY_FLOOR);
    // Finger articulation is weighted more than pure wrist translation.
    const motionValue = Math.max(fingerVelocity, averageVelocity * 0.75) * jitterFactor;
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
      jitterRatio,
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
    this.history.length = 0;
  }

  private pushHistory(landmarks: readonly NormalizedLandmark[]): void {
    const scale = palmScale(landmarks);
    this.history.push(landmarks.map((point) => ({ x: point.x / scale, y: point.y / scale, z: point.z / scale })));
    if (this.history.length > DIRECTIONALITY_WINDOW) this.history.shift();
  }

  // Net displacement divided by the path walked. 1 = every frame moved the same way,
  // near 0 = the landmarks jittered in place. Needs at least three frames to tell them apart.
  private directionality(): number {
    if (this.history.length < 3) return 1;
    const first = this.history[0]!;
    const last = this.history[this.history.length - 1]!;
    let path = 0;
    for (let frame = 1; frame < this.history.length; frame += 1) {
      const before = this.history[frame - 1]!;
      const current = this.history[frame]!;
      for (let point = 0; point < current.length; point += 1) path += distance(before[point]!, current[point]!);
    }
    if (path <= 1e-9) return 1;
    let net = 0;
    for (let point = 0; point < last.length; point += 1) net += distance(first[point]!, last[point]!);
    return Math.min(1, net / path);
  }
}

function copy(points: readonly NormalizedLandmark[]): NormalizedLandmark[] { return points.map((point) => ({ ...point })); }
function distance(a: NormalizedLandmark, b: NormalizedLandmark): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
