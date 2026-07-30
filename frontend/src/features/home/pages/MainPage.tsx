import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { SiteFooter } from "../../../shared/components/SiteFooter";
import { AttendanceCard } from "../components/AttendanceCard";
import otterInRock from "../assets/otter_in_rock.png";
import rocksLeft from "../assets/rocks_left.png";
import rocksRight from "../assets/rocks_right.png";
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
    title: "게임",
    description: "간단한 게임을 통해 수어를 즐겁게 연습해요.",
    icon: "◆",
    tone: "game",
    path: "/game",
  },
  {
    title: "테스트",
    description: "배운 내용을 퀴즈 형식으로 확인하고 점수를 기록해요.",
    icon: "✓",
    tone: "test",
    path: "/test",
  },
  {
    title: "사전",
    description: "자음, 모음, 숫자와 자주 쓰는 표현을 찾아봐요.",
    icon: "A",
    tone: "dictionary",
    path: "/dictionary",
  },
  {
    title: "오답노트",
    description: "틀린 문제를 모아 다시 연습하고 복습해요.",
    icon: "↺",
    tone: "review",
    path: "/review-notes",
  },
];

const VISIBLE_MENU_COUNT = 3;

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
  const [menuStartIndex, setMenuStartIndex] = useState(0);
  const [pageScale, setPageScale] = useState(1);
  const [isLearningGuideOpen, setIsLearningGuideOpen] = useState(false);
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);

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

  const visibleMenus = Array.from(
    { length: VISIBLE_MENU_COUNT },
    (_, offset) => learningMenus[(menuStartIndex + offset) % learningMenus.length],
  );

  const moveMenu = (direction: -1 | 1) => {
    setMenuStartIndex(
      (currentIndex) =>
        (currentIndex + direction + learningMenus.length) % learningMenus.length,
    );
  };

  return (
    <div className="main-page">
      <div
        className="main-canvas"
        style={{ transform: `translate(-50%, -50%) scale(${pageScale})` }}
      >
        <header className="main-header">
          <nav className="main-nav" aria-label="주요 메뉴">
            <Link className="active" to="/main">메인페이지</Link>
            <Link to="/practice">연습</Link>
            <Link to="/test">테스트</Link>
            <Link to="/dictionary">사전</Link>
            <Link to="/review-notes">오답노트</Link>
            <Link to="/game">게임</Link>
          </nav>

          <Link className="main-mypage-button" to="/profile">
            마이페이지
          </Link>
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

            <img
              className="main-otter"
              src={otterInRock}
              alt="바위 안에서 쉬고 있는 수달"
            />

            <img
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
            />

            <div className="main-hero-actions">
              <button
                className="main-secondary-button"
                type="button"
                onClick={() => setIsAttendanceOpen(true)}
              >
                출석체크
              </button>

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
                aria-label="이전 학습 메뉴 보기"
                onClick={() => moveMenu(-1)}
              >
                ‹
              </button>

              <div className="learning-menu-cards" aria-live="polite">
                {visibleMenus.map((menu, index) => (
                  <Link
                    className="learning-menu-card"
                    to={menu.path}
                    key={`${menu.title}-${menuStartIndex}-${index}`}
                  >
                    <span className={`learning-menu-icon ${menu.tone}`}>
                      {menu.icon}
                    </span>
                    <span className="learning-menu-copy">
                      <strong>{menu.title}</strong>
                      <span>{menu.description}</span>
                    </span>
                  </Link>
                ))}
              </div>

              <button
                className="carousel-button carousel-button-next"
                type="button"
                aria-label="다음 학습 메뉴 보기"
                onClick={() => moveMenu(1)}
              >
                ›
              </button>
            </div>
          </section>
        </main>

        <SiteFooter sizing="fixed" />

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

              <AttendanceCard />
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
