import "./PracticeSessionPage.css";
import "./WordPracticeSessionPage.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { WordHandCamera } from "../components/WordHandCamera";
import { getWordAiWebSocketUrl } from "../data/aiRecognition";
import { wordSigns } from "../data/wordSigns";
import { WordWebSocketSignRecognizer } from "../recognition/WordWebSocketSignRecognizer";
import otterClapImage from "../assets/otter_clap.png";

interface WordPracticeSessionPageProps {
  readonly onExit?: () => void;
}

export function WordPracticeSessionPage({
  onExit,
}: WordPracticeSessionPageProps) {
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
  const [correctCount, setCorrectCount] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [recognitionMessage, setRecognitionMessage] =
    useState("단어 AI 연결을 준비하고 있습니다.");
  const [cameraMessage, setCameraMessage] =
    useState("카메라 시작 버튼을 눌러주세요.");
  const [isCorrect, setIsCorrect] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const currentWord = wordSigns[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === wordSigns.length - 1;
  const progress = Math.round((correctCount / wordSigns.length) * 100);
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
          if (!correctIndexesRef.current.has(currentIndexRef.current)) {
            correctIndexesRef.current.add(currentIndexRef.current);
            setCorrectCount(correctIndexesRef.current.size);
          }
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

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStream(null);
    setCameraMessage("카메라 시작 버튼을 눌러주세요.");
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

  const retry = () => {
    correctIndexesRef.current.clear();
    setCurrentIndex(0);
    setCorrectCount(0);
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

          <nav className="practice-session-nav" aria-label="주요 메뉴">
            <Link to="/main">메인페이지</Link>
            <Link className="active" to="/practice">연습</Link>
            <Link to="/test">테스트</Link>
            <Link to="/dictionary">사전</Link>
            <Link to="/review-notes">오답노트</Link>
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
                  width: `${((currentIndex + 1) / wordSigns.length) * 100}%`,
                }}
              />
            </div>
            <span className="practice-progress-count">
              {currentIndex + 1} / {wordSigns.length}
            </span>
          </div>

          <section className="practice-session-panel">
            <article className="practice-answer-panel">
              <span className="practice-panel-label">
                정답 동작
                <span className="practice-panel-tag">단어</span>
              </span>
              <div className="practice-answer-content">
                <div className="practice-answer-guide word-answer-guide">
                  <div className="word-guide-placeholder" aria-label="영상 준비 중">
                    <p>수어 영상은 준비 중입니다.</p>
                  </div>
                  <div className="practice-item-navigation">
                    <strong>{currentWord.name}</strong>
                  </div>
                </div>
              </div>
            </article>

            <article className="practice-camera-panel">
              <span className="practice-panel-label">내 동작</span>
              <div
                className={`practice-camera-placeholder ${
                  cameraStream ? "camera-active" : ""
                }`}
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
              className="practice-camera-button"
              type="button"
              onClick={() => void startCamera()}
            >
              {cameraStream ? "카메라 종료" : "카메라 시작"}
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
                <img src={otterClapImage} alt="박수치는 수달" />
                <h2 id="word-correct-title">맞췄습니다!</h2>
                <p>AI가 {currentWord.name} 동작을 정확히 인식했어요.</p>
                <button type="button" onClick={finishOrNext}>
                  {isLast ? "연습 완료" : "다음 문제"}
                </button>
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
                  단어 연습 {wordSigns.length}개를 모두 완료했어요!
                </h2>
                <div className="practice-completion-stats">
                  <div>
                    <strong>{correctCount}개</strong>
                    <span>완료 문제</span>
                  </div>
                  <div>
                    <strong>{progress}%</strong>
                    <span>진행률</span>
                  </div>
                </div>
              </section>
              <div className="practice-completion-actions">
                <button type="button" onClick={retry}>↻ 다시하기</button>
                <button type="button" onClick={onExit}>처음으로</button>
              </div>
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
