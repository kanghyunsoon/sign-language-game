import { AlertTriangle, Camera, Hand, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { drawHandOverlay } from "./drawHandOverlay";
import { isHandVisibleInViewport } from "../../../shared/mediapipe";
import { predictLandmarksForDisplay, stabilizeLandmarksForDisplay, type DisplayLandmarkSample } from "./predictLandmarksForDisplay";
import { useRecognitionVisionAdapterFactory } from "../vision";
import type { RecognitionVisionAdapter, RecognitionVisionAdapterFactory, TrackedHand } from "../vision";
import type { HandLandmarkFrame } from "../types/landmark";
import type { RecognitionConnectionState } from "../types/events";
import { alignTemplateToCurrentHand } from "../feedback/templateAlignment";
import { compareTemplateToCurrentLandmarks, type PoseFeedbackResult } from "../feedback/poseFeedback";
import type { ReferenceTemplate } from "../template/types";
import { SignGuideImage } from "../components/SignGuideImage";
import { RecognitionPerformancePanel } from "../components/RecognitionPerformancePanel";
import { SignDecoderDebugPanel } from "../components/SignDecoderDebugPanel";
import { ActivePlayerStatusOverlay } from "../components/ActivePlayerStatusOverlay";
import { ActiveHandStatusOverlay } from "../components/ActiveHandStatusOverlay";
import { ActivePlayerRegistrationModal, RecognitionBlockedOverlay, RecognitionDebugOverlay } from "../components/GameRecognitionStatus";
import { BrowserRecognitionFrameScheduler, DEFAULT_RECOGNITION_RATE_CONFIG, RecognitionPerformanceMonitor, SingleLatestFrameBuffer, smoothHandLandmarks, type RecognitionPerformanceSnapshot, type RecognitionRateConfig, type RecognitionVideoFrame } from "../runtime";
import type { DefaultContinuousSignDecoder } from "../temporal";
import { ActiveHandTracker, type ActiveHandDetectionConfig, type ActiveHandSnapshot, type ActivePlayerSession, type HandCandidate } from "../active-player";
import type { GameRecognitionPipelineAdapter } from "../session";

type CameraStatus = "IDLE" | "STARTING" | "RUNNING" | "ERROR";
export type CameraErrorKind = "NO_CAMERA" | "PERMISSION_DENIED" | "MEDIAPIPE_INIT_FAILED" | "UNKNOWN";

interface CameraErrorState {
  readonly kind: CameraErrorKind;
  readonly message: string;
}

const FEEDBACK_REPORT_INTERVAL_MS = 250;
const VISUAL_HAND_LOST_GRACE_MS = 90;
const GAMEPLAY_HAND_DETECTION_CONFIG: ActiveHandDetectionConfig = Object.freeze({
  maximumDetectedHands: 2,
  minimumHandDetectionConfidence: .5,
  minimumHandPresenceConfidence: .5,
  minimumTrackingConfidence: .5,
});

export interface HandCameraProps {
  readonly sharedStream: MediaStream;
  readonly rateConfig?: RecognitionRateConfig;
  readonly performanceMonitor?: RecognitionPerformanceMonitor;
  readonly temporalDecoder?: Pick<DefaultContinuousSignDecoder, "getSnapshot" | "getConfig" | "updateConfig">;
  readonly activePlayerSession?: ActivePlayerSession;
  readonly recognitionSession?: GameRecognitionPipelineAdapter;
  readonly handDetectionConfig?: ActiveHandDetectionConfig;
  readonly autoStart?: boolean;
  readonly onLandmarkFrame?: (frame: HandLandmarkFrame) => void;
  readonly onHandNotDetected?: (capturedAt: number) => void;
  readonly targetSymbol?: string | null;
  readonly prediction?: { readonly symbol: string; readonly confidence: number; readonly isStable?: boolean } | null;
  readonly referenceTemplate?: ReferenceTemplate | null;
  readonly onPoseFeedback?: (result: PoseFeedbackResult | null) => void;
  readonly connectionState?: RecognitionConnectionState;
  readonly modelVersion?: string | null;
  readonly connectionError?: string | null;
  readonly awaitingHandRelease?: boolean;
  readonly showDebug?: boolean;
  readonly compact?: boolean;
  readonly showNoHandPrompt?: boolean;
  readonly hideCompactStatus?: boolean;
  readonly visionAdapterFactory?: RecognitionVisionAdapterFactory;
}

export function HandCamera({ sharedStream, rateConfig = DEFAULT_RECOGNITION_RATE_CONFIG, performanceMonitor, temporalDecoder, activePlayerSession, recognitionSession, handDetectionConfig = GAMEPLAY_HAND_DETECTION_CONFIG, autoStart = false, onLandmarkFrame, onHandNotDetected, targetSymbol, prediction, referenceTemplate, onPoseFeedback, connectionState, modelVersion, connectionError, awaitingHandRelease = false, showDebug = false, compact = false, showNoHandPrompt = false, hideCompactStatus = false, visionAdapterFactory }: HandCameraProps) {
  // Registration/ownership is a debug-only tool. Gameplay always uses the
  // first detected hand, so a registration state can never block recognition.
  // Registration is not used by any game mode. Keep the prop surface for
  // compatibility, but never render or start the registration flow.
  const userRegistrationEnabled = false;
  const defaultVisionAdapterFactory = useRecognitionVisionAdapterFactory();
  const resolvedVisionAdapterFactory = visionAdapterFactory ?? defaultVisionAdapterFactory;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const visionAdapterRef = useRef<RecognitionVisionAdapter | null>(null);
  const activeHandTrackerRef = useRef<ActiveHandTracker | null>(null);
  const schedulerRef = useRef<BrowserRecognitionFrameScheduler | null>(null);
  const handBufferRef = useRef(new SingleLatestFrameBuffer<RecognitionVideoFrame>());
  const poseBufferRef = useRef(new SingleLatestFrameBuffer<RecognitionVideoFrame>());
  const processingHandRef = useRef(false);
  const processingPoseRef = useRef(false);
  const renderHandsRef = useRef<readonly TrackedHand[]>([]);
  const previousDisplaySampleRef = useRef<DisplayLandmarkSample | undefined>(undefined);
  const currentDisplaySampleRef = useRef<DisplayLandmarkSample | undefined>(undefined);
  const lastVisualHandSeenAtRef = useRef(0);
  const lightLandmarksRef = useRef<readonly import("../types/landmark").HandLandmark[] | undefined>(undefined);
  const lastHandCountRef = useRef(0);
  const mountedRef = useRef(true);
  const monitorRef = useRef(performanceMonitor??new RecognitionPerformanceMonitor());
  const handlersRef = useRef({ onLandmarkFrame, onHandNotDetected });
  const feedbackHandlersRef = useRef({ referenceTemplate, onPoseFeedback });
  const lastFeedbackReportAtRef = useRef(0);
  const lastActiveHandSessionIdRef = useRef<string | undefined>(undefined);
  const startGenerationRef = useRef(0);
  const startingRef = useRef(false);

  const [status, setStatus] = useState<CameraStatus>("IDLE");
  const [error, setError] = useState<CameraErrorState | null>(null);
  const [handCount, setHandCount] = useState(0);
  const [workerMode,setWorkerMode]=useState("MAIN_THREAD");
  const [poseError,setPoseError]=useState<string|null>(null);
  const [activeHandSnapshot,setActiveHandSnapshot]=useState<ActiveHandSnapshot>();
  const [performanceSnapshot,setPerformanceSnapshot]=useState<RecognitionPerformanceSnapshot>(()=>monitorRef.current.getSnapshot());
  const guideState = prediction === null || prediction === undefined
    ? "waiting"
    : prediction.symbol === targetSymbol
      ? "match"
      : "mismatch";

  useEffect(() => {
    handlersRef.current = { onLandmarkFrame, onHandNotDetected };
  }, [onHandNotDetected, onLandmarkFrame]);

  useEffect(() => {
    feedbackHandlersRef.current = { referenceTemplate, onPoseFeedback };
  }, [onPoseFeedback, referenceTemplate]);

  useEffect(()=>{monitorRef.current.start();const unsubscribe=showDebug?monitorRef.current.subscribe(setPerformanceSnapshot):()=>undefined;return()=>{unsubscribe();monitorRef.current.stop();};},[showDebug]);
  useEffect(()=>{if(userRegistrationEnabled&&activePlayerSession?.getSnapshot().state==="UNREGISTERED")activePlayerSession.beginRegistration();},[activePlayerSession,userRegistrationEnabled]);

  const releaseResources = useCallback((updateState: boolean) => {
    startGenerationRef.current += 1;
    startingRef.current = false;
    schedulerRef.current?.dispose();schedulerRef.current=null;
    visionAdapterRef.current?.close();
    visionAdapterRef.current = null;
    activeHandTrackerRef.current?.dispose();activeHandTrackerRef.current=null;lastActiveHandSessionIdRef.current=undefined;
    handBufferRef.current.clear();processingHandRef.current=false;renderHandsRef.current=[];previousDisplaySampleRef.current=undefined;currentDisplaySampleRef.current=undefined;lastVisualHandSeenAtRef.current=0;lightLandmarksRef.current=undefined;
    poseBufferRef.current.clear();processingPoseRef.current=false;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    lastHandCountRef.current = 0;
    if (updateState && mountedRef.current) {
      setHandCount(0);
      setStatus("IDLE");
    }
  }, []);

  const stopCamera = useCallback(() => {
    releaseResources(true);
  }, [releaseResources]);

  const drawLatest=useCallback((frame:RecognitionVideoFrame)=>{
    const canvas=canvasRef.current,video=frame.video;
    if(!canvas||video.videoWidth<=0||video.videoHeight<=0)return;
    const size=overlayCanvasSize(video,stageRef.current);
    const resized=canvas.width!==size.width||canvas.height!==size.height;
    if(resized){
      canvas.width=size.width;
      canvas.height=size.height;
    }
    const currentSample=currentDisplaySampleRef.current;
    const hands=renderHandsRef.current.map((hand,index)=>{if(index!==0||!currentSample)return hand;return{...hand,landmarks:predictLandmarksForDisplay(previousDisplaySampleRef.current,currentSample,Date.now())};}),template=feedbackHandlersRef.current.referenceTemplate;
    const overlayStates=hands.map((hand)=>{
      const result=template?compareTemplateToCurrentLandmarks(hand.landmarks,hand.handedness,template):null;
      return result&&result.availability==="AVAILABLE"&&template
        ?{feedback:result.feedback,referenceLandmarks:alignTemplateToCurrentHand(template.landmarks,hand.landmarks,hand.handedness)}
        :{};
    });
    const context=canvas.getContext("2d");
    if(context){
      drawHandOverlay(context,hands,overlayStates,{
        sourceWidth:video.videoWidth,
        sourceHeight:video.videoHeight,
        objectFit:videoObjectFit(video),
      });
    }
  },[]);

  const processPendingHands=useCallback(async()=>{if(processingHandRef.current)return;processingHandRef.current=true;try{while(mountedRef.current){const frame=handBufferRef.current.takeLatest();if(!frame)break;const adapter=visionAdapterRef.current;if(!adapter)break;let hands:readonly TrackedHand[];try{const detectionStartedAt=performance.now();hands=await adapter.detectHands({video:frame.video,timestamp:detectionStartedAt,frameId:frame.frameId});const detectionFinishedAt=performance.now();monitorRef.current.recordHandLatency(detectionFinishedAt-detectionStartedAt);monitorRef.current.mark("hand",detectionFinishedAt);setWorkerMode(adapter.getExecutionMode());}catch{setError({kind:"MEDIAPIPE_INIT_FAILED",message:"손 추적 처리에 실패했습니다. 영상과 게임은 계속됩니다."});break;}
    let primary:TrackedHand|undefined,preview:TrackedHand|undefined,activeSessionId:string|undefined,activeHandId:string|undefined;
    const stage=stageRef.current;
    hands=hands.filter((hand)=>isHandVisibleInViewport(hand.landmarks,frame.video.videoWidth,frame.video.videoHeight,stage?.clientWidth??0,stage?.clientHeight??0,videoObjectFit(frame.video)));
    if(userRegistrationEnabled&&activePlayerSession){const candidates:HandCandidate[]=hands.map((hand,index)=>({detectionId:`hand-${frame.frameId}-${index}`,landmarks:hand.landmarks,handedness:hand.handedness,handednessScore:hand.handednessScore??0,wrist:hand.landmarks[0]!,detectedAt:frame.capturedAt}));if(recognitionSession){const ownership=recognitionSession.resolveHandCandidates(candidates,frame.capturedAt);if(showDebug)setActiveHandSnapshot(ownership.ownership);const previewId=ownership.selected?.detectionId??ownership.ownership?.scores[0]?.handDetectionId,previewIndex=candidates.findIndex((candidate)=>candidate.detectionId===previewId);preview=previewIndex>=0?hands[previewIndex]:undefined;if(ownership.inputAllowed&&ownership.selected){const selectedIndex=candidates.findIndex((candidate)=>candidate.detectionId===ownership.selected!.detectionId);primary=hands[selectedIndex];activeSessionId=ownership.sessionId;activeHandId=ownership.activeHandId;}}else if(activeHandTrackerRef.current){const ownership=activeHandTrackerRef.current.update(candidates,activePlayerSession.getSnapshot(),frame.capturedAt);if(showDebug)setActiveHandSnapshot(ownership);const previewId=ownership.selected?.detectionId??ownership.scores[0]?.handDetectionId,previewIndex=candidates.findIndex((candidate)=>candidate.detectionId===previewId);preview=previewIndex>=0?hands[previewIndex]:undefined;if(ownership.inputAllowed&&ownership.selected&&ownership.session){const selectedIndex=candidates.findIndex((candidate)=>candidate.detectionId===ownership.selected!.detectionId);primary=hands[selectedIndex];activeSessionId=ownership.session.sessionId;activeHandId=ownership.session.activeHandId;}}}
    else primary=hands[0];
    const visualHand=primary??preview??hands[0],visualNow=Date.now();
    if(visualHand){const stableLandmarks=stabilizeLandmarksForDisplay(currentDisplaySampleRef.current?.landmarks,visualHand.landmarks);const displaySample={landmarks:stableLandmarks,capturedAt:frame.capturedAt};previousDisplaySampleRef.current=currentDisplaySampleRef.current;currentDisplaySampleRef.current=displaySample;renderHandsRef.current=[{...visualHand,landmarks:stableLandmarks}];lastVisualHandSeenAtRef.current=visualNow;}else if(visualNow-lastVisualHandSeenAtRef.current>VISUAL_HAND_LOST_GRACE_MS){renderHandsRef.current=[];previousDisplaySampleRef.current=undefined;currentDisplaySampleRef.current=undefined;}
    if(primary){if(activeSessionId&&lastActiveHandSessionIdRef.current!==activeSessionId){lightLandmarksRef.current=undefined;lastActiveHandSessionIdRef.current=activeSessionId;}const light=smoothHandLandmarks(lightLandmarksRef.current,primary.landmarks,.985);lightLandmarksRef.current=light;const output={frameId:frame.frameId,capturedAt:frame.capturedAt,handedness:primary.handedness,landmarks:light,rawLandmarks:primary.landmarks,activeHandId,activeHandSessionId:activeSessionId};if(recognitionSession)recognitionSession.submitLandmarkFrame(output);else handlersRef.current.onLandmarkFrame?.(output);const template=feedbackHandlersRef.current.referenceTemplate;if(template&&performance.now()-lastFeedbackReportAtRef.current>=FEEDBACK_REPORT_INTERVAL_MS){lastFeedbackReportAtRef.current=performance.now();feedbackHandlersRef.current.onPoseFeedback?.(compareTemplateToCurrentLandmarks(primary.landmarks,primary.handedness,template));}}else{lightLandmarksRef.current=undefined;if(recognitionSession)recognitionSession.notifyHandNotDetected(frame.capturedAt);else handlersRef.current.onHandNotDetected?.(frame.capturedAt);}if(hands.length!==lastHandCountRef.current){lastHandCountRef.current=hands.length;setHandCount(hands.length);}}}finally{processingHandRef.current=false;if(handBufferRef.current.hasPending())void processPendingHands();}},[activePlayerSession,drawLatest,recognitionSession,showDebug,userRegistrationEnabled]);

  const queueHandFrame=useCallback((frame:RecognitionVideoFrame)=>{handBufferRef.current.push(frame);const dropped=handBufferRef.current.takeReplacementCount();if(dropped)monitorRef.current.drop("hand",dropped);void processPendingHands();},[processPendingHands]);

  const processPendingPoses=useCallback(async()=>{if(processingPoseRef.current||!activePlayerSession||!userRegistrationEnabled)return;processingPoseRef.current=true;try{while(mountedRef.current){const frame=poseBufferRef.current.takeLatest();if(!frame)break;const adapter=visionAdapterRef.current;if(!adapter)break;try{const detections=await adapter.detectPoses({video:frame.video,timestamp:performance.now(),frameId:frame.frameId});monitorRef.current.mark("pose");activePlayerSession.process(detections,frame.capturedAt);setPoseError(null);}catch(cause){setPoseError(cause instanceof Error?cause.message:"Pose tracking failed");break;}}}finally{processingPoseRef.current=false;if(poseBufferRef.current.hasPending())void processPendingPoses();}},[activePlayerSession,userRegistrationEnabled]);
  const queuePoseFrame=useCallback((frame:RecognitionVideoFrame)=>{poseBufferRef.current.push(frame);const dropped=poseBufferRef.current.takeReplacementCount();if(dropped)monitorRef.current.drop("pose",dropped);void processPendingPoses();},[processPendingPoses]);

  const startCamera = useCallback(async () => {
    if (startingRef.current || schedulerRef.current) {
      return;
    }
    startingRef.current = true;
    const generation = ++startGenerationRef.current;
    setStatus("STARTING");
    setError(null);

    let initializationStage: "MEDIAPIPE" | "CAMERA" = "MEDIAPIPE";
    try {
      const adapter = resolvedVisionAdapterFactory.create({
        handDetectionConfig,
        maximumTrackedPeople: userRegistrationEnabled ? activePlayerSession?.getConfig().maximumTrackedPeople ?? 1 : 1,
        enablePoseTracking: userRegistrationEnabled,
        preferWorker: true,
      });
      visionAdapterRef.current = adapter;
      await adapter.initialize();
      if (!mountedRef.current || generation !== startGenerationRef.current) {
        adapter.close();
        return;
      }
      if(userRegistrationEnabled) setPoseError(null);
      if(userRegistrationEnabled&&activePlayerSession&&!recognitionSession)activeHandTrackerRef.current=new ActiveHandTracker();
      initializationStage = "CAMERA";

      if (!mountedRef.current) {
        adapter.close();
        return;
      }
      const video = videoRef.current;
      if (!video) {
        throw new Error("웹캠 화면을 초기화할 수 없습니다.");
      }
      video.srcObject = sharedStream;
      await video.play();
      if (!mountedRef.current || generation !== startGenerationRef.current) return;
      const scheduler=new BrowserRecognitionFrameScheduler({video,config:rateConfig,monitor:monitorRef.current});scheduler.subscribeRenderFrame(drawLatest);scheduler.subscribeHandFrame(queueHandFrame);if(userRegistrationEnabled)scheduler.subscribePoseFrame(queuePoseFrame);schedulerRef.current=scheduler;scheduler.start();
      startingRef.current = false;
      setStatus("RUNNING");
    } catch (cause) {
      if (generation !== startGenerationRef.current) return;
      releaseResources(false);
      const message =
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "카메라 권한이 거부되었습니다. 브라우저 사이트 설정에서 카메라를 허용하세요."
          : cause instanceof Error
            ? cause.message
            : "카메라를 시작하지 못했습니다.";
      setError(classifyCameraError(cause, initializationStage));
      setStatus("ERROR");
    }
  }, [activePlayerSession, drawLatest, handDetectionConfig, queueHandFrame, queuePoseFrame, rateConfig, releaseResources, resolvedVisionAdapterFactory, sharedStream, userRegistrationEnabled]);

  useEffect(() => {
    if (autoStart && sharedStream) void startCamera();
  }, [autoStart, sharedStream, startCamera]);

  useEffect(() => {
    mountedRef.current = true;
    const mountedVideo = videoRef.current;
    return () => {
      mountedRef.current = false;
      releaseResources(false);
      if (mountedVideo) {
        mountedVideo.pause();
        mountedVideo.srcObject = null;
      }
    };
  }, [releaseResources]);

  if (compact) return (
    <section className="camera-workspace camera-workspace-compact" aria-label="내 카메라">
      <div ref={stageRef} className="camera-stage">
        <video ref={videoRef} className="camera-media mirrored" playsInline muted />
        <canvas ref={canvasRef} className="camera-overlay mirrored" />
        {userRegistrationEnabled&&<ActivePlayerStatusOverlay session={activePlayerSession} poseError={poseError} showDebug={showDebug} />}
        {showDebug&&<ActiveHandStatusOverlay snapshot={activeHandSnapshot} showDebug />}
        {userRegistrationEnabled&&recognitionSession&&<><ActivePlayerRegistrationModal session={recognitionSession}/><RecognitionBlockedOverlay session={recognitionSession}/>{showDebug&&<RecognitionDebugOverlay session={recognitionSession}/>}</>}
        {status !== "RUNNING" && <div className="camera-placeholder"><Hand aria-hidden="true" size={34} strokeWidth={1.5}/><span>{status === "ERROR" ? "카메라를 시작하지 못했습니다." : "카메라 준비 중"}</span></div>}
        {status === "RUNNING" && handCount === 0 && showNoHandPrompt && <div className="camera-no-hand-prompt" role="status" aria-live="polite"><span>손을 화면 중앙에</span><strong>보여 주세요!</strong></div>}
        {!hideCompactStatus && <div className="camera-compact-status"><span className={`status-dot ${status === "RUNNING" ? "is-running" : ""}`}/><strong>내 카메라</strong><small>{status}</small></div>}
      </div>
      {error&&<div className="camera-error camera-compact-error" role="alert"><AlertTriangle aria-hidden="true" size={16}/><span>{error.message}</span></div>}
    </section>
  );

  return (
    <section className="camera-workspace" aria-labelledby="camera-title">
      <div className="camera-heading">
        <div>
          <p className="eyebrow">Browser MediaPipe</p>
          <h2 id="camera-title">손 랜드마크 확인</h2>
        </div>
        <div className="camera-status-group">
          {connectionState && (
            <div className="camera-server-status" aria-live="polite">
              <span className={`socket-status socket-${connectionState.toLowerCase()}`}>AI 인식 서버 · {connectionState}</span>
              <small>{modelVersion ?? "AI model"} · 카메라/MediaPipe 상태와 별개</small>
            </div>
          )}
          <div className={`status status-${status.toLowerCase()}`}>
            <span className="status-dot" />
            {status === "RUNNING" ? (showDebug ? `손 ${handCount}개` : "카메라 작동 중") : status}
          </div>
          {connectionError && <small className="camera-server-error">{connectionError}</small>}
        </div>
      </div>

      <div ref={stageRef} className="camera-stage">
        <video ref={videoRef} className="camera-media mirrored" playsInline muted />
        <canvas ref={canvasRef} className="camera-overlay mirrored" />
        {userRegistrationEnabled&&<ActivePlayerStatusOverlay session={activePlayerSession} poseError={poseError} showDebug={showDebug} />}
        {showDebug&&<ActiveHandStatusOverlay snapshot={activeHandSnapshot} showDebug />}
        {userRegistrationEnabled&&recognitionSession&&<><ActivePlayerRegistrationModal session={recognitionSession}/><RecognitionBlockedOverlay session={recognitionSession}/>{showDebug&&<RecognitionDebugOverlay session={recognitionSession}/>}</>}
        {status !== "RUNNING" && (
          <div className="camera-placeholder">
            <Hand aria-hidden="true" size={42} strokeWidth={1.5} />
            <span>카메라를 시작하면 손 랜드마크 21개가 표시됩니다.</span>
          </div>
        )}
      </div>

      {error && <div className="camera-error" role="alert"><AlertTriangle aria-hidden="true" size={18} /><div><strong>{cameraErrorTitle(error.kind)}</strong><span>{error.message}</span></div></div>}

      <div className="camera-controls">
        <button type="button" onClick={startCamera} disabled={status === "STARTING" || status === "RUNNING"}>
          <Camera aria-hidden="true" size={18} />
          카메라 시작
        </button>
        <button type="button" className="secondary" onClick={stopCamera} disabled={status !== "RUNNING"}>
          <Square aria-hidden="true" size={17} />
          카메라 정지
        </button>
      </div>

      {showDebug&&<RecognitionPerformancePanel snapshot={performanceSnapshot} workerMode={workerMode} />}
      {showDebug&&<SignDecoderDebugPanel decoder={temporalDecoder} />}

      <div className={`camera-guide-panel guide-${guideState}`} aria-label="현재 목표 지문자 안내">
        <div className="camera-guide-values">
          <div className="camera-guide-value">
            <span>목표 지문자</span>
            <strong>{targetSymbol ?? "-"}</strong>
          </div>
          <div className="camera-guide-value camera-current-value" aria-live="polite">
            <span>현재 인식</span>
            <strong key={prediction?.symbol ?? "waiting"}>{prediction?.symbol ?? "-"}</strong>
            <small>
              {!prediction
                ? "인식 대기"
                : awaitingHandRelease
                  ? "같은 글자 재입력 전 손을 잠시 내려주세요"
                  : guideState === "match"
                  ? `${prediction.isStable ? "목표 일치 · 확정" : "목표 확인 중"} · ${(prediction.confidence * 100).toFixed(0)}%`
                  : `다른 글자 · ${(prediction.confidence * 100).toFixed(0)}%`}
            </small>
            <div className="camera-confidence" aria-label={`인식 신뢰도 ${prediction ? `${(prediction.confidence * 100).toFixed(0)}%` : "없음"}`}>
              <span style={{ width: `${Math.max(0, Math.min(1, prediction?.confidence ?? 0)) * 100}%` }} />
            </div>
          </div>
        </div>
        <div key={targetSymbol ?? "no-guide"} className="camera-guide-image">
          <SignGuideImage symbol={targetSymbol ?? null} responsive />
        </div>
      </div>
    </section>
  );
}

export function classifyCameraError(cause: unknown, stage: "MEDIAPIPE" | "CAMERA"): CameraErrorState {
  if (stage === "MEDIAPIPE") return { kind: "MEDIAPIPE_INIT_FAILED", message: "MediaPipe hand tracking could not initialize. Check local model assets and reload." };
  if (cause instanceof DOMException && cause.name === "NotAllowedError") return { kind: "PERMISSION_DENIED", message: "Camera permission was denied. Allow camera access in browser site settings." };
  if (cause instanceof DOMException && (cause.name === "NotFoundError" || cause.name === "OverconstrainedError")) return { kind: "NO_CAMERA", message: "No compatible camera was found. Connect a camera and try again." };
  return { kind: "UNKNOWN", message: cause instanceof Error ? cause.message : "The camera could not start." };
}

function cameraErrorTitle(kind: CameraErrorKind): string {
  switch (kind) {
    case "NO_CAMERA": return "Camera unavailable";
    case "PERMISSION_DENIED": return "Camera permission denied";
    case "MEDIAPIPE_INIT_FAILED": return "MediaPipe initialization failed";
    case "UNKNOWN": return "Camera error";
  }
}

function overlayCanvasSize(video: HTMLVideoElement, stage: HTMLDivElement | null): { width: number; height: number } {
  const stageWidth = stage?.clientWidth ?? 0;
  const stageHeight = stage?.clientHeight ?? 0;
  if (stageWidth <= 0 || stageHeight <= 0) return { width: video.videoWidth, height: video.videoHeight };
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 1.5);
  return {
    width: Math.max(1, Math.round(stageWidth * pixelRatio)),
    height: Math.max(1, Math.round(stageHeight * pixelRatio)),
  };
}

function videoObjectFit(video: HTMLVideoElement): "cover" | "contain" | "fill" {
  const objectFit = globalThis.getComputedStyle?.(video).objectFit;
  return objectFit === "contain" || objectFit === "fill" ? objectFit : "cover";
}
