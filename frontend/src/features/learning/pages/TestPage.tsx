import "./TestPage.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getAccessToken } from "../../auth/token/tokenStore";
import {
  completeTestSession,
  startTestSession,
} from "../api/testSessionApi";
import otterClapImage from "../assets/otter_clap.png";
import { TestProgressView } from "../components/TestProgressView";
import { TestResultView } from "../components/TestResultView";
import { TestSetupView } from "../components/TestSetupView";
import type {
  TestQuestion,
  TestQuestionResult,
  TestSettings,
} from "../data/testSession";
import {
  buildTestQuestions,
  buildTestQuestionsFromSymbols,
} from "../data/testSession";
import { SYMBOLS_PARAM, parseSymbolSelection } from "../data/symbolSelection";

/** 테스트 진행 단계. 사전/연습과 같이 한 라우트 안에서 상태로 전환한다. */
type TestPhase = "setup" | "progress" | "result";

export function TestPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [testScale, setTestScale] = useState(1);
  const [phase, setPhase] = useState<TestPhase>("setup");
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [results, setResults] = useState<TestQuestionResult[]>([]);
  const [awardedExp, setAwardedExp] = useState(0);
  const [rewardAccuracy, setRewardAccuracy] = useState(0);
  const testSessionRef = useRef<Promise<number | null> | null>(null);

  const beginRewardSession = () => {
    const accessToken = getAccessToken();
    setAwardedExp(0);
    setRewardAccuracy(0);
    testSessionRef.current = accessToken
      ? startTestSession(accessToken)
          .then((session) => session.testSessionId)
          .catch(() => null)
      : Promise.resolve(null);
  };

  // 오답노트에서 넘어온 글자 묶음. 없으면 평소처럼 설정 화면부터 시작한다.
  const symbolsParam = searchParams.get(SYMBOLS_PARAM);
  const selectedQuestions = useMemo(
    () => parseSymbolSelection(symbolsParam),
    [symbolsParam],
  );
  const hasSelection = selectedQuestions.length > 0;

  // 오답노트로 진입하면 설정 화면을 건너뛰고 그 글자들로 바로 출제한다.
  useEffect(() => {
    if (!hasSelection) return;

    const builtQuestions = buildTestQuestionsFromSymbols(selectedQuestions);
    if (builtQuestions.length === 0) return;

    setQuestions(builtQuestions);
    setResults([]);
    beginRewardSession();
    setPhase("progress");
  }, [hasSelection, selectedQuestions]);

  useEffect(() => {
    const updateTestScale = () => {
      setTestScale(
        Math.min(window.innerWidth / 1920, window.innerHeight / 1200),
      );
    };

    updateTestScale();
    window.addEventListener("resize", updateTestScale);
    return () => window.removeEventListener("resize", updateTestScale);
  }, []);

  const handleStart = (settings: TestSettings) => {
    const builtQuestions = buildTestQuestions(settings);

    if (builtQuestions.length === 0) {
      return;
    }

    setQuestions(builtQuestions);
    setResults([]);
    beginRewardSession();
    setPhase("progress");
  };

  const handleFinish = (finalResults: TestQuestionResult[]) => {
    setResults(finalResults);
    setPhase("result");

    const accessToken = getAccessToken();
    const session = testSessionRef.current;
    if (!accessToken || !session) return;

    const correctCount = finalResults.filter(
      (result) => result.state === "correct",
    ).length;

    void session
      .then((testSessionId) =>
        testSessionId === null
          ? null
          : completeTestSession(accessToken, testSessionId, {
              correctCount,
              totalCount: finalResults.length,
            }),
      )
      .then((completion) => {
        if (
          completion?.passedRewardThreshold &&
          completion.awardedExp > 0
        ) {
          const completedCorrectCount = completion.correctCount ?? correctCount;
          const completedTotalCount =
            completion.totalCount ?? finalResults.length;
          setAwardedExp(completion.awardedExp);
          setRewardAccuracy(
            Math.round((completedCorrectCount / completedTotalCount) * 100),
          );
        }
      })
      .catch(() => {
        // 결과 화면은 유지하고, 보상 저장 실패 시 XP 성공 화면만 표시하지 않는다.
      });
  };

  /**
   * 진행 화면에서 한 단계 뒤로. 들어온 경로로 되돌린다.
   * 오답노트에서 왔으면 오답노트로, 설정 화면에서 왔으면 설정 화면으로 간다.
   */
  const handleBackFromProgress = () => {
    if (hasSelection) {
      navigate("/review-notes");
      return;
    }

    setQuestions([]);
    setResults([]);
    setAwardedExp(0);
    setRewardAccuracy(0);
    setPhase("setup");
  };

  const handleRetry = () => {
    setResults([]);

    // 오답노트로 들어왔다면 설정 화면 대신 같은 글자들을 다시 출제한다.
    if (hasSelection) {
      const builtQuestions = buildTestQuestionsFromSymbols(selectedQuestions);

      if (builtQuestions.length > 0) {
        setQuestions(builtQuestions);
        beginRewardSession();
        setPhase("progress");
        return;
      }
    }

    setQuestions([]);
    setPhase("setup");
  };

  return (
    <div className="test-page">
      <div
        className="test-canvas"
        style={{ transform: `translate(-50%, -50%) scale(${testScale})` }}
      >
        <header className="test-header">
          {phase === "progress" && (
            <button
              className="test-page-back-button"
              type="button"
              aria-label="뒤로 가기"
              onClick={handleBackFromProgress}
            >
              ←
            </button>
          )}

          <nav className="test-nav" aria-label="주요 메뉴">
            <Link to="/main">메인페이지</Link>
            <Link to="/practice">연습</Link>
            <Link className="active" to="/test">테스트</Link>
            <Link to="/review-notes">오답노트</Link>
            <Link to="/dictionary">사전</Link>
            <Link to="/game">게임</Link>
          </nav>

          <Link className="test-mypage-button" to="/profile">
            마이페이지
          </Link>
        </header>

        {phase === "setup" && <TestSetupView onStart={handleStart} />}

        {phase === "progress" && (
          <TestProgressView questions={questions} onFinish={handleFinish} />
        )}

        {phase === "result" && (
          <TestResultView results={results} onRetry={handleRetry} />
        )}

        {awardedExp > 0 && (
          <div
            className="test-reward-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="test-reward-title"
          >
            <section className="test-reward-card">
              <img src={otterClapImage} alt="" aria-hidden="true" />
              <h2 id="test-reward-title">{awardedExp}XP를 얻었어요!</h2>
              <p>
                정답률 {rewardAccuracy}% 달성! 보상으로 {awardedExp}XP를
                받았어요.
              </p>
              <Link to="/profile">총 경험치 보러 가기</Link>
            </section>
          </div>
        )}

      </div>
    </div>
  );
}
