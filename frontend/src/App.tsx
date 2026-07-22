import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainPage } from "./features/home/pages/MainPage"; 
import { StandaloneGameHarness } from "./game";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* '/' 주소(기본 메인 주소)로 들어오면 MainPage를 보여줌 */}
        <Route path="/" element={<MainPage />} />

        {/* 단독 게임 테스트 주소 (예: /game) */}
        <Route path="/game" element={<StandaloneGameHarness />} />
      </Routes>
    </BrowserRouter>
  );
}
