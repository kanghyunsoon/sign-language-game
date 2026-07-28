import { useEffect, useMemo, useRef, useState } from "react";
import {
  HandCamera,
  PythonWebSocketSignRecognizer,
  type RecognitionConnectionState,
} from "../../../game/recognition";
import { getAiWebSocketUrl } from "../data/aiRecognition";
import type {
  TestAnswerState,
  TestQuestion,
  TestQuestionResult,
} from "../data/testSession";
import { TEST_TIME_LIMIT_SECONDS } from "../data/testSession";

const TIME_LIMIT_MS = TEST_TIME_LIMIT_SECONDS * 1000;
/** 남은 시간 표시 갱신 주기. */
const TICK_INTERVAL_MS = 100;

interface TestProgressViewProps {
  readonly questions: readonly TestQuestion[];
  readonly onFinish: (results: TestQuestionResult[]) => void;
}

/** 문제를 풀고 있는 테스트 진행 화면. */
export function TestProgressView({
  questions,
  onFinish,
}: TestProgressViewProps) {
  const streamRef = useRef<MediaStream | null>(null);
  const targetSymbolRef = useRef("");
  const answeredRef = useRef(false);
  const advanceRef = useRef<(state: TestAnswerState) => void>(() => {});
  const recognizer = useMemo(
    () => new PythonWebSocketSignRecognizer({ url: getAiWebSocketUrl() }),
    [],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<TestQuestionResult[]>([]);
  const [remainingMs, setRemainingMs] = useState(TIME_LIMIT_MS);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraMessage, setCameraMessage] = useState(
    "카메라를 연결하고 있습니다.",
  );
  /**
   * 카메라 준비가 끝났는지. 연결에 성공했거나, 쓸 수 없다고 판명된 경우 모두 포함한다.
   * 연결을 기다리는 동안 제한 시간이 흐르면 첫 문항을 손해 보므로 타이머를 붙잡아 둔다.
   */
  const [isCameraSettled, setIsCameraSettled] = useState(false);
  const [connectionState, setConnectionState] =
    useState<RecognitionConnectionState>("DISCONNECTED");
  const [prediction, setPrediction] = useState<{
    symbol: string;
    confidence: number;
    isStable?: boolean;
  } | null>(null);
  const [recognitionMessage, setRecognitionMessage] = useState(
    "AI 연결을 준비하고 있습니다.",
  );

  const currentQuestion = questions[currentIndex];
  const totalCount = questions.length;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const isTimeUrgent = remainingMs <= 3000;

  /**
   * 한 문항을 채점하고 다음으로 넘어간다.
   * 타이머와 AI 인식이 동시에 호출할 수 있어 answeredRef로 중복 처리를 막는다.
   */
  advanceRef.current = (state: TestAnswerState) => {
    if (answeredRef.current || !currentQuestion) {
      return;
    }

    answeredRef.current = true;
    const nextResults = [...results, { question: currentQuestion, state }];

    if (currentIndex === totalCount - 1) {
      onFinish(nextResults);
      return;
    }

    setResults(nextResults);
    setCurrentIndex((previous) => previous + 1);
  };

  // 카메라는 테스트 진행 중에만 켜 두고, 화면을 벗어나면 반드시 정리한다.
  useEffect(() => {
    let isCancelled = false;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraMessage("현재 환경에서는 카메라를 사용할 수 없습니다.");
        // 카메라를 기다려도 켜지지 않으므로 그대로 시작한다.
        setIsCameraSettled(true);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setCameraStream(stream);
        setCameraMessage("");
        setIsCameraSettled(true);
      } catch {
        if (!isCancelled) {
          setCameraMessage("카메라를 사용할 수 없어 화면 없이 진행합니다.");
          setIsCameraSettled(true);
        }
      }
    };

    void startCamera();

    return () => {
      isCancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  // AI 인식 서버에 연결하고, 목표 글자가 확정되면 바로 다음 문항으로 넘어간다.
  useEffect(() => {
    const unsubscribe = recognizer.subscribe((event) => {
      if (event.type === "CONNECTION_STATE") {
        setConnectionState(event.state);

        if (event.state === "CONNECTED") {
          setRecognitionMessage("손동작을 보여주세요.");
        } else if (event.state === "CONNECTING") {
          setRecognitionMessage("AI 인식 서버에 연결하고 있습니다.");
        } else if (event.state === "ERROR") {
          setRecognitionMessage("AI 인식 서버에 연결하지 못했습니다.");
        }

        return;
      }

      if (event.type === "PREDICTION") {
        setPrediction({
          symbol: event.symbol,
          confidence: event.confidence,
          isStable: event.isStable,
        });

        return;
      }

      if (event.type === "SIGN_CONFIRMED") {
        if (event.symbol === targetSymbolRef.current) {
          setRecognitionMessage("정답입니다!");
          advanceRef.current("correct");
        } else {
          setRecognitionMessage(
            `${event.symbol}(으)로 인식했어요. 손을 내린 뒤 다시 시도해주세요.`,
          );
        }

        return;
      }

      if (event.type === "HAND_RELEASED") {
        setPrediction(null);

        return;
      }

      if (event.type === "ERROR") {
        setRecognitionMessage("AI 인식 중 오류가 발생했습니다.");
      }
    });

    void recognizer.connect().catch(() => {
      setRecognitionMessage("AI 인식 서버에 연결하지 못했습니다.");
    });

    return () => {
      unsubscribe();
      recognizer.disconnect();
    };
  }, [recognizer]);

  // 문항이 바뀔 때마다 목표 글자와 제한 시간을 초기화한다. 시간이 다 되면 오답 처리한다.
  useEffect(() => {
    answeredRef.current = false;
    targetSymbolRef.current = currentQuestion?.symbol ?? "";
    setPrediction(null);
    setRemainingMs(TIME_LIMIT_MS);

    // 카메라가 준비되기 전에는 시간을 세지 않는다.
    if (!isCameraSettled) {
      return;
    }

    const deadlineAt = Date.now() + TIME_LIMIT_MS;
    const timerId = window.setInterval(() => {
      const left = Math.max(0, deadlineAt - Date.now());
      setRemainingMs(left);

      if (left === 0) {
        window.clearInterval(timerId);
        advanceRef.current("wrong");
      }
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(timerId);
  }, [currentIndex, currentQuestion, isCameraSettled]);

  if (!currentQuestion) {
    return null;
  }

  return (
    <main className="test-main test-progress">
      <div className="test-progress-area">
        <div className="test-progress-track">
          <div
            className="test-progress-bar"
            style={{ width: `${((currentIndex + 1) / totalCount) * 100}%` }}
          />
        </div>

        <span className="test-progress-count">
          {currentIndex + 1} / {totalCount}
        </span>
      </div>

      <section className="test-progress-panel">
        <article className="test-question-panel">
          <p className="test-panel-label">
            <span>문제</span>
          </p>

          <div className="test-question-content">
            {/* ㅣ와 1처럼 헷갈리는 글자를 구분할 수 있도록 분류와 이름을 함께 보여준다. */}
            <div className="test-question-tags">
              <span className="test-question-tag test-question-tag-category">
                {currentQuestion.categoryLabel}
              </span>

              <span className="test-question-tag">{currentQuestion.name}</span>
            </div>

            <span className="test-question-symbol">
              {currentQuestion.symbol}
            </span>
          </div>
        </article>

        <article className="test-camera-panel">
          <p className="test-panel-label">
            <span>내 동작</span>
          </p>

          {/* 영상은 LIVE 뱃지만 얹고, 안내·컨트롤은 영상 아래에 따로 둔다. */}
          <div className="test-camera-placeholder">
            {cameraStream ? (
              <HandCamera
                sharedStream={cameraStream}
                autoStart
                compact
                targetSymbol={currentQuestion.symbol}
                prediction={prediction}
                connectionState={connectionState}
                performanceMonitor={recognizer.getPerformanceMonitor()}
                temporalDecoder={recognizer.getTemporalDecoder()}
                onLandmarkFrame={(frame) => recognizer.sendLandmarkFrame(frame)}
                onHandNotDetected={(capturedAt) =>
                  recognizer.notifyHandNotDetected(capturedAt)
                }
              />
            ) : (
              <p className="test-camera-message">{cameraMessage}</p>
            )}

            {cameraStream && <span className="test-camera-live">● LIVE</span>}
          </div>

          <div className="test-camera-footer">
            <p className="test-recognition-message" role="status">
              {recognitionMessage}
            </p>

            <div className="test-camera-controls">
              <span
                className={`test-timer ${
                  isTimeUrgent ? "test-timer-urgent" : ""
                }`}
                role="timer"
                aria-label="남은 시간"
              >
                {remainingSeconds}초
              </span>

              {/*
                임시 채점 수단. AI 인식 서버 없이도 진행 흐름을 확인할 수 있게
                남겨 둔다. 인식이 안정화되면 다시 제거한다.
              */}
              <button
                className="test-mark-correct-button"
                type="button"
                onClick={() => advanceRef.current("correct")}
              >
                정답 처리 (임시)
              </button>

              <button
                className="test-skip-button"
                type="button"
                onClick={() => advanceRef.current("wrong")}
              >
                넘어가기
              </button>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
