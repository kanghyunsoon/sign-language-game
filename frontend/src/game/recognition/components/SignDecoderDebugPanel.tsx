import { useEffect, useState } from "react";
import type { DefaultContinuousSignDecoder, SignDecoderConfig, SignDecoderSnapshot } from "../temporal";

type DebugDecoder = Pick<DefaultContinuousSignDecoder, "getSnapshot" | "getConfig" | "updateConfig">;
type NumericDecoderKey = Exclude<keyof SignDecoderConfig, "minimumConfidenceBySymbol">;
const FIELDS: readonly { readonly key: NumericDecoderKey; readonly step: number }[] = [
  { key: "minimumConfidence", step: .01 }, { key: "candidateWindowSize", step: 1 },
  { key: "minimumCandidateVotes", step: 1 }, { key: "minimumStableDurationMs", step: 10 },
  { key: "movementThreshold", step: .005 }, { key: "maximumPredictionAgeMs", step: 10 },
  { key: "releasePoseDistanceThreshold", step: .01 }, { key: "releaseMinimumDurationMs", step: 10 },
  { key: "noHandReleaseDurationMs", step: 10 }, { key: "differentSymbolReleaseVotes", step: 1 },
];

export function SignDecoderDebugPanel({ decoder }: { readonly decoder?: DebugDecoder }): React.JSX.Element | null {
  const [snapshot, setSnapshot] = useState<SignDecoderSnapshot | null>(() => decoder?.getSnapshot() ?? null);
  const [config, setConfig] = useState<SignDecoderConfig | null>(() => decoder?.getConfig() ?? null);
  const [configError, setConfigError] = useState<string | null>(null);
  useEffect(() => {
    if (!decoder || !import.meta.env.DEV) return;
    setSnapshot(decoder.getSnapshot()); setConfig(decoder.getConfig());
    const timer = window.setInterval(() => setSnapshot(decoder.getSnapshot()), 100);
    return () => window.clearInterval(timer);
  }, [decoder]);
  if (!import.meta.env.DEV || !decoder || !snapshot || !config) return null;
  const update = (key: NumericDecoderKey, value: number) => {
    try { decoder.updateConfig({ [key]: value }); setConfig(decoder.getConfig()); setConfigError(null); }
    catch (cause) { setConfigError(cause instanceof Error ? cause.message : "Invalid decoder configuration"); }
  };
  return <details className="sign-decoder-debug"><summary>Temporal Decoder</summary>
    <div className="sign-decoder-metrics">
      <span>State <strong>{snapshot.state}</strong></span><span>Motion {snapshot.motion.averageVelocity.toFixed(3)} / max {snapshot.motion.maximumVelocity.toFixed(3)}</span>
      <span>Stable {snapshot.motion.stableDurationMs.toFixed(0)}ms</span><span>Candidate {snapshot.candidateSymbol ?? "-"} ({snapshot.candidateVotes})</span>
      <span>Confidence {snapshot.predictionConfidence?.toFixed(2) ?? "-"}</span><span>Confirmed {snapshot.lastConfirmedSymbol ?? "-"}</span>
      <span>Release distance {snapshot.releasePoseDistance.toFixed(3)}</span><span>Confirm latency {snapshot.lastConfirmationLatencyMs?.toFixed(0) ?? "-"}ms</span>
      <span>Dropped/Stale {snapshot.droppedPredictions}/{snapshot.stalePredictions}</span>
    </div>
    <div className="sign-decoder-config">{FIELDS.map(({ key, step }) => <label key={key}>{key}<input type="number" step={step} value={config[key]} onChange={(event) => update(key, Number(event.currentTarget.value))} /></label>)}</div>
    {configError && <small role="alert">{configError}</small>}
  </details>;
}
