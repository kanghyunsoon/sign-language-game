import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainPage } from "./features/home/pages/MainPage"; 
import { PreLoginPage } from "./features/home/pages/PreLoginPage";
import { LoginPage } from "./features/auth/pages/LoginPage";
import { SignUpPage } from "./features/auth/pages/SignUpPage";
import { PracticeHomePage } from "./features/learning/pages/PracticeHomePage";
import { GameModule } from "./game";
import { STANDALONE_GAME_CONFIG } from "./game/config/standaloneConfig";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 로그인 전 서비스 소개 화면 */}
        <Route path="/" element={<PreLoginPage />} />

        {/* 로그인 화면 */}
        <Route path="/login" element={<LoginPage />} />

        {/* 회원가입 화면 */}
        <Route path="/signup" element={<SignUpPage />} />
        {/* 로그인 후 메인 화면 */}
        <Route path="/main" element={<MainPage />} />

        {/* "/practice" 주소로 들어오면 PracticeHomePage를 보여줌 */}
        <Route path="/practice" element={<PracticeHomePage />} />
        
        {/* 단독 게임 테스트 주소 (예: /game) */}
        <Route path="/game/*" element={<GameModule
              user={{
                userId: "00000000-0000-4000-8000-000000000001",
                displayName: "개발 사용자",
              }}
              config={STANDALONE_GAME_CONFIG}
            />
          }
        />

      </Routes>
    </BrowserRouter>
  );
}
