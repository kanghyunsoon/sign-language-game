import { useEffect, useRef, useState } from "react";
import type {
  TestAnswerState,
  TestQuestion,
  TestQuestionResult,
  TestSignJudge,
} from "../data/testSession";
import { TEST_TIME_LIMIT_SECONDS } from "../data/testSession";

const TIME_LIMIT_MS = TEST_TIME_LIMIT_SECONDS * 1000;
/** 남은 시간 표시 갱신 주기. */
const TICK_INTERVAL_MS = 100;

interface TestProgressViewProps {
  readonly questions: readonly TestQuestion[];
  readonly onFinish: (results: TestQuestionResult[]) => void;
  /**
   * 지문자 인식 판정기. 주입하면 정답 동작 인식 시 자동으로 다음 문항으로 넘어간다.
   * 현재는 구현체가 없어 미주입 상태로 동작한다.
   */
  readonly judge?: TestSignJudge;
}

/** 문제를 풀고 있는 테스트 진행 화면. */
export function TestProgressView({
  questions,
  onFinish,
  judge,
}: TestProgressViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<TestQuestionResult[]>([]);
  const [remainingMs, setRemainingMs] = useState(TIME_LIMIT_MS);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraMessage, setCameraMessage] = useState(
    "카메라를 연결하고 있습니다.",
  );

  const currentQuestion = questions[currentIndex];
  const totalCount = questions.length;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const isTimeUrgent = remainingMs <= 3000;

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraActive(false);
  };

  /**
   * 한 문항을 채점하고 다음으로 넘어간다.
   * 타이머와 판정기가 동시에 호출할 수 있어 answeredRef로 중복 처리를 막는다.
   */
  const answeredRef = useRef(false);
  const advanceRef = useRef<(state: TestAnswerState) => void>(() => {});

  advanceRef.current = (state: TestAnswerState) => {
    if (answeredRef.current || !currentQuestion) {
      return;
    }

    answeredRef.current = true;
    const nextResults = [...results, { question: currentQuestion, state }];

    if (currentIndex === totalCount - 1) {
      stopCamera();
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

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setIsCameraActive(true);
        setCameraMessage("");
      } catch {
        if (!isCancelled) {
          setCameraMessage("카메라를 사용할 수 없어 화면 없이 진행합니다.");
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

  // 문항이 바뀔 때마다 제한 시간을 다시 센다. 시간이 다 되면 오답 처리한다.
  useEffect(() => {
    answeredRef.current = false;
    const deadlineAt = Date.now() + TIME_LIMIT_MS;
    setRemainingMs(TIME_LIMIT_MS);

    const timerId = window.setInterval(() => {
      const left = Math.max(0, deadlineAt - Date.now());
      setRemainingMs(left);

      if (left === 0) {
        window.clearInterval(timerId);
        advanceRef.current("wrong");
      }
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(timerId);
  }, [currentIndex]);

  // 판정기가 주입되면 문항마다 인식을 시작하고, 정답을 맞히면 바로 넘어간다.
  useEffect(() => {
    if (!judge || !currentQuestion) {
      return;
    }

    judge.start(currentQuestion, () => advanceRef.current("correct"));

    return () => judge.stop();
  }, [judge, currentQuestion]);

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
          <span className="test-panel-label">문제</span>

          <div className="test-question-content">
            <span className="test-question-symbol">
              {currentQuestion.symbol}
            </span>
          </div>
        </article>

        <article className="test-camera-panel">
          <span className="test-panel-label">내 동작</span>

          <div
            className={`test-camera-placeholder ${
              isCameraActive ? "camera-active" : ""
            }`}
          >
            <video
              className="test-camera-video"
              ref={videoRef}
              autoPlay
              muted
              playsInline
            />

            {isCameraActive ? (
              <span className="test-camera-live">● LIVE</span>
            ) : (
              <p className="test-camera-message">{cameraMessage}</p>
            )}
          </div>

          <div className="test-camera-controls">
            <span
              className={`test-timer ${isTimeUrgent ? "test-timer-urgent" : ""}`}
              role="timer"
              aria-label="남은 시간"
            >
              {remainingSeconds}초
            </span>

            {/*
              임시 채점 수단. 지문자 인식 판정기(judge)가 주입되면 자동 채점이
              동작하므로 이 버튼은 사라진다. AI 인식 연동 시 함께 제거한다.
            */}
            {!judge && (
              <button
                className="test-mark-correct-button"
                type="button"
                onClick={() => advanceRef.current("correct")}
              >
                정답 처리 (임시)
              </button>
            )}

            <button
              className="test-skip-button"
              type="button"
              onClick={() => advanceRef.current("wrong")}
            >
              넘어가기
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}
