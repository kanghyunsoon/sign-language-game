import "../pages/PracticeSessionPage.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HandCamera,
  type RecognitionConnectionState,
} from "../../../game/recognition";
import { WordHandCamera } from "./WordHandCamera";
import {
  CORRECT_AUTO_ADVANCE_SECONDS,
  CorrectFeedbackModal,
} from "./CorrectFeedbackModal";
import {
  getAiWebSocketUrl,
  getWordAiWebSocketUrl,
} from "../data/aiRecognition";
import { PracticeWebSocketSignRecognizer } from "../recognition/PracticeWebSocketSignRecognizer";
import { WordWebSocketSignRecognizer } from "../recognition/WordWebSocketSignRecognizer";
import { findRecognitionTip } from "../data/recognitionTips";
import { findSentenceSign } from "../data/sentenceSigns";
import type {
  TestAnswerState,
  TestQuestion,
  TestQuestionResult,
} from "../data/testSession";
import { TEST_TIME_LIMIT_SECONDS } from "../data/testSession";

const TIME_LIMIT_MS = TEST_TIME_LIMIT_SECONDS * 1000;
/** 남은 시간 표시 갱신 주기. */
const TICK_INTERVAL_MS = 100;
/**
 * 이 시간 동안 정답이 나오지 않으면 자세 팁을 띄운다. 제한 시간이 10초라
 * 연습 화면(7초)보다 짧게 잡아, 남은 시간 안에 자세를 고칠 수 있게 한다.
 */
const RECOGNITION_TIP_DELAY_MS = 4000;

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
  const targetSequenceRef = useRef<readonly string[]>([]);
  const sequenceIndexRef = useRef(0);
  const answeredRef = useRef(false);
  const advanceRef = useRef<(state: TestAnswerState) => void>(() => {});
  const isCorrectFeedbackOpenRef = useRef(false);
  const finishCorrectFeedbackRef = useRef<() => void>(() => {});

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
  const [isCorrectFeedbackOpen, setIsCorrectFeedbackOpen] = useState(false);
  const [showRecognitionTip, setShowRecognitionTip] = useState(false);

  const currentQuestion = questions[currentIndex];
  const recognitionTip = findRecognitionTip(currentQuestion?.symbol ?? "");
  const useWordEndpoint =
    currentQuestion?.categoryId === "word" ||
    currentQuestion?.categoryId === "sentence";
  const useNumberEndpoint = currentQuestion?.categoryId === "number";
  const recognizer = useMemo(
    () => {
      if (useWordEndpoint) {
        return new WordWebSocketSignRecognizer({
          url: getWordAiWebSocketUrl(),
        });
      }

      return new PracticeWebSocketSignRecognizer({
        url: getAiWebSocketUrl(useNumberEndpoint),
      });
    },
    [useNumberEndpoint, useWordEndpoint],
  );
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

  const showCorrectFeedback = () => {
    if (answeredRef.current || !targetSymbolRef.current) return;

    answeredRef.current = true;
    isCorrectFeedbackOpenRef.current = true;
    setRecognitionMessage("정답입니다!");
    setIsCorrectFeedbackOpen(true);
  };

  finishCorrectFeedbackRef.current = () => {
    if (!isCorrectFeedbackOpenRef.current || !currentQuestion) return;

    isCorrectFeedbackOpenRef.current = false;
    setIsCorrectFeedbackOpen(false);
    const nextResults = [
      ...results,
      { question: currentQuestion, state: "correct" as const },
    ];

    if (currentIndex === totalCount - 1) {
      onFinish(nextResults);
      return;
    }

    setResults(nextResults);
    setCurrentIndex((previous) => previous + 1);
  };

  useEffect(() => {
    if (!isCorrectFeedbackOpen) return;

    const nextId = window.setTimeout(
      () => finishCorrectFeedbackRef.current(),
      CORRECT_AUTO_ADVANCE_SECONDS * 1000,
    );

    return () => window.clearTimeout(nextId);
  }, [isCorrectFeedbackOpen]);

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

      // 정리 중 예외가 나면 React가 언마운트를 끝내지 못해, 화면을 옮겨도
      // 이전 화면이 그대로 남는다. 카메라 정리는 실패해도 삼킨다.
      try {
        streamRef.current?.getTracks().forEach((track) => track.stop());
      } catch {
        // 이미 닫힌 트랙이면 무시한다.
      }

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
        const sequence = targetSequenceRef.current;
        const sequenceIndex = sequenceIndexRef.current;
        const expectedSymbol = sequence[sequenceIndex];

        if (event.symbol === expectedSymbol) {
          if (sequenceIndex < sequence.length - 1) {
            sequenceIndexRef.current = sequenceIndex + 1;
            if (recognizer instanceof WordWebSocketSignRecognizer) {
              recognizer.resetSequence();
            }
            setPrediction(null);
            setRecognitionMessage(
              "'비'를 인식했어요. 이어서 '좋다' 동작을 보여주세요.",
            );
            return;
          }

          showCorrectFeedback();
        } else if (
          sequence.length > 1 &&
          sequenceIndex > 0 &&
          event.symbol === sequence[sequenceIndex - 1]
        ) {
          if (recognizer instanceof WordWebSocketSignRecognizer) {
            recognizer.resetSequence();
          }
          setRecognitionMessage("이어서 '좋다' 동작을 보여주세요.");
        } else {
          sequenceIndexRef.current = 0;
          if (
            sequence.length > 1 &&
            recognizer instanceof WordWebSocketSignRecognizer
          ) {
            recognizer.resetSequence();
          }
          setRecognitionMessage(
            sequence.length > 1
              ? `${event.symbol}(으)로 인식했어요. 처음부터 다시 시도해주세요.`
              : `${event.symbol}(으)로 인식했어요. 손을 내린 뒤 다시 시도해주세요.`,
          );
        }

        return;
      }

      if (event.type === "HAND_RELEASED") {
        setPrediction(null);
        const nextSymbol = targetSequenceRef.current[sequenceIndexRef.current];
        if (nextSymbol === "good") {
          setRecognitionMessage("'좋다' 동작을 보여주세요.");
        }

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
      // 소켓 정리가 던지면 언마운트가 중단되어 화면 이동이 먹지 않는다.
      try {
        unsubscribe();
        recognizer.disconnect();
      } catch {
        // 이미 끊긴 소켓이면 무시한다.
      }
    };
  }, [recognizer]);

  // 문항이 바뀔 때마다 목표 글자와 제한 시간을 초기화한다. 시간이 다 되면 오답 처리한다.
  useEffect(() => {
    answeredRef.current = false;
    targetSymbolRef.current =
      currentQuestion?.recognitionSymbol ?? currentQuestion?.symbol ?? "";
    const sentence =
      currentQuestion?.categoryId === "sentence"
        ? findSentenceSign(targetSymbolRef.current)
        : undefined;
    targetSequenceRef.current =
      sentence?.recognitionSequence ?? [targetSymbolRef.current];
    sequenceIndexRef.current = 0;
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

  // 카메라가 켜진 채 한동안 정답이 나오지 않으면 자세 팁을 띄운다.
  // 정답 팝업이 뜨거나 문항이 바뀌면 즉시 내린다.
  useEffect(() => {
    setShowRecognitionTip(false);

    if (!recognitionTip || !cameraStream || isCorrectFeedbackOpen) {
      return;
    }

    const timerId = window.setTimeout(
      () => setShowRecognitionTip(true),
      RECOGNITION_TIP_DELAY_MS,
    );

    return () => window.clearTimeout(timerId);
  }, [currentIndex, recognitionTip, cameraStream, isCorrectFeedbackOpen]);

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

              {currentQuestion.categoryId !== "word" &&
                currentQuestion.categoryId !== "sentence" && (
                <span className="test-question-tag">{currentQuestion.name}</span>
              )}
            </div>

            <span
              className={`test-question-symbol ${
                currentQuestion.categoryId === "word" ||
                currentQuestion.categoryId === "sentence"
                  ? "test-question-symbol-word"
                  : ""
              }`}
            >
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
            {cameraStream && recognizer instanceof WordWebSocketSignRecognizer ? (
              <WordHandCamera
                sharedStream={cameraStream}
                onLandmarkFrame={(frame) => recognizer.sendLandmarkFrame(frame)}
                onHandsNotDetected={(capturedAt) =>
                  recognizer.notifyHandsNotDetected(capturedAt)
                }
              />
            ) : cameraStream &&
              recognizer instanceof PracticeWebSocketSignRecognizer ? (
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

            {cameraStream &&
              showRecognitionTip &&
              recognitionTip &&
              !isCorrectFeedbackOpen && (
                <p className="practice-recognition-tip" role="status">
                  💡 {recognitionTip}
                </p>
              )}
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
              {/* <button
                className="test-mark-correct-button"
                type="button"
                onClick={showCorrectFeedback}
              >
                정답 처리 (임시)
              </button> */}

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

      {isCorrectFeedbackOpen && (
        <CorrectFeedbackModal
          symbol={currentQuestion.symbol}
          onClose={() => finishCorrectFeedbackRef.current()}
        />
      )}
    </main>
  );
}
