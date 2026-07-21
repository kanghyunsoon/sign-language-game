import type { ActiveHandSnapshot } from "../active-player";

const messages: Record<NonNullable<ActiveHandSnapshot["reason"]>, string> = {
  NO_ACTIVE_PLAYER: "먼저 게임 사용자를 등록해 주세요.",
  NO_HAND: "등록한 사용자의 손을 카메라에 보여 주세요.",
  POSE_ANCHOR_UNAVAILABLE: "어깨부터 손목까지 보이도록 자세를 조정해 주세요.",
  LOW_CONFIDENCE: "등록한 사용자의 손인지 확인하고 있습니다.",
  AMBIGUOUS: "손이 겹쳤습니다. 등록한 사용자의 손만 보여 주세요.",
  SUDDEN_JUMP: "손 위치가 갑자기 바뀌어 입력을 잠시 멈췄습니다.",
  TEMPORARILY_LOST: "등록한 사용자의 손을 다시 찾고 있습니다.",
};

export function ActiveHandStatusOverlay({
  snapshot,
  showDebug = false,
}: {
  readonly snapshot?: ActiveHandSnapshot;
  readonly showDebug?: boolean;
}) {
  if (!snapshot) return null;
  return <>
    {!snapshot.inputAllowed && <div className="active-hand-status" role="status">
      {messages[snapshot.reason ?? "NO_HAND"]}
    </div>}
    {showDebug && import.meta.env.DEV && <div className="active-hand-debug" aria-label="Active Hand debug overlay">
      <output>hands {snapshot.detectedHandCount} · active {snapshot.activeTrack?.handId ?? "-"} · input {snapshot.inputAllowed ? "ON" : "OFF"} · session {snapshot.session?.sessionId ?? "-"}</output>
      {snapshot.scores.map((score) => <small key={score.handDetectionId}>
        {score.handDetectionId}: total {score.totalScore.toFixed(2)} · wrist {score.poseWristDistanceScore.toFixed(2)} · temporal {score.temporalContinuityScore.toFixed(2)} · mask {score.segmentationScore?.toFixed(2) ?? "N/A"}{snapshot.selected?.detectionId === score.handDetectionId ? " · SELECTED" : ""}
      </small>)}
    </div>}
  </>;
}
