import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { ProtectedRoute } from "./features/auth/components/ProtectedRoute";
import { LoginPage } from "./features/auth/pages/LoginPage";
import { SignUpPage } from "./features/auth/pages/SignUpPage";
import { MainPage } from "./features/home/pages/MainPage";
import { PreLoginPage } from "./features/home/pages/PreLoginPage";
import { DictionaryPage } from "./features/learning/pages/DictionaryPage";
import { ReviewNotesPage } from "./features/learning/pages/ReviewNotesPage";
import { PracticeHomePage } from "./features/learning/pages/PracticeHomePage";
import { TestPage } from "./features/learning/pages/TestPage";
import { ProfilePage } from "./features/profile/pages/ProfilePage";
import { GameModule } from "./game";
import { PROD_GAME_CONFIG } from "./game/config/prodConfig";

/** 로컬 UI·게임 검증용 로그인 우회. 프로덕션 빌드에서는 항상 비활성화된다. */
const LOCAL_GAME_LOGIN_BYPASS = import.meta.env.DEV;
const LOCAL_GAME_USER = { userId: "local-game-player", displayName: "로컬 플레이어" };

/** 인증된 사용자로 게임 모듈을 마운트한다(배포 Swagger 게이트웨이 사용). */
function AuthenticatedGameModule() {
  const { user, accessToken } = useAuth();
  if (LOCAL_GAME_LOGIN_BYPASS && (!user || !accessToken)) {
    return <GameModule user={LOCAL_GAME_USER} config={PROD_GAME_CONFIG} />;
  }
  // ProtectedRoute가 user/accessToken 존재를 보장하지만 타입 좁히기를 위해 방어한다.
  if (!user || !accessToken) return <Navigate to="/login" replace />;
  return <GameModule user={user} accessToken={accessToken} config={PROD_GAME_CONFIG} />;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<PreLoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route
          path="/main"
          element={
            <ProtectedRoute>
              <MainPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/practice"
          element={
            <ProtectedRoute>
              <PracticeHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dictionary"
          element={
            <ProtectedRoute>
              <DictionaryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/test"
          element={
            <ProtectedRoute>
              <TestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/review-notes"
          element={
            <ProtectedRoute>
              <ReviewNotesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/game/*"
          element={
            LOCAL_GAME_LOGIN_BYPASS
              ? <AuthenticatedGameModule />
              : <ProtectedRoute><AuthenticatedGameModule /></ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
