import { useEffect, useState } from "react";

import type {
  ActivePlayerSession,
  ActivePlayerSnapshot,
  PoseLandmark,
} from "../active-player";

const messages: Record<ActivePlayerSnapshot["state"], string> = {
  UNREGISTERED: "게임 참가자를 등록해 주세요.",
  REGISTERING: "한쪽 손을 머리 위로 들고 잠시 유지해 주세요.",
  LOCKED: "사용자 인식 완료",
  TEMPORARILY_LOST: "사용자를 다시 찾고 있습니다.",
  REIDENTIFYING: "등록 사용자를 다시 찾고 있습니다.",
  AMBIGUOUS: "등록한 사용자만 카메라 앞에 위치해 주세요.",
  USER_LOST: "등록 사용자를 찾지 못했습니다. 다시 등록해 주세요.",
};

const POSE_CONNECTIONS: readonly (readonly [number, number])[] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23],
  [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

export function ActivePlayerStatusOverlay({
  session,
  poseError,
  showDebug = false,
}: {
  readonly session?: ActivePlayerSession;
  readonly poseError?: string | null;
  readonly showDebug?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<ActivePlayerSnapshot | null>(
    () => session?.getSnapshot() ?? null,
  );
  useEffect(() => session?.subscribe(setSnapshot), [session]);
  if (!session || !snapshot) return null;

  return <>
    <div className={`active-player-status state-${snapshot.state.toLowerCase()}`} role="status">
      <strong>{poseError ? "자세 인식 오류" : snapshot.state === "LOCKED" ? "등록 완료" : "사용자 등록"}</strong>
      <span>{poseError ?? messages[snapshot.state]}</span>
      {snapshot.state === "REGISTERING" && <progress max={1} value={snapshot.registrationProgress} />}
      {(snapshot.state === "UNREGISTERED" || snapshot.state === "USER_LOST" || snapshot.state === "AMBIGUOUS") &&
        <button type="button" onClick={() => session.beginRegistration()}>다시 등록</button>}
    </div>

    {showDebug && import.meta.env.DEV && <div className="active-player-debug" aria-label="Active Player debug overlay">
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {snapshot.tracks.map((track) => <g key={track.trackId} className={track.trackId === snapshot.activeTrackId ? "is-active" : "is-other"}>
          {POSE_CONNECTIONS.map(([from, to]) => <PoseLine key={`${from}-${to}`} from={track.poseLandmarks[from]} to={track.poseLandmarks[to]} />)}
          {track.poseLandmarks.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={.006} />)}
        </g>)}
      </svg>
      {snapshot.tracks.flatMap((track) => {
        const score = snapshot.scores.find((item) => item.trackId === track.trackId);
        return [
          <div key={track.trackId} className={track.trackId === snapshot.activeTrackId ? "is-active" : ""} style={{ left: `${track.boundingBox.x * 100}%`, top: `${track.boundingBox.y * 100}%`, width: `${track.boundingBox.width * 100}%`, height: `${track.boundingBox.height * 100}%` }}>
            <small>{track.trackId} · {track.state}<br />total {score?.totalScore.toFixed(2) ?? "-"} · pose {score?.poseSimilarity.toFixed(2) ?? "-"} · appearance {score?.appearanceSimilarity.toFixed(2) ?? "-"}</small>
          </div>,
          <i key={`${track.trackId}-predicted`} className="predicted" style={{ left: `${track.predictedBoundingBox.x * 100}%`, top: `${track.predictedBoundingBox.y * 100}%`, width: `${track.predictedBoundingBox.width * 100}%`, height: `${track.predictedBoundingBox.height * 100}%` }} />,
        ];
      })}
      <output>poses {snapshot.detectedPoseCount} · active {snapshot.activeTrackId ?? "-"} · {snapshot.state} · lost {snapshot.lostDurationMs}ms · switch {snapshot.idSwitchCount}</output>
    </div>}
  </>;
}

function PoseLine({ from, to }: { readonly from?: PoseLandmark; readonly to?: PoseLandmark }) {
  if (!from || !to || (from.visibility ?? 1) < .4 || (to.visibility ?? 1) < .4) return null;
  return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
}
