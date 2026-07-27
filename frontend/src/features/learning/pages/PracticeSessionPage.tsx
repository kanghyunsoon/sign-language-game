import "./PracticeSessionPage.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import otterClapImage from "../assets/otter_clap.png";
import {
  HandCamera,
  PythonWebSocketSignRecognizer,
  type RecognitionConnectionState,
} from "../../../game/recognition";
import type { FingerspellingCategoryId } from "../data/fingerspelling";
import { fingerspellingItems } from "../data/fingerspelling";

type PracticeCategoryId = FingerspellingCategoryId;

interface PracticeSessionPageProps {
  category?: PracticeCategoryId;
  onExit?: () => void;
}

const isPracticeCategoryId = (
  categoryId: string | undefined,
): categoryId is PracticeCategoryId => {
  return (
    categoryId === "consonant" ||
    categoryId === "vowel" ||
    categoryId === "number"
  );
};

const getAiWebSocketUrl = () => {
  const configuredUrl = import.meta.env.VITE_AI_WEBSOCKET_URL?.trim();

  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${window.location.host}/ai/ws`;
};

export function PracticeSessionPage({
  category,
  onExit,
}: PracticeSessionPageProps = {}) {
  const { categoryId: routeCategoryId } = useParams();
  const categoryId = category ?? routeCategoryId;
  const streamRef = useRef<MediaStream | null>(null);
  const targetSymbolRef = useRef("");
  const correctAnswerRef = useRef(false);
  const currentIndexRef = useRef(0);
  const correctItemIndexesRef = useRef(new Set<number>());
  const recognizer = useMemo(
    () =>
      new PythonWebSocketSignRecognizer({
        url: getAiWebSocketUrl(),
      }),
    [],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctAnswerCount, setCorrectAnswerCount] = useState(0);
  const [isPracticeComplete, setIsPracticeComplete] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] =
    useState<RecognitionConnectionState>("DISCONNECTED");
  const [prediction, setPrediction] = useState<{
    symbol: string;
    confidence: number;
    isStable?: boolean;
  } | null>(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const [recognitionMessage, setRecognitionMessage] =
    useState("AI 연결을 준비하고 있습니다.");
  const [cameraMessage, setCameraMessage] =
    useState("카메라 시작 버튼을 눌러주세요.");
  const targetSymbol = isPracticeCategoryId(categoryId)
    ? fingerspellingItems[categoryId][currentIndex]?.symbol ?? ""
    : "";

  useEffect(() => {
    targetSymbolRef.current = targetSymbol;
    correctAnswerRef.current = false;
    setIsCorrect(false);
    setPrediction(null);
    setRecognitionMessage(
      recognizer.getConnectionState() === "CONNECTED"
        ? "손동작을 보여주세요."
        : "AI 연결을 준비하고 있습니다.",
    );
  }, [recognizer, targetSymbol]);

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
        setRecognitionMessage(`AI 인식 중: ${event.symbol}`);

        return;
      }

      if (event.type === "SIGN_CONFIRMED" && !correctAnswerRef.current) {
        if (event.symbol === targetSymbolRef.current) {
          correctAnswerRef.current = true;

          if (!correctItemIndexesRef.current.has(currentIndexRef.current)) {
            correctItemIndexesRef.current.add(currentIndexRef.current);
            setCorrectAnswerCount(correctItemIndexesRef.current.size);
          }

          setIsCorrect(true);
          setRecognitionMessage("맞췄습니다!");
        } else {
          setRecognitionMessage(
            `${event.symbol}(으)로 인식했어요. 손을 내린 뒤 다시 시도해주세요.`,
          );
        }

        return;
      }

      if (event.type === "HAND_RELEASED" && !correctAnswerRef.current) {
        setPrediction(null);
        setRecognitionMessage("손동작을 보여주세요.");

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

      const stream = streamRef.current;

      if (!stream) {
        return;
      }

      stream.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, [recognizer]);

  if (!isPracticeCategoryId(categoryId)) {
    return (
      <div className="practice-session-error">
        <p>올바르지 않은 연습 유형입니다.</p>

        <Link to="/practice">연습 선택 화면으로 돌아가기</Link>
      </div>
    );
  }

  const currentPracticeItems = fingerspellingItems[categoryId];
  const currentPracticeItem = currentPracticeItems[currentIndex];
  const isFirstItem = currentIndex === 0;
  const isLastItem = currentIndex === currentPracticeItems.length - 1;
  const correctProgress = Math.round(
    (correctAnswerCount / currentPracticeItems.length) * 100,
  );

  currentIndexRef.current = currentIndex;

  const stopCamera = () => {
    const stream = streamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    }

    streamRef.current = null;

    setCameraStream(null);
    setIsCameraActive(false);
    setCameraMessage("카메라 시작 버튼을 눌러주세요.");
  };

  const handlePreviousClick = () => {
    if (isFirstItem) {
      return;
    }

    setCurrentIndex((previousIndex) => previousIndex - 1);
  };

  const handleNextClick = () => {
    setIsCorrect(false);

    if (isLastItem) {
      stopCamera();
      setIsPracticeComplete(true);

      return;
    }

    setCurrentIndex((previousIndex) => previousIndex + 1);
  };

  const handleRetryClick = () => {
    correctItemIndexesRef.current.clear();
    setCurrentIndex(0);
    setCorrectAnswerCount(0);
    setIsPracticeComplete(false);
    setIsCorrect(false);
  };

  const handleCorrectNext = () => {
    setIsCorrect(false);

    if (isLastItem) {
      stopCamera();
      setIsPracticeComplete(true);

      return;
    }

    setCurrentIndex((previousIndex) => previousIndex + 1);
  };

  const handleCameraClick = async () => {
    if (isCameraActive) {
      stopCamera();

      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage("현재 환경에서는 카메라를 사용할 수 없습니다.");

      return;
    }

    try {
      setCameraMessage("카메라를 연결하고 있습니다.");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: {
            ideal: 1280,
          },
          height: {
            ideal: 720,
          },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraStream(stream);
      setIsCameraActive(true);
      setCameraMessage("");
    } catch (error) {
      stopCamera();

      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setCameraMessage(
          "카메라 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.",
        );

        return;
      }

      if (error instanceof DOMException && error.name === "NotFoundError") {
        setCameraMessage("사용 가능한 카메라를 찾지 못했습니다.");

        return;
      }

      if (error instanceof DOMException && error.name === "NotReadableError") {
        setCameraMessage(
          "다른 프로그램에서 카메라를 사용하고 있는지 확인해주세요.",
        );

        return;
      }

      setCameraMessage(
        "카메라를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    }
  };

  return (
    <div className="practice-session-page">
      <div className="practice-session-canvas">
      <header className="practice-session-header">
        {onExit ? (
          <button
            className="practice-page-back-button"
            type="button"
            onClick={onExit}
            aria-label="연습 선택 화면으로 돌아가기"
          >
            &lt;
          </button>
        ) : (
          <Link
            className="practice-page-back-button"
            to="/practice"
            aria-label="연습 선택 화면으로 돌아가기"
          >
            &lt;
          </Link>
        )}

        <nav className="practice-session-nav" aria-label="주요 메뉴">
          <Link to="/main">메인페이지</Link>

          <Link className="active" to="/practice">연습</Link>
          <Link to="/test">테스트</Link>
          <Link to="/dictionary">사전</Link>
          <Link to="/game">게임</Link>
        </nav>

        <Link className="practice-session-mypage-button" to="/profile">
          마이페이지
        </Link>
      </header>

      <main className="practice-session-main">
        <div className="practice-progress-area">
          <div className="practice-progress-track">
            <div
              className="practice-progress-bar"
              style={{
                width: `${
                  ((currentIndex + 1) / currentPracticeItems.length) * 100
                }%`,
              }}
            />
          </div>

          <span className="practice-progress-count">
            {currentIndex + 1} / {currentPracticeItems.length}
          </span>
        </div>

        <section
          className={`practice-session-panel ${
            isPracticeComplete ? "practice-session-panel-complete" : ""
          }`}
        >
          <article className="practice-answer-panel">
            <span className="practice-panel-label">정답 동작</span>
            <div className="practice-answer-content">
              <div className="practice-answer-guide">
                <span className="practice-current-symbol">
                  {currentPracticeItem.symbol}
                </span>

                <div className="practice-answer-placeholder">
                  {currentPracticeItem.image && (
                    <img
                      src={currentPracticeItem.image}
                      alt={`${currentPracticeItem.name} 지문자 동작`}
                    />
                  )}
                </div>

                <div className="practice-item-navigation">
                  <strong>{currentPracticeItem.name}</strong>
                </div>

                {currentPracticeItem.description && (
                  <div className="practice-item-description">
                    {currentPracticeItem.description.map((description) => (
                      <p key={description}>{description}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </article>

          <article className="practice-camera-panel">
            <span className="practice-panel-label">내 동작</span>

            <div
              className={`practice-camera-placeholder ${
                isCameraActive ? "camera-active" : ""
              }`}
            >
              {cameraStream && (
                <HandCamera
                  sharedStream={cameraStream}
                  autoStart
                  compact
                  targetSymbol={currentPracticeItem.symbol}
                  prediction={prediction}
                  connectionState={connectionState}
                  performanceMonitor={recognizer.getPerformanceMonitor()}
                  temporalDecoder={recognizer.getTemporalDecoder()}
                  awaitingHandRelease={isCorrect}
                  onLandmarkFrame={(frame) =>
                    recognizer.sendLandmarkFrame(frame)
                  }
                  onHandNotDetected={(capturedAt) =>
                    recognizer.notifyHandNotDetected(capturedAt)
                  }
                />
              )}

              {isCameraActive && (
                <span className="practice-camera-live">● LIVE</span>
              )}

              {!isCameraActive && (
                <p className="practice-camera-message">{cameraMessage}</p>
              )}

              {isCameraActive && (
                <p className="practice-recognition-message" role="status">
                  {recognitionMessage}
                </p>
              )}
            </div>
          </article>
        </section>

        <div className="practice-bottom-navigation">
          <button
            className="practice-previous-button"
            type="button"
            onClick={handlePreviousClick}
            disabled={isFirstItem}
          >
            ← 이전 문제
          </button>

          <button
            className="practice-camera-button"
            type="button"
            onClick={handleCameraClick}
          >
            {isCameraActive ? "카메라 종료" : "카메라 시작"}
          </button>

          <button
            className="practice-next-button"
            type="button"
            onClick={handleNextClick}
          >
            {isLastItem ? "연습 완료 →" : "다음 문제 →"}
          </button>
        </div>

        {isCorrect && !isPracticeComplete && (
          <div
            className="practice-correct-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-correct-title"
          >
            <section className="practice-correct-card">
              <img
                src={otterClapImage}
                alt="정답을 축하하며 박수치는 수달"
              />
              <h2 id="practice-correct-title">맞췄습니다!</h2>
              <p>
                AI가 {currentPracticeItem.symbol} 동작을 정확히 인식했어요.
              </p>
              <button type="button" onClick={handleCorrectNext}>
                {isLastItem ? "연습 완료" : "다음 문제"}
              </button>
            </section>
          </div>
        )}

        {isPracticeComplete && (
          <div
            className="practice-completion-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-completion-title"
          >
            <section className="practice-completion-card">
              <img
                className="practice-completion-character"
                src={otterClapImage}
                alt="연습 완료를 축하하는 수달 캐릭터"
              />

              <h2 id="practice-completion-title">
                오늘의 연습 {currentPracticeItems.length}개를 모두 완료했어요.
              </h2>

              <p>같은 범위를 다시 연습하거나 메인페이지로 이동해보세요.</p>

              <div className="practice-completion-stats">
                <div>
                  <strong>{correctAnswerCount}개</strong>
                  <span>완료 문제</span>
                </div>

                <div>
                  <strong>{correctProgress}%</strong>
                  <span>진행률</span>
                </div>
              </div>
            </section>

            <div className="practice-completion-actions">
              <button type="button" onClick={handleRetryClick}>
                ↻ 다시하기
              </button>

              <Link to="/practice" onClick={onExit}>
                처음으로
              </Link>
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
