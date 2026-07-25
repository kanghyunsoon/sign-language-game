import { Navigate, Route, Routes } from "react-router-dom";

import { BattleGamePage } from "../block-stacking/battle/pages/BattleGamePage";
import { BattleBotPracticePage } from "../block-stacking/battle/pages/BattleBotPracticePage";
import { BattleResultPage } from "../block-stacking/pages/BattleResultPage";
import { BattleRoomListPage } from "../block-stacking/pages/BattleRoomListPage";
import { BattleWaitingRoomPage } from "../block-stacking/pages/BattleWaitingRoomPage";
import { GameModePage } from "../block-stacking/pages/GameModePage";
import { GameCategoryPage } from "../block-stacking/pages/GameCategoryPage";
import { GlyphTurnBotPracticePage } from "../glyph-battle";
import { GlyphTurnOnlinePage } from "../glyph-battle/pages/GlyphTurnOnlinePage";
import { SoloGamePage } from "../block-stacking/pages/SoloGamePage";
import { RecognitionCrowdTestPage } from "../recognition/dev/RecognitionCrowdTestPage";

export function GameModuleRoutes() {
  return (
    <Routes>
      <Route index element={<GameCategoryPage />} />
      <Route path="block" element={<GameModePage />} />
      <Route path="turn-battle" element={<BattleRoomListPage mode="TURN" />} />
      <Route path="turn-battle/practice" element={<GlyphTurnBotPracticePage />} />
      <Route path="turn-battle/:roomId" element={<BattleWaitingRoomPage mode="TURN" />} />
      <Route path="turn-battle/:roomId/play" element={<GlyphTurnOnlinePage />} />

      <Route path="solo" element={<SoloGamePage />} />
      <Route path="battle" element={<BattleRoomListPage />} />
      {import.meta.env.DEV ? <Route path="battle/practice" element={<BattleBotPracticePage key="battle-bot-runtime-v9" />} /> : null}
      <Route path="battle/:roomId" element={<BattleWaitingRoomPage />} />
      <Route path="battle/:roomId/play" element={<BattleGamePage />} />
      <Route path="battle/:roomId/result" element={<BattleResultPage />} />
      {isRecognitionCrowdTestEnabled() ? <Route path="recognition/crowd-test" element={<RecognitionCrowdTestPage />} /> : null}
      <Route path="*" element={<Navigate to="/game" replace />} />
    </Routes>
  );
}

export function isRecognitionCrowdTestEnabled(dev = import.meta.env.DEV): boolean { return dev; }
