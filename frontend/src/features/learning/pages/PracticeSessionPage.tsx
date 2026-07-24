import "./PracticeSessionPage.css";
import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import otterClapImage from "../assets/otter_clap.png";
import otterCharacter from "../../../game/block-stacking/assets/game-menu-otter.png";

type PracticeCategoryId = "consonant" | "vowel" | "number";

interface PracticeSessionPageProps {
  category?: PracticeCategoryId;
  onExit?: () => void;
}

interface PracticeItem {
  symbol: string;
  name: string;
  description?: string[];
}

const practiceItems: Record<PracticeCategoryId, PracticeItem[]> = {
  consonant: [
    {
      symbol: "ㄱ",
      name: "기역",
      description: [
        "검지를 아래로 곧게 펴고, 나머지 손가락은 접어주세요.",
        "손등이 보이도록 손목을 옆으로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㄴ",
      name: "니은",
      description: [
        "검지는 옆으로, 엄지는 위로 곧게 펴서 두 손가락이 직각을 이루게 해주세요.",
        "나머지 손가락은 손바닥 안쪽으로 접습니다.",
      ],
    },
    {
      symbol: "ㄷ",
      name: "디귿",
      description: [
        "검지와 중지를 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손등이 보이도록 손을 옆으로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㄹ",
      name: "리을",
      description: [
        "검지, 중지, 약지를 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손등이 보이도록 손가락 끝을 옆으로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅁ",
      name: "미음",
      description: [
        "검지와 중지를 위로 나란히 세우고, 약지와 새끼손가락은 접어주세요.",
        "엄지는 접은 손가락 위에 가볍게 올리고 손바닥이 앞을 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅂ",
      name: "비읍",
      description: [
        "검지, 중지, 약지를 위로 나란히 세우고, 새끼손가락은 접어주세요.",
        "엄지는 접은 새끼손가락 위에 놓고 손바닥이 앞을 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅅ",
      name: "시옷",
      description: [
        "검지와 중지를 아래로 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손등이 보이도록 손끝을 아래로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅇ",
      name: "이응",
      description: [
        "엄지와 검지 끝을 맞대어 동그라미를 만들어주세요.",
        "중지, 약지, 새끼손가락은 위로 자연스럽게 펴고 손바닥이 앞을 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅈ",
      name: "지읒",
      description: [
        "검지와 중지를 아래로 나란히 펴고, 엄지는 옆으로 벌려주세요.",
        "약지와 새끼손가락은 접고 손등이 보이도록 합니다.",
      ],
    },
    {
      symbol: "ㅊ",
      name: "치읓",
      description: [
        "검지, 중지, 약지를 아래로 나란히 펴고, 엄지는 옆으로 벌려주세요.",
        "새끼손가락은 접고 손등이 보이도록 손끝을 아래로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅋ",
      name: "키읔",
      description: [
        "가운데 손가락 하나를 아래로 곧게 펴고, 나머지 손가락은 접어주세요.",
        "엄지는 옆으로 벌리고 손등이 보이도록 합니다.",
      ],
    },
    {
      symbol: "ㅌ",
      name: "티읕",
      description: [
        "검지와 중지를 옆으로 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 보이도록 손을 옆으로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅍ",
      name: "피읖",
      description: [
        "네 손가락을 모두 접어 주먹을 만들어주세요.",
        "엄지는 접은 손가락 앞쪽을 감싸고 손바닥 쪽이 보이도록 세웁니다.",
      ],
    },
    {
      symbol: "ㅎ",
      name: "히읗",
      description: [
        "네 손가락을 접어 주먹을 만들고, 엄지만 위로 곧게 세워주세요.",
        "손바닥의 옆면이 앞쪽을 향하도록 합니다.",
      ],
    },
  ],
  vowel: [
    {
      symbol: "ㅏ",
      name: "아",
      description: [
        "검지를 위로 곧게 펴고, 나머지 손가락은 주먹을 쥐어주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅑ",
      name: "야",
      description: [
        "검지와 중지를 위로 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅓ",
      name: "어",
      description: [
        "주먹을 쥔 상태에서 엄지를 옆으로 곧게 펴주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅕ",
      name: "여",
      description: [
        "주먹을 쥔 상태에서 엄지와 검지를 옆으로 펴주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅗ",
      name: "오",
      description: [
        "검지를 위로 곧게 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅛ",
      name: "요",
      description: [
        "검지와 중지를 위로 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅜ",
      name: "우",
      description: [
        "주먹을 쥔 상태에서 검지를 아래로 곧게 펴주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅠ",
      name: "유",
      description: [
        "주먹을 쥔 상태에서 검지와 중지를 아래로 나란히 펴주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅡ",
      name: "으",
      description: [
        "검지를 옆으로 곧게 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 아래를 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅣ",
      name: "이",
      description: [
        "엄지와 새끼손가락을 펴고, 나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅐ",
      name: "애",
      description: [
        "엄지와 새끼손가락을 펴고, 검지도 함께 위로 펴주세요.",
        "나머지 손가락은 접고 손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅒ",
      name: "얘",
      description: [
        "엄지와 새끼손가락을 펴고, 검지·중지·약지를 함께 위로 펴주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅔ",
      name: "에",
      description: [
        "엄지와 새끼손가락을 펴고, 검지와 중지를 함께 위로 펴주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅖ",
      name: "예",
      description: [
        "주먹을 쥔 상태에서 검지를 아래로 곧게 펴주세요.",
        "손바닥이 옆을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅚ",
      name: "외",
      description: [
        "엄지, 검지, 중지를 앞으로 모아 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 옆을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅟ",
      name: "위",
      description: [
        "엄지와 검지를 모아 손끝이 서로 닿도록 하고, 나머지 손가락은 자연스럽게 접어주세요.",
        "손바닥이 옆을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅢ",
      name: "의",
      description: [
        "검지와 중지를 옆으로 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 아래를 향하도록 합니다.",
      ],
    },
  ],
  number: [
    { symbol: "1", name: "하나" },
    { symbol: "2", name: "둘" },
    { symbol: "3", name: "셋" },
    { symbol: "4", name: "넷" },
    { symbol: "5", name: "다섯" },
    { symbol: "6", name: "여섯" },
    { symbol: "7", name: "일곱" },
    { symbol: "8", name: "여덟" },
    { symbol: "9", name: "아홉" },
    { symbol: "10", name: "열" },
  ],
};

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
  onExit,
}: PracticeSessionPageProps = {}) {
  const { categoryId: routeCategoryId } = useParams();
  const categoryId = category ?? routeCategoryId;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPracticeComplete, setIsPracticeComplete] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [comingSoonMenu, setComingSoonMenu] = useState<"테스트" | "사전" | null>(null);
  const [cameraMessage, setCameraMessage] =
    useState("카메라 시작 버튼을 눌러주세요.");

  useEffect(() => {
    return () => {
      const stream = streamRef.current;

      if (!stream) {
        return;
      }

      stream.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  if (!isPracticeCategoryId(categoryId)) {
    return (
      <div className="practice-session-error">
        <p>올바르지 않은 연습 유형입니다.</p>

        <Link to="/practice">연습 선택 화면으로 돌아가기</Link>
      </div>
    );
  }

  const currentPracticeItems = practiceItems[categoryId];
  const currentPracticeItem = currentPracticeItems[currentIndex];
  const isFirstItem = currentIndex === 0;
  const isLastItem = currentIndex === currentPracticeItems.length - 1;

  const stopCamera = () => {
    const stream = streamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    streamRef.current = null;

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
    if (isLastItem) {
      stopCamera();
      setIsPracticeComplete(true);

      return;
    }

    setCurrentIndex((previousIndex) => previousIndex + 1);
  };

  const handleRetryClick = () => {
    setCurrentIndex(0);
    setIsPracticeComplete(false);
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

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        await videoRef.current.play();
      }

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
      <header className="header">
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

        <nav className="nav" aria-label="주요 메뉴">
          <Link to="/main">메인페이지</Link>

          <Link className="active" to="/practice">연습</Link>
          <button type="button" onClick={() => setComingSoonMenu("테스트")}>테스트</button>
          <button type="button" onClick={() => setComingSoonMenu("사전")}>사전</button>
          <Link to="/game">게임</Link>
        </nav>

        <button className="mypage-button" type="button">
          마이페이지
        </button>
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

                <div
                  className="practice-answer-placeholder"
                  aria-label="정답 동작 이미지 영역"
                />

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
              <video
                className="practice-camera-video"
                ref={videoRef}
                autoPlay
                muted
                playsInline
              />

              {isCameraActive && (
                <span className="practice-camera-live">● LIVE</span>
              )}

              {!isCameraActive && (
                <p className="practice-camera-message">{cameraMessage}</p>
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
                  <strong>{currentPracticeItems.length}개</strong>
                  <span>완료 문제</span>
                </div>

                <div>
                  <strong>100%</strong>
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

      {comingSoonMenu ? (
        <div className="practice-session-coming-soon-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComingSoonMenu(null); }}>
          <section className="practice-session-coming-soon-dialog" data-theme={comingSoonMenu === "테스트" ? "test" : "dictionary"} role="dialog" aria-modal="true" aria-labelledby="practice-session-coming-soon-title">
            <button type="button" className="practice-session-coming-soon-close" aria-label="팝업 닫기" onClick={() => setComingSoonMenu(null)}><X aria-hidden="true" size={20} /></button>
            <Sparkles className="practice-session-coming-soon-sparkle" aria-hidden="true" size={30} />
            <img src={otterCharacter} alt="" />
            <h2 id="practice-session-coming-soon-title">수달이 개발중..</h2>
            <p>조금만 기다려 주세요!<br />{comingSoonMenu} 기능을 만들고 있어요.</p>
            <button type="button" className="practice-session-coming-soon-confirm" onClick={() => setComingSoonMenu(null)}>기다릴게!</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
