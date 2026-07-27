import "./PracticeSessionPage.css";
import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import otterClapImage from "../assets/otter_clap.png";
import bieupImage from "../assets/consonant/consonant-bieup.png";
import chieutImage from "../assets/consonant/consonant-chieut.png";
import digeutImage from "../assets/consonant/consonant-digeut.png";
import giyeokImage from "../assets/consonant/consonant-giyeok.png";
import hieutImage from "../assets/consonant/consonant-hieut.png";
import ieungImage from "../assets/consonant/consonant-ieung.png";
import jieutImage from "../assets/consonant/consonant-jieut.png";
import kieukImage from "../assets/consonant/consonant-kieuk.png";
import mieumImage from "../assets/consonant/consonant-mieum.png";
import nieunImage from "../assets/consonant/consonant-nieun.png";
import pieupImage from "../assets/consonant/consonant-pieup.png";
import rieulImage from "../assets/consonant/consonant-rieul.png";
import siotImage from "../assets/consonant/consonant-siot.png";
import tieutImage from "../assets/consonant/consonant-tieut.png";
import aImage from "../assets/vowel/vowel-a.png";
import aeImage from "../assets/vowel/vowel-ae.png";
import eImage from "../assets/vowel/vowel-e.png";
import eoImage from "../assets/vowel/vowel-eo.png";
import euImage from "../assets/vowel/vowel-eu.png";
import iImage from "../assets/vowel/vowel-i.png";
import oImage from "../assets/vowel/vowel-o.png";
import oeImage from "../assets/vowel/vowel-oe.png";
import uImage from "../assets/vowel/vowel-u.png";
import uiImage from "../assets/vowel/vowel-ui.png";
import wiImage from "../assets/vowel/vowel-wi.png";
import yaImage from "../assets/vowel/vowel-ya.png";
import yaeImage from "../assets/vowel/vowel-yae.png";
import yeImage from "../assets/vowel/vowel-ye.png";
import yeoImage from "../assets/vowel/vowel-yeo.png";
import yoImage from "../assets/vowel/vowel-yo.png";
import yuImage from "../assets/vowel/vowel-yu.png";
import oneImage from "../assets/number/number-one.png";
import twoImage from "../assets/number/number-two.png";
import threeImage from "../assets/number/number-three.png";
import fourImage from "../assets/number/number-four.png";
import fiveImage from "../assets/number/number-five.png";
import sixImage from "../assets/number/number-six.png";
import sevenImage from "../assets/number/number-seven.png";
import eightImage from "../assets/number/number-eight.png";
import nineImage from "../assets/number/number-nine.png";
import tenImage from "../assets/number/number-ten.png";
import otterCharacter from "../../../game/block-stacking/assets/game-menu-otter.png";

type PracticeCategoryId = "consonant" | "vowel" | "number";

interface PracticeSessionPageProps {
  category?: PracticeCategoryId;
  onExit?: () => void;
}

interface PracticeItem {
  symbol: string;
  name: string;
  image?: string;
  description?: string[];
}

const practiceItems: Record<PracticeCategoryId, PracticeItem[]> = {
  consonant: [
    {
      symbol: "ㄱ",
      name: "기역",
      image: giyeokImage,
      description: [
        "검지를 아래로 곧게 펴고, 엄지와 검지를 제외한 나머지 손가락은 접어주세요.",
        "손등이 보이도록 손을 내립니다 합니다.",
      ],
    },
    {
      symbol: "ㄴ",
      name: "니은",
      image: nieunImage,
      description: [
        "검지는 옆으로, 엄지는 위로 곧게 펴서 두 손가락이 직각을 이루게 해주세요.",
        "나머지 손가락은 손바닥 안쪽으로 접습니다.",
      ],
    },
    {
      symbol: "ㄷ",
      name: "디귿",
      image: digeutImage,
      description: [
        "검지와 중지를 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손등이 보이도록 손을 옆으로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㄹ",
      name: "리을",
      image: rieulImage,
      description: [
        "검지, 중지, 약지를 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손등이 보이도록 손가락 끝을 옆으로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅁ",
      name: "미음",
      image: mieumImage,
      description: [
        "검지와 중지를 위로 나란히 세우고, 약지와 새끼손가락은 접어주세요.",
        "엄지는 접은 손가락 위에 가볍게 올리고 손바닥이 앞을 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅂ",
      name: "비읍",
      image: bieupImage,
      description: [
        "엄지를 접고 나머지 손가락을 나란히 펴주세요",
        "손바닥이 앞을 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅅ",
      name: "시옷",
      image: siotImage,
      description: [
        "검지와 중지를 아래로 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손등이 보이도록 손끝을 아래로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅇ",
      name: "이응",
      image: ieungImage,
      description: [
        "엄지와 검지 끝을 맞대어 동그라미를 만들어주세요.",
        "중지, 약지, 새끼손가락은 위로 자연스럽게 펴고 손바닥이 앞을 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅈ",
      name: "지읒",
      image: jieutImage,
      description: [
        "검지와 중지를 아래로 나란히 펴고, 엄지는 옆으로 벌려주세요.",
        "약지와 새끼손가락은 접고 손등이 보이도록 합니다.",
      ],
    },
    {
      symbol: "ㅊ",
      name: "치읓",
      image: chieutImage,
      description: [
        "검지, 중지, 약지를 아래로 나란히 펴고, 엄지는 옆으로 벌려주세요.",
        "새끼손가락은 접고 손등이 보이도록 손끝을 아래로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅋ",
      name: "키읔",
      image: kieukImage,
      description: [
        "가운데 손가락 하나를 아래로 곧게 펴고, 나머지 손가락은 접어주세요.",
        "엄지는 옆으로 벌리고 손등이 보이도록 합니다.",
      ],
    },
    {
      symbol: "ㅌ",
      name: "티읕",
      image: tieutImage,
      description: [
        "검지와 중지, 약지를 옆으로 펴고, 나머지 손가락은 접어주세요.",
        "손등이 보이도록 손을 옆으로 향하게 합니다.",
      ],
    },
    {
      symbol: "ㅍ",
      name: "피읖",
      image: pieupImage,
      description: [
        "네 손가락을 모두 접어 주먹을 만들어주세요.",
        "엄지는 접은 손가락 앞쪽을 감싸고 손바닥 쪽이 보이도록 세웁니다.",
      ],
    },
    {
      symbol: "ㅎ",
      name: "히읗",
      image: hieutImage,
      description: [
        "네 손가락을 접어 주먹을 만들고, 엄지만 위로 곧게 세워주세요.",
        "손가락이 앞쪽을 향하도록 합니다.",
      ],
    },
  ],
  vowel: [
    {
      symbol: "ㅏ",
      name: "아",
      image: aImage,
      description: [
        "검지를 위로 곧게 펴고, 나머지 손가락은 주먹을 쥐어주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅑ",
      name: "야",
      image: yaImage,
      description: [
        "검지와 중지를 위로 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅓ",
      name: "어",
      image: eoImage,
      description: [
        "주먹을 쥔 상태에서 엄지를 옆으로 곧게 펴주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅕ",
      name: "여",
      image: yeoImage,
      description: [
        "주먹을 쥔 상태에서 엄지와 검지를 옆으로 펴주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅗ",
      name: "오",
      image: oImage,
      description: [
        "검지를 위로 곧게 펴고, 나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅛ",
      name: "요",
      image: yoImage,
      description: [
        "검지와 중지를 위로 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅜ",
      name: "우",
      image: uImage,
      description: [
        "주먹을 쥔 상태에서 검지를 아래로 곧게 펴주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅠ",
      name: "유",
      image: yuImage,
      description: [
        "주먹을 쥔 상태에서 검지와 중지를 아래로 나란히 펴주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅡ",
      name: "으",
      image: euImage,
      description: [
        "검지를 옆으로 곧게 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 아래를 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅣ",
      name: "이",
      image: iImage,
      description: [
        "엄지와 새끼손가락을 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅐ",
      name: "애",
      image: aeImage,
      description: [
        "검지와 새끼손가락을 함께 위로 펴주세요.",
        "나머지 손가락은 접고 손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅒ",
      name: "얘",
      image: yaeImage,
      description: [
        "엄지와 약지를 접고 나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅔ",
      name: "에",
      image: eImage,
      description: [
        "검지와 새끼손가락을 펴고 나머지 손가락은 접어주세요.",
        "손바닥이 옆을 향하도록 손을 돌려주세요.",
      ],
    },
    {
      symbol: "ㅖ",
      name: "예",
      image: yeImage,
      description: [
        "엄지와 약지를 접고 나머지 손가락은 펴주세요.",
        "손바닥이 옆을 향하도록 손을 돌려주세요.",
      ],
    },
    {
      symbol: "ㅚ",
      name: "외",
      image: oeImage,
      description: [
        "검지와 새끼손가락을 펴고 나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅟ",
      name: "위",
      image: wiImage,
      description: [
        "검지와 새끼손가락을 펴고 나머지 손가락은 접어주세요.",
        "손가락은 바닥을, 손등은 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "ㅢ",
      name: "의",
      image: uiImage,
      description: [
        "검지와 새끼손가락을 펴고 나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 합니다.",
      ],
    },
  ],
  number: [
    {
      symbol: "1",
      name: "하나",
      image: oneImage,
      description: [
        "검지를 위로 곧게 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 손을 세웁니다.",
      ],
    },
    {
      symbol: "2",
      name: "둘",
      image: twoImage,
      description: [
        "검지와 중지를 위로 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 손을 세웁니다.",
      ],
    },
    {
      symbol: "3",
      name: "셋",
      image: threeImage,
      description: [
        "검지, 중지, 약지를 위로 나란히 펴고, 나머지 손가락은 접어주세요.",
        "손바닥이 앞을 향하도록 손을 세웁니다.",
      ],
    },
    {
      symbol: "4",
      name: "넷",
      image: fourImage,
      description: [
        "엄지를 접고, 나머지 네 손가락을 위로 나란히 펴주세요.",
        "손바닥이 앞을 향하도록 손을 세웁니다.",
      ],
    },
    {
      symbol: "5",
      name: "다섯",
      image: fiveImage,
      description: [
        "네 손가락을 모두 접고, 엄지만 옆으로 곧게 펴주세요.",
        "손바닥이 앞을 향하도록 손을 세웁니다.",
      ],
    },
    {
      symbol: "6",
      name: "여섯",
      image: sixImage,
      description: [
        "엄지를 위로, 검지를 옆으로 곧게 펴고 나머지 손가락은 접어주세요.",
        "손등이 앞을 향하도록 손을 옆으로 기울입니다.",
      ],
    },
    {
      symbol: "7",
      name: "일곱",
      image: sevenImage,
      description: [
        "엄지는 위로 세우고, 검지와 중지는 옆으로 나란히 펴주세요.",
        "나머지 손가락은 접고 손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "8",
      name: "여덟",
      image: eightImage,
      description: [
        "엄지는 위로 세우고, 검지·중지·약지는 옆으로 나란히 펴주세요.",
        "새끼손가락은 접고 손등이 앞을 향하도록 합니다.",
      ],
    },
    {
      symbol: "9",
      name: "아홉",
      image: nineImage,
      description: [
        "엄지를 위로 세우고, 나머지 네 손가락을 옆으로 나란히 펴주세요.",
        "손등이 앞을 향하도록 손을 옆으로 기울입니다.",
      ],
    },
    {
      symbol: "10",
      name: "열",
      image: tenImage,
      description: [
        "엄지와 검지 끝을 맞대어 동그라미를 만들어주세요.",
        "나머지 세 손가락은 위로 자연스럽게 펴고 손바닥이 앞을 향하도록 합니다.",
      ],
    },
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

        <Link className="mypage-button" to="/profile">
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
