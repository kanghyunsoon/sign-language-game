import "./PracticeSessionPage.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import otterClapImage from "../assets/otter_clap.webp";
import {
  CORRECT_AUTO_ADVANCE_SECONDS,
  CorrectFeedbackModal,
} from "../components/CorrectFeedbackModal";
import {
  HandCamera,
  type RecognitionConnectionState,
} from "../../../game/recognition";
import { getAiWebSocketUrl } from "../data/aiRecognition";
import type {
  FingerspellingCategoryId,
  FingerspellingItem,
} from "../data/fingerspelling";
import {
  findFingerspellingEntry,
  fingerspellingItems,
} from "../data/fingerspelling";
import { PracticeCompletionActions } from "../components/PracticeCompletionActions";
import { PracticeSessionHeader } from "../components/PracticeSessionHeader";
import type { PracticeFlowCategoryId } from "../data/practiceFlow";
import { PracticeWebSocketSignRecognizer } from "../recognition/PracticeWebSocketSignRecognizer";

type PracticeCategoryId = FingerspellingCategoryId;

interface PracticeSessionPageProps {
  category?: PracticeCategoryId;
  /**
   * 연습할 글자를 직접 지정한다. 오답노트에서 고른 글자만 연습할 때 사용한다.
   * 주어지면 분류 전체 대신 이 목록으로 세션을 구성한다.
   */
  items?: readonly FingerspellingItem[];
  onExit?: () => void;
  /** 완료 안내창에서 다음 분류 연습으로 넘어갈 때 호출한다. */
  onNextCategory?: (categoryId: PracticeFlowCategoryId) => void;
  /**
   * 완료 안내창의 [테스트하기]로 넘길 범위. [다음 단계]로 이어서 연습했다면
   * 지금 분류만이 아니라 이어온 분류 전체가 담겨 온다. 없으면 이번 세션 글자만 쓴다.
   */
  testSymbols?: readonly string[];
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

export function PracticeSessionPage({
  category,
  items,
  onExit,
  onNextCategory,
  testSymbols,
}: PracticeSessionPageProps = {}) {
  const { categoryId: routeCategoryId } = useParams();
  const categoryId = category ?? routeCategoryId;
  // 넘겨받은 글자 목록이 있으면 그것을, 없으면 분류 전체를 연습한다.
  const practiceItems: readonly FingerspellingItem[] =
    items ?? (isPracticeCategoryId(categoryId) ? fingerspellingItems[categoryId] : []);
  const streamRef = useRef<MediaStream | null>(null);
  const targetSymbolRef = useRef("");
  const correctAnswerRef = useRef(false);
  const currentIndexRef = useRef(0);
  const correctItemIndexesRef = useRef(new Set<number>());
  const recognizer = useMemo(
    () =>
      new PracticeWebSocketSignRecognizer({
        url: getAiWebSocketUrl(categoryId === "number"),
      }),
    [categoryId],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
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
    useState("카메라 영역을 눌러주세요.");
  const targetSymbol = practiceItems[currentIndex]?.symbol ?? "";

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

          correctItemIndexesRef.current.add(currentIndexRef.current);

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

  useEffect(() => {
    let cancelled = false;

    if (practiceItems.length === 0) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage("현재 환경에서는 카메라를 사용할 수 없습니다.");
      return;
    }

    setCameraMessage("");

    void navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setCameraStream(stream);
        setIsCameraActive(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setCameraMessage("브라우저 설정에서 카메라 권한을 허용해주세요.");
          return;
        }

        setCameraMessage("카메라를 시작하지 못했습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId, practiceItems.length]);

  // 잘못된 분류로 들어왔거나 연습할 글자가 하나도 없으면 진행할 수 없다.
  if (practiceItems.length === 0) {
    return (
      <div className="practice-session-error">
        <p>올바르지 않은 연습 유형입니다.</p>

        <Link to="/practice">연습 선택 화면으로 돌아가기</Link>
      </div>
    );
  }

  const currentPracticeItems = practiceItems;
  const currentPracticeItem = currentPracticeItems[currentIndex];
  // 오답노트에서 분류가 섞인 글자를 받을 수도 있어 글자마다 사전에서 분류를 찾는다.
  const currentCategoryLabel =
    findFingerspellingEntry(currentPracticeItem?.symbol ?? "")?.categoryLabel ??
    "";
  /*
   * 사전·오답노트와 같은 표기를 쓴다. 자음·모음은 "지문자 · 자음"처럼 상위 분류를
   * 함께 보여주고, 숫자는 지문자와 구분되는 이름이라 "지숫자"만 쓴다.
   */
  const practiceTagLabel =
    currentCategoryLabel === "숫자"
      ? "지숫자"
      : `지문자 · ${currentCategoryLabel}`;
  const isFirstItem = currentIndex === 0;
  const isLastItem = currentIndex === currentPracticeItems.length - 1;
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
    setCameraMessage("카메라 영역을 눌러주세요.");
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

  useEffect(() => {
    if (!isCorrect || isPracticeComplete) return;

    const nextId = window.setTimeout(
      handleCorrectNext,
      CORRECT_AUTO_ADVANCE_SECONDS * 1000,
    );

    return () => window.clearTimeout(nextId);
  }, [isCorrect, isPracticeComplete]);

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
      <PracticeSessionHeader onBack={onExit} />
      <div className="practice-session-canvas">
      <div className="practice-session-header-spacer" aria-hidden="true" />

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
            <span className="practice-panel-label">
              정답 동작
              <span className="practice-panel-tag">{practiceTagLabel}</span>
            </span>
            <div className="practice-answer-content">
              <div className="practice-answer-guide">
                <span className="practice-current-symbol">
                  {currentPracticeItem.symbol}
                </span>

                {/* 옆모습이 있는 글자는 정면 그림을 조금 줄여, 오른쪽 위에 붙는
                    옆모습과 나란히 봐도 답답하지 않게 한다. */}
                <div
                  className={`practice-answer-placeholder ${
                    currentPracticeItem.sideImage
                      ? "practice-answer-placeholder-with-side"
                      : ""
                  }`}
                >
                  {currentPracticeItem.image && (
                    <img
                      src={currentPracticeItem.image}
                      alt={`${currentPracticeItem.name} 지문자 동작`}
                    />
                  )}
                </div>

                {currentPracticeItem.sideImage && (
                  <div className="practice-answer-side">
                    <div className="practice-answer-side-image">
                      <img
                        src={currentPracticeItem.sideImage}
                        alt={`${currentPracticeItem.name} 지문자 동작 옆모습`}
                      />
                    </div>
                    <span className="practice-answer-side-label">측면</span>
                  </div>
                )}

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
              role="button"
              tabIndex={0}
              onClick={() => void handleCameraClick()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void handleCameraClick();
                }
              }}
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
            className="practice-next-button"
            type="button"
            onClick={handleNextClick}
          >
            {isLastItem ? "연습 완료 →" : "다음 문제 →"}
          </button>
        </div>

        {isCorrect && !isPracticeComplete && (
          <CorrectFeedbackModal
            symbol={currentPracticeItem.symbol}
            onClose={handleCorrectNext}
          />
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

              <PracticeCompletionActions
                categoryId={items ? undefined : categoryId}
                symbols={
                  testSymbols ??
                  currentPracticeItems.map((item) => item.symbol)
                }
                onRetry={handleRetryClick}
                onNextCategory={onNextCategory}
              />
            </section>
          </div>
        )}
      </main>

      </div>
    </div>
  );
}
