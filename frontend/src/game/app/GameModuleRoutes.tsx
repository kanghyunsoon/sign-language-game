import { Route, Routes } from "react-router-dom";

import { BattleGamePage } from "../block-stacking/battle/pages/BattleGamePage";
import { BattleBotPracticePage } from "../block-stacking/battle/pages/BattleBotPracticePage";
import { BattleResultPage } from "../block-stacking/pages/BattleResultPage";
import { BattleRoomListPage } from "../block-stacking/pages/BattleRoomListPage";
import { BattleWaitingRoomPage } from "../block-stacking/pages/BattleWaitingRoomPage";
import { GameModePage } from "../block-stacking/pages/GameModePage";
import { GameCategoryPage } from "../block-stacking/pages/GameCategoryPage";
import {
  isLineRaceDevHarnessEnabled,
  isLineRaceMockBotPracticeEnabled,
  LineRaceBotPracticePage,
  GlyphTurnBotPracticePage,
  LineRaceDevHarnessPage,
  LineRaceLobbyPage,
  LineRaceRoomCreatePage,
  LineRaceWaitingRoomPage,
  LineRaceGamePage,
  LineRaceResultPage,
} from "../glyph-battle";
import { SoloGamePage } from "../block-stacking/pages/SoloGamePage";
import { GameMediaDevHarnessPage } from "../media/dev/GameMediaDevHarnessPage";
import { RecognitionCrowdTestPage } from "../recognition/dev/RecognitionCrowdTestPage";

export function GameModuleRoutes() {
  return (
    <Routes>
      <Route index element={<GameCategoryPage />} />
      <Route path="block" element={<GameModePage />} />
      <Route path="line-race" element={<LineRaceLobbyPage />} />
      <Route path="line-race/create" element={<LineRaceRoomCreatePage />} />
      <Route path="line-race/rooms/:roomId" element={<LineRaceWaitingRoomPage />} />
      <Route path="line-race/rooms/:roomId/play" element={<LineRaceGamePage />} />
      <Route path="line-race/matches/:matchId" element={<LineRaceGamePage />} />
      <Route path="line-race/matches/:matchId/result" element={<LineRaceResultPage />} />
      <Route path="line-race/practice" element={<GlyphTurnBotPracticePage />} />
      {isLineRaceDevHarnessEnabled() ? <Route path="line-race/dev" element={<LineRaceDevHarnessPage />} /> : null}
      {isLineRaceMockBotPracticeEnabled() ? <Route path="line-race/dev/mock-practice" element={<LineRaceBotPracticePage />} /> : null}
      <Route path="solo" element={<SoloGamePage />} />
      <Route path="battle" element={<BattleRoomListPage />} />
      {import.meta.env.DEV ? <Route path="battle/practice" element={<BattleBotPracticePage key="battle-bot-runtime-v9" />} /> : null}
      <Route path="battle/:roomId" element={<BattleWaitingRoomPage />} />
      <Route path="battle/:roomId/play" element={<BattleGamePage />} />
      <Route path="battle/:roomId/result" element={<BattleResultPage />} />
      {isGameMediaDevHarnessEnabled() ? <Route path="media/dev" element={<GameMediaDevHarnessPage />} /> : null}
      {isRecognitionCrowdTestEnabled() ? <Route path="recognition/crowd-test" element={<RecognitionCrowdTestPage />} /> : null}
    </Routes>
  );
}

export function isGameMediaDevHarnessEnabled(dev = import.meta.env.DEV): boolean { return dev; }
export function isRecognitionCrowdTestEnabled(dev = import.meta.env.DEV): boolean { return dev; }
