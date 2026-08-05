import "./PracticeSessionPage.css";
import "./WordPracticeSessionPage.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "../../../shared/nav/AppNav";
import { WordHandCamera } from "../components/WordHandCamera";
import { getWordAiWebSocketUrl } from "../data/aiRecognition";
import { wordSignGroups, wordSigns, type WordSignItem } from "../data/wordSigns";
import { WordWebSocketSignRecognizer } from "../recognition/WordWebSocketSignRecognizer";
import { WordSignVideo } from "../components/WordSignVideo";
import otterClapImage from "../assets/otter_clap.webp";
import { CORRECT_AUTO_ADVANCE_SECONDS } from "../components/CorrectFeedbackModal";
import { PracticeCompletionActions } from "../components/PracticeCompletionActions";
import type { SentenceSignItem } from "../data/sentenceSigns";

type WordPracticeItem = WordSignItem | SentenceSignItem;

interface WordPracticeSessionPageProps {
  readonly onExit?: () => void;
  readonly words?: readonly WordPracticeItem[];
  readonly categoryId?: "word" | "sentence";
  /**
   * 완료 안내창의 [테스트하기]로 넘길 범위. [다음 단계]로 이어서 연습했다면
   * 단어만이 아니라 이어온 분류 전체가 담겨 온다. 없으면 이번 세션 단어만 쓴다.
   */
  readonly testSymbols?: readonly string[];
}

export function WordPracticeSessionPage({
  onExit,
  words: selectedWords,
  categoryId = "word",
  testSymbols,
}: WordPracticeSessionPageProps) {
  const words = selectedWords ?? wordSigns;
  /* 오답노트에서 고른 단어만 연습하는 경우와 구분한다. 안내창 문구가 달라진다. */
  const isFullWordPractice = !selectedWords && categoryId === "word";
  const streamRef = useRef<MediaStream | null>(null);
  const targetWordIdRef = useRef("");
  const answeredRef = useRef(false);
  const currentIndexRef = useRef(0);
  const correctIndexesRef = useRef(new Set<number>());
  const recognizer = useMemo(
    () =>
      new WordWebSocketSignRecognizer({
        url: getWordAiWebSocketUrl(),
      }),
    [],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [recognitionMessage, setRecognitionMessage] =
    useState("단어 AI 연결을 준비하고 있습니다.");
  const [cameraMessage, setCameraMessage] =
    useState("카메라 영역을 눌러주세요.");
  const [isCorrect, setIsCorrect] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const currentWord = words[currentIndex];
  /* 사전·오답노트와 같이 "단어 · 탈것"처럼 소분류까지 보여준다. */
  const currentWordGroupLabel = wordSignGroups.find(
    (group) => group.id === currentWord?.groupId,
  )?.label ?? (categoryId === "sentence" ? "문장" : undefined);
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === words.length - 1;
  currentIndexRef.current = currentIndex;

  useEffect(() => {
    targetWordIdRef.current = currentWord.id;
    answeredRef.current = false;
    setIsCorrect(false);
    recognizer.resetSequence();
    setRecognitionMessage(
      recognizer.getConnectionState() === "CONNECTED"
        ? "카메라에 한 명만 들어와 수어 동작을 보여주세요."
        : "단어 AI 연결을 준비하고 있습니다.",
    );
  }, [currentWord.id, recognizer]);

  useEffect(() => {
    const unsubscribe = recognizer.subscribe((event) => {
      if (event.type === "CONNECTION_STATE") {
        if (event.state === "CONNECTED") {
          setRecognitionMessage(
            "카메라에 한 명만 들어와 수어 동작을 보여주세요.",
          );
        } else if (event.state === "CONNECTING") {
          setRecognitionMessage("단어 AI 서버에 연결하고 있습니다.");
        } else if (event.state === "ERROR") {
          setRecognitionMessage("단어 AI 서버에 연결하지 못했습니다.");
        }
        return;
      }

      if (event.type === "PREDICTION") {
        setRecognitionMessage(`AI 인식 중: ${event.symbol}`);
        return;
      }

      if (event.type === "SIGN_CONFIRMED" && !answeredRef.current) {
        if (event.symbol === targetWordIdRef.current) {
          answeredRef.current = true;
          correctIndexesRef.current.add(currentIndexRef.current);
          setIsCorrect(true);
          setRecognitionMessage("맞췄습니다!");
        } else {
          setRecognitionMessage(
            `${event.symbol}(으)로 인식했어요. 손을 내린 뒤 다시 시도해 주세요.`,
          );
        }
        return;
      }

      if (event.type === "HAND_RELEASED" && !answeredRef.current) {
        setRecognitionMessage(
          "카메라에 한 명만 들어와 수어 동작을 보여주세요.",
        );
        return;
      }

      if (event.type === "ERROR") {
        setRecognitionMessage("단어 AI 인식 중 오류가 발생했습니다.");
      }
    });

    void recognizer.connect().catch(() => {
      setRecognitionMessage("단어 AI 서버에 연결하지 못했습니다.");
    });

    return () => {
      unsubscribe();
      recognizer.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [recognizer]);

  useEffect(() => {
    let cancelled = false;

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
        recognizer.resetSequence();
      })
      .catch(() => {
        if (!cancelled) {
          setCameraMessage("카메라를 시작하지 못했습니다.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [recognizer]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStream(null);
    setCameraMessage("카메라 영역을 눌러주세요.");
    recognizer.resetSequence();
  };

  const startCamera = async () => {
    if (cameraStream) {
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
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraStream(stream);
      setCameraMessage("");
      recognizer.resetSequence();
    } catch {
      setCameraMessage("카메라를 시작하지 못했습니다.");
    }
  };

  const moveTo = (nextIndex: number) => {
    setCurrentIndex(nextIndex);
  };

  const finishOrNext = () => {
    setIsCorrect(false);
    if (isLast) {
      stopCamera();
      setIsComplete(true);
      return;
    }
    moveTo(currentIndex + 1);
  };

  useEffect(() => {
    if (!isCorrect || isComplete) return;

    const nextId = window.setTimeout(
      finishOrNext,
      CORRECT_AUTO_ADVANCE_SECONDS * 1000,
    );

    return () => window.clearTimeout(nextId);
  }, [isCorrect, isComplete]);

  const retry = () => {
    correctIndexesRef.current.clear();
    setCurrentIndex(0);
    setIsCorrect(false);
    setIsComplete(false);
    recognizer.resetSequence();
  };

  return (
    <div className="practice-session-page word-practice-session-page">
      <div className="practice-session-canvas">
        <header className="practice-session-header">
          <button
            className="practice-page-back-button"
            type="button"
            onClick={onExit}
            aria-label="뒤로 가기"
          >
            ←
          </button>

          <AppNav prefix="practice-session" hasBackButton />
        </header>

        <main className="practice-session-main">
          <div className="practice-progress-area">
            <div className="practice-progress-track">
              <div
                className="practice-progress-bar"
                style={{
                  width: `${((currentIndex + 1) / words.length) * 100}%`,
                }}
              />
            </div>
            <span className="practice-progress-count">
              {currentIndex + 1} / {words.length}
            </span>
          </div>

          <section className="practice-session-panel">
            <article className="practice-answer-panel">
              <span className="practice-panel-label">
                정답 동작
                <span className="practice-panel-tag">
                  {categoryId === "sentence"
                    ? "문장"
                    : currentWordGroupLabel
                    ? `단어 · ${currentWordGroupLabel}`
                    : "단어"}
                </span>
              </span>
              <div className="practice-answer-content">
                <div className="practice-answer-guide word-answer-guide">
                  {currentWord.video ? (
                    <div className="word-guide-video">
                      <WordSignVideo
                        src={currentWord.video}
                        label={`${currentWord.name} 수어 동작 영상`}
                        autoPlay
                      />
                    </div>
                  ) : (
                    <div className="word-guide-placeholder">
                      <p>수어 영상을 준비하고 있어요.</p>
                    </div>
                  )}
                  <div className="practice-item-navigation">
                    <strong>{currentWord.name}</strong>
                  </div>

                  {currentWord.description.length > 0 && (
                    <div className="practice-item-description">
                      {currentWord.description.map((sentence) => (
                        <p key={sentence}>{sentence}</p>
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
                  cameraStream ? "camera-active" : ""
                }`}
                role="button"
                tabIndex={0}
                onClick={() => void startCamera()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void startCamera();
                  }
                }}
              >
                {cameraStream ? (
                  <WordHandCamera
                    sharedStream={cameraStream}
                    onLandmarkFrame={(frame) =>
                      recognizer.sendLandmarkFrame(frame)
                    }
                    onHandsNotDetected={(capturedAt) =>
                      recognizer.notifyHandsNotDetected(capturedAt)
                    }
                  />
                ) : (
                  <p className="practice-camera-message">{cameraMessage}</p>
                )}

                {cameraStream && (
                  <>
                    <span className="practice-camera-live">● LIVE</span>
                    <p className="practice-recognition-message" role="status">
                      {recognitionMessage}
                    </p>
                  </>
                )}
              </div>
            </article>
          </section>

          <div className="practice-bottom-navigation">
            <button
              className="practice-previous-button"
              type="button"
              disabled={isFirst}
              onClick={() => moveTo(currentIndex - 1)}
            >
              ← 이전 문제
            </button>
            <button
              className="practice-next-button"
              type="button"
              onClick={finishOrNext}
            >
              {isLast ? "연습 완료 →" : "다음 문제 →"}
            </button>
          </div>

          {isCorrect && !isComplete && (
            <div
              className="practice-correct-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="word-correct-title"
            >
              <section className="practice-correct-card">
                <button
                  className="practice-correct-close"
                  type="button"
                  aria-label="정답 안내 닫기"
                  onClick={finishOrNext}
                >
                  ×
                </button>
                <img src={otterClapImage} alt="박수치는 수달" />
                <h2 id="word-correct-title">맞췄습니다!</h2>
                <p>AI가 '{currentWord.name}' 동작을 정확히 인식했어요.</p>
              </section>
            </div>
          )}

          {isComplete && (
            <div
              className="practice-completion-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="word-completion-title"
            >
              <section className="practice-completion-card">
                <img
                  className="practice-completion-character"
                  src={otterClapImage}
                  alt="연습 완료를 축하하는 수달"
                />
                <h2 id="word-completion-title">
                  단어 연습 {words.length}개를 모두 완료했어요!
                </h2>

                <PracticeCompletionActions
                  categoryId={categoryId}
                  symbols={testSymbols ?? words.map((word) => word.name)}
                  onRetry={retry}
                />
              </section>
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
