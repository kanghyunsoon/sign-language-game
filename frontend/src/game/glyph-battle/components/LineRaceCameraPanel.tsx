import { HandCamera, type ActivePlayerSession, type DefaultContinuousSignDecoder, type GameRecognitionPipelineAdapter, type HandLandmarkFrame } from "../../recognition";
import type { LineRaceInputState } from "../recognition";
import type { RecognitionPerformanceMonitor } from "../../recognition";
import styles from "./LineRaceRecognition.module.css";

export interface LineRaceCameraPanelProps {
  readonly stream: MediaStream | null;
  readonly input: LineRaceInputState;
  readonly cameraError: string | null;
  readonly performanceMonitor?: RecognitionPerformanceMonitor;
  readonly temporalDecoder?: Pick<DefaultContinuousSignDecoder, "getSnapshot" | "getConfig" | "updateConfig">;
  readonly activePlayerSession?: ActivePlayerSession;
  readonly recognitionSession?: GameRecognitionPipelineAdapter;
  readonly onLandmarkFrame: (frame: HandLandmarkFrame) => void;
  readonly onHandNotDetected: (capturedAt: number) => void;
}

export function LineRaceCameraPanel({ stream, input, cameraError, performanceMonitor, temporalDecoder, activePlayerSession, recognitionSession, onLandmarkFrame, onHandNotDetected }: LineRaceCameraPanelProps) {
  return (
    <section className={styles.panel} aria-label="라인 레이스 내 카메라">
      <h2>내 지문자 입력</h2>
      {cameraError ? <p className={styles.error} role="alert">{cameraError}</p> : null}
      {stream ? (
        <HandCamera
          sharedStream={stream}
          autoStart
          compact
          performanceMonitor={performanceMonitor}
          temporalDecoder={temporalDecoder}
          activePlayerSession={activePlayerSession}
          recognitionSession={recognitionSession}
          prediction={input.prediction}
          connectionState={input.connectionState}
          connectionError={input.error}
          awaitingHandRelease={input.lockedSymbol !== null}
          onLandmarkFrame={onLandmarkFrame}
          onHandNotDetected={onHandNotDetected}
        />
      ) : <p className={styles.placeholder}>공유 카메라를 준비하고 있습니다.</p>}
    </section>
  );
}
