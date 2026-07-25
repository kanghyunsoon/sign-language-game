import { Navigate, Route, Routes } from "react-router-dom";

import { LoginPage } from "./features/auth/pages/LoginPage";
import { SignUpPage } from "./features/auth/pages/SignUpPage";
import { MainPage } from "./features/home/pages/MainPage";
import { PreLoginPage } from "./features/home/pages/PreLoginPage";
import { PracticeHomePage } from "./features/learning/pages/PracticeHomePage";
import { ProfilePage } from "./features/profile/pages/ProfilePage";
import { StandaloneGameHarness } from "./game";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PreLoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/main" element={<MainPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/practice" element={<PracticeHomePage />} />
      <Route path="/game/*" element={<StandaloneGameHarness />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
