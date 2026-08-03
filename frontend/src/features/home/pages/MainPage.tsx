import { useEffect, useState, type TransitionEvent } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { getSelectedHabitatId } from "../../profile/data/selectedHabitat";
import otterInBed from "../../profile/assets/habitats/otter_in_bed.png";
import { AttendanceCard } from "../components/AttendanceCard";
import {
  findHabitatIndex,
} from "../data/otterHabitat";
import otterInCave from "../assets/otter_in_cave.webp";
import otterInRock from "../assets/otter_in_rock.webp";
import otterWithLog from "../assets/otter_with_log.webp";
import otterWithLog2 from "../assets/otter_with_log_2.webp";
import rocksLeft from "../assets/rocks_left.webp";
import rocksRight from "../assets/rocks_right.webp";
import { AppNav } from "../../../shared/nav/AppNav";
import "./MainPage.css";

interface LearningMenu {
  title: string;
  description: string;
  icon: string;
  tone: string;
  path: string;
}

const learningMenus: LearningMenu[] = [
  {
    title: "연습",
    description: "가이드 동작을 보며 수어 표현을 천천히 익혀요.",
    icon: "♩",
    tone: "practice",
    path: "/practice",
  },
  {
    title: "테스트",
    description: "배운 내용을 퀴즈 형식으로 확인하고 점수를 기록해요.",
    icon: "✓",
    tone: "test",
    path: "/test",
  },
  {
    title: "게임",
    description: "간단한 게임을 통해 수어를 즐겁게 연습해요.",
    icon: "◆",
    tone: "game",
    path: "/game",
  },
  {
    title: "오답노트",
    description: "틀린 문제를 모아 다시 연습하고 복습해요.",
    icon: "↺",
    tone: "review",
    path: "/review-notes",
  },
  {
    title: "사전",
    description: "자음, 모음, 숫자와 자주 쓰는 표현을 찾아봐요.",
    icon: "A",
    tone: "dictionary",
    path: "/dictionary",
  },
];

const VISIBLE_MENU_COUNT = 3;

/**
 * 화살표로 오가는 두 묶음의 시작 위치.
 * [연습·테스트·게임]과 [게임·오답노트·사전]이고, 게임이 양쪽에 걸쳐 있다.
 */
const MENU_PAGE_STARTS = [0, learningMenus.length - VISIBLE_MENU_COUNT];

/**
 * 끊김 없이 도는 띠를 만들려고 메뉴를 세 벌 늘어놓는다.
 * 가운데 벌을 기준으로 좌우 어느 쪽으로 밀어도 보여줄 카드가 남아 있고,
 * 이동이 끝난 뒤 다시 가운데 벌로 되돌리면 무한히 돌 수 있다.
 */
const MENU_BAND = [...learningMenus, ...learningMenus, ...learningMenus];

/** 가운데 벌의 시작 위치. 트랙의 기준점이다. */
const MENU_BAND_ORIGIN = learningMenus.length;

interface OtterHabitat {
  id: string;
  image: string;
  alt: string;
  /** 그림마다 여백이 달라, 다른 집과 크기를 맞출 보정 클래스가 필요할 때 쓴다. */
  imageClass?: string;
}

/**
 * 히어로에 보여줄 수달의 집. [이사하기]를 누르면 순서대로 돌아간다.
 * id는 선택을 저장하는 값이므로, 순서를 바꿔도 id는 그대로 둬야 한다.
 */
const otterHabitats: readonly OtterHabitat[] = [
  {
    id: "log-pond",
    image: otterWithLog,
    alt: "통나무에 기대어 쉬고 있는 수달",
    imageClass: "main-otter-log",
  },
  {
    id: "log-rest",
    image: otterWithLog2,
    alt: "물 위 통나무에 앉아 있는 수달",
    imageClass: "main-otter-on-log",
  },
  { id: "rock-home", image: otterInRock, alt: "바위 안에서 쉬고 있는 수달" },
  {
    id: "forest-cave",
    image: otterInCave,
    alt: "굴 안에서 쉬고 있는 수달",
    imageClass: "main-otter-cave",
  },
  {
    id: "cozy-bed",
    image: otterInBed,
    alt: "물가 굴 안에서 쉬고 있는 수달",
    imageClass: "main-otter-riverside",
  },
];

const learningGuideSteps = [
  {
    title: "사전",
    description: "궁금한 수어 표현과 손 모양을 찾아봐요.",
  },
  {
    title: "연습",
    description: "동작을 보고 직접 따라 하며 차근차근 익혀요.",
  },
  {
    title: "테스트",
    description: "배운 내용을 퀴즈로 풀며 제대로 익혔는지 확인해요.",
  },
  {
    title: "오답노트",
    description: "틀린 문제와 어려웠던 표현을 다시 복습해요.",
  },
  {
    title: "게임",
    description: "게임으로 재미있게 반복하며 수어의 달인이 되어보세요!",
  },
] as const;

export function MainPage() {
  const { accessToken } = useAuth();
  /** 트랙 왼쪽 끝에 놓인 카드가 띠에서 몇 번째인지. 가운데 벌에서 시작한다. */
  const [bandOffset, setBandOffset] = useState(MENU_BAND_ORIGIN);
  /** 지금 보고 있는 묶음. 이동 거리를 여기서 정한다. */
  const [menuPage, setMenuPage] = useState(0);
  /** 미끄러지는 중인지. 이동이 끝난 뒤 되돌릴 때는 꺼서 순간이동시킨다. */
  const [isSliding, setIsSliding] = useState(false);
  const [pageScale, setPageScale] = useState(1);
  const [isLearningGuideOpen, setIsLearningGuideOpen] = useState(false);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  /** 지난번에 골라 둔 집에서 시작한다. 기록이 없으면 첫 집이다. */
  const [habitatIndex] = useState(() =>
    findHabitatIndex(
      otterHabitats.map((option) => option.id),
      getSelectedHabitatId(),
    ),
  );

  const habitat = otterHabitats[habitatIndex];

  useEffect(() => {
    const updatePageScale = () => {
      setPageScale(
        Math.min(window.innerWidth / 1920, window.innerHeight / 1200),
      );
    };

    updatePageScale();
    window.addEventListener("resize", updatePageScale);
    return () => window.removeEventListener("resize", updatePageScale);
  }, []);

  /**
   * 반대 묶음으로 옮긴다. [>]는 카드가 왼쪽으로, [<]는 오른쪽으로 흐른다.
   *
   * 옮기는 칸 수는 방향과 지금 묶음에 따라 다르다. 다섯 칸이 둥글게 이어져 있어
   * 같은 묶음에 닿는 길이 양쪽으로 다르기 때문이다. 예를 들어 [연습·테스트·게임]에서
   * [게임·오답노트·사전]까지는 왼쪽으로 두 칸, 오른쪽으로는 세 칸이다.
   * 그래서 도착 묶음을 먼저 정하고, 화살표 방향으로 도는 거리를 계산한다.
   */
  const moveMenu = (direction: -1 | 1) => {
    // 미끄러지는 중에 또 누르면 되돌리는 시점과 엉키므로 무시한다.
    if (isSliding) return;

    const count = learningMenus.length;
    // 묶음이 둘뿐이라 어느 화살표를 눌러도 반대 묶음에 닿는다.
    const nextPage = (menuPage + 1) % MENU_PAGE_STARTS.length;
    const from = MENU_PAGE_STARTS[menuPage];
    const to = MENU_PAGE_STARTS[nextPage];

    // 화살표 방향으로만 돌아 도착 묶음까지 가는 거리.
    const step =
      direction === 1
        ? (to - from + count) % count
        : -((from - to + count) % count);

    setIsSliding(true);
    setMenuPage(nextPage);
    setBandOffset((current) => current + step);
  };

  /**
   * 이동이 끝나면 보이는 카드를 그대로 둔 채 기준점을 가운데 벌로 되돌린다.
   * 미끄러짐을 함께 끄기 때문에 화면에서는 아무 일도 일어나지 않은 것처럼 보이고,
   * 덕분에 같은 방향으로 계속 눌러도 벌이 모자라지 않는다.
   */
  const finishSlide = () => {
    setIsSliding(false);
    setBandOffset((current) => {
      const count = learningMenus.length;

      if (current < count) return current + count;
      if (current >= count * 2) return current - count;
      return current;
    });
  };

  /**
   * 전환이 끝나는 것을 기다린다. 카드에 걸린 전환(hover 등)도 여기까지 올라오므로
   * 트랙 자신의 전환만 골라 받는다.
   */
  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    finishSlide();
  };

  /**
   * 전환이 끝났다는 알림이 오지 않는 환경(모션 최소화 설정 등)에서도
   * 다음 이동이 막히지 않도록, 전환 시간이 지나면 스스로 마무리한다.
   */
  useEffect(() => {
    if (!isSliding) return;

    const timer = window.setTimeout(finishSlide, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSliding]);

  return (
    <div className="main-page">
      <div
        className="main-canvas"
        style={{ transform: `translate(-50%, -50%) scale(${pageScale})` }}
      >
        <header className="main-header">
          <AppNav prefix="main" metric="fixed" />
        </header>

        <main className="main-content">
          <section className="main-hero">
            <div className="main-hero-heading">
              <h1>
                차분하게 배우고,<br />
                꾸준하게 쌓아가는 수어 학습
              </h1>
              <p>손 모양을 보고 따라 하며 차근차근 익혀보세요.</p>
            </div>

            {/* 프레임이 위치를 맡아, [이사하기]를 수달 왼쪽 위에 붙일 수 있다. */}
            <div className="main-otter-frame">
              <button
                className="main-otter-attendance-button"
                type="button"
                onClick={() => setIsAttendanceOpen(true)}
              >
                출석체크
              </button>

              <img
                className={
                  habitat.imageClass
                    ? `main-otter ${habitat.imageClass}`
                    : "main-otter"
                }
                src={habitat.image}
                alt={habitat.alt}
              />
            </div>

            {/* <img
              className="main-rocks main-rocks-left"
              src={rocksLeft}
              alt=""
              aria-hidden="true"
            />
            <img
              className="main-rocks main-rocks-right"
              src={rocksRight}
              alt=""
              aria-hidden="true"
            /> */}

            <div className="main-hero-actions">
              <button
                className="main-secondary-button"
                type="button"
                onClick={() => setIsLearningGuideOpen(true)}
              >
                학습 방법 보기
              </button>
            </div>
          </section>

          <section className="learning-menu-section" id="learning-menu">
            <div className="learning-menu-heading">
              <h2>학습 메뉴</h2>
              <p>필요한 기능을 선택해 바로 시작하세요.</p>
            </div>

            <div className="learning-carousel">
              <button
                className="carousel-button carousel-button-prev"
                type="button"
                aria-label="학습 메뉴 왼쪽으로 넘기기"
                disabled={learningMenus.length <= VISIBLE_MENU_COUNT}
                onClick={() => moveMenu(-1)}
              >
                ‹
              </button>

              {/* 띠 전체를 늘어놓고 창만큼만 보여준다. */}
              <div className="learning-menu-viewport">
                <div
                  className="learning-menu-track"
                  data-sliding={isSliding ? "true" : undefined}
                  style={{
                    transform: `translateX(calc(${-bandOffset} * (var(--menu-slot) + var(--menu-card-gap))))`,
                  }}
                  onTransitionEnd={handleTransitionEnd}
                >
                  {MENU_BAND.map((menu, index) => {
                    // 창 밖의 사본은 보조기기와 탭 이동에서 빼, 같은 메뉴가
                    // 세 번씩 읽히지 않게 한다.
                    const isVisible =
                      index >= bandOffset &&
                      index < bandOffset + VISIBLE_MENU_COUNT;

                    return (
                      <Link
                        className="learning-menu-card"
                        to={menu.path}
                        key={`${index}-${menu.title}`}
                        aria-hidden={isVisible ? undefined : "true"}
                        tabIndex={isVisible ? undefined : -1}
                      >
                        <span className={`learning-menu-icon ${menu.tone}`}>
                          {menu.icon}
                        </span>
                        <span className="learning-menu-copy">
                          <strong>{menu.title}</strong>
                          <span>{menu.description}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>

              <button
                className="carousel-button carousel-button-next"
                type="button"
                aria-label="학습 메뉴 오른쪽으로 넘기기"
                disabled={learningMenus.length <= VISIBLE_MENU_COUNT}
                onClick={() => moveMenu(1)}
              >
                ›
              </button>
            </div>
          </section>
        </main>

        {isAttendanceOpen && (
          <div
            className="learning-guide-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-title"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) {
                setIsAttendanceOpen(false);
              }
            }}
          >
            <section className="learning-guide-modal attendance-modal">
              <button
                className="learning-guide-close"
                type="button"
                aria-label="출석체크 닫기"
                onClick={() => setIsAttendanceOpen(false)}
              >
                ×
              </button>

              <h2 id="attendance-title">출석체크</h2>

              <AttendanceCard accessToken={accessToken} />
            </section>
          </div>
        )}

        {isLearningGuideOpen && (
          <div
            className="learning-guide-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="learning-guide-title"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) {
                setIsLearningGuideOpen(false);
              }
            }}
          >
            <section className="learning-guide-modal">
              <button
                className="learning-guide-close"
                type="button"
                aria-label="학습 방법 안내 닫기"
                onClick={() => setIsLearningGuideOpen(false)}
              >
                ×
              </button>

              <h2 id="learning-guide-title">
                수어의 달인이 되는 추천 학습 순서
              </h2>
              <p className="learning-guide-intro">
                궁금한 표현을 사전에서 찾아보고, 손 모양과 동작을 연습하며
                차근차근 익혀보세요.
                <br />
                테스트로 실력을 확인하고 틀린 문제는 오답노트에서 다시 복습할
                수 있어요.
                <br />
                마지막으로 게임을 통해 재미있게 반복하며 수어의 달인에
                도전해보세요!
              </p>

              <ol className="learning-guide-steps">
                {learningGuideSteps.map((step, index) => (
                  <li key={step.title}>
                    <span className={index === learningGuideSteps.length - 1 ? "active" : ""}>
                      {index + 1}
                    </span>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
