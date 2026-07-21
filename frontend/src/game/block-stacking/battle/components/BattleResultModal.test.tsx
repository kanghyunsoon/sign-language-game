// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BattleResultModal } from "./BattleResultModal";

afterEach(cleanup);
const result = { type: "MATCH_FINISHED" as const, sequence: 10, matchId: "match-new", winnerPlayerId: "me", loserPlayerId: "other", reason: "DANGER_LINE", finishedAt: Date.now(), results: [{ playerId: "me", score: 700, maxCombo: 5, removedCount: 7, attackCount: 2 }, { playerId: "other", score: 300, maxCombo: 2, removedCount: 3, attackCount: 0 }] };

describe("BattleResultModal", () => {
  it("shows the server-authoritative winner and player statistics", () => { render(<BattleResultModal result={result} playerId="me" onReturnToWaiting={() => undefined} onRoomList={() => undefined} onModeSelect={() => undefined} />); expect(screen.getByText("승리")).toBeTruthy(); expect(screen.getByText("700")).toBeTruthy(); expect(screen.getByText("300")).toBeTruthy(); expect(screen.getByText("DANGER_LINE")).toBeTruthy(); });
  it("shows defeat from the same server result", () => { render(<BattleResultModal result={result} playerId="other" onReturnToWaiting={() => undefined} onRoomList={() => undefined} onModeSelect={() => undefined} />); expect(screen.getByText("패배")).toBeTruthy(); });
  it("exposes waiting room, room list and mode actions", () => { const waiting = vi.fn(); const list = vi.fn(); const mode = vi.fn(); render(<BattleResultModal result={result} playerId="me" onReturnToWaiting={waiting} onRoomList={list} onModeSelect={mode} />); fireEvent.click(screen.getByRole("button", { name: "다시 대기방" })); fireEvent.click(screen.getByRole("button", { name: "방 목록" })); fireEvent.click(screen.getByRole("button", { name: "모드 선택" })); expect(waiting).toHaveBeenCalledOnce(); expect(list).toHaveBeenCalledOnce(); expect(mode).toHaveBeenCalledOnce(); });
});
