import "./TestPage.css";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TestProgressView } from "../components/TestProgressView";
import { TestResultView } from "../components/TestResultView";
import { TestSetupView } from "../components/TestSetupView";
import type {
  TestQuestion,
  TestQuestionResult,
  TestSettings,
} from "../data/testSession";
import { buildTestQuestions } from "../data/testSession";

/** 테스트 진행 단계. 사전/연습과 같이 한 라우트 안에서 상태로 전환한다. */
type TestPhase = "setup" | "progress" | "result";

export function TestPage() {
  const [testScale, setTestScale] = useState(1);
  const [phase, setPhase] = useState<TestPhase>("setup");
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [results, setResults] = useState<TestQuestionResult[]>([]);

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
    setPhase("progress");
  };

  const handleFinish = (finalResults: TestQuestionResult[]) => {
    setResults(finalResults);
    setPhase("result");
  };

  const handleRetry = () => {
    setQuestions([]);
    setResults([]);
    setPhase("setup");
  };

  return (
    <div className="test-page">
      <div
        className="test-canvas"
        style={{ transform: `translate(-50%, -50%) scale(${testScale})` }}
      >
        <header className="test-header">
          <nav className="test-nav" aria-label="주요 메뉴">
            <Link to="/main">메인페이지</Link>
            <Link to="/practice">연습</Link>
            <Link className="active" to="/test">
              테스트
            </Link>
            <Link to="/dictionary">사전</Link>
            <Link to="/review-notes">오답노트</Link>
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
      </div>
    </div>
  );
}
