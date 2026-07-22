import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainPage } from "./features/home/pages/MainPage"; 
import { PreLoginPage } from "./features/home/pages/PreLoginPage";
import { PracticeHomePage } from "./features/learning/pages/PracticeHomePage";
import { StandaloneGameHarness } from "./game";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 로그인 전 서비스 소개 화면 */}
        <Route path="/" element={<PreLoginPage />} />

        {/* 로그인 후 메인 화면 */}
        <Route path="/main" element={<MainPage />} />

        {/* "/practice" 주소로 들어오면 PracticeHomePage를 보여줌 */}
        <Route path="/practice" element={<PracticeHomePage />} />
        
        {/* 단독 게임 테스트 주소 (예: /game) */}
        <Route path="/game" element={<StandaloneGameHarness />} />
 
      </Routes>
    </BrowserRouter>
  );
}
