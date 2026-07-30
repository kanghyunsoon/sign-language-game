// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BattleResultModal } from "./BattleResultModal";

afterEach(cleanup);
const result = { type: "MATCH_FINISHED" as const, sequence: 10, matchId: "match-new", winnerPlayerId: "me", loserPlayerId: "other", reason: "DANGER_LINE", finishedAt: Date.now(), results: [{ playerId: "me", score: 700, maxCombo: 5, removedCount: 7, attackCount: 2 }, { playerId: "other", score: 300, maxCombo: 2, removedCount: 3, attackCount: 0 }] };

describe("BattleResultModal", () => {
  it("shows the server-authoritative winner and player statistics", () => { render(<BattleResultModal result={result} playerId="me" onReturnToWaiting={() => undefined} onRoomList={() => undefined} onModeSelect={() => undefined} />); expect(screen.getByText(/승리했어요/)).toBeTruthy(); expect(screen.getAllByText(/700점/).length).toBeGreaterThan(0); expect(screen.getAllByText(/300점/).length).toBeGreaterThan(0); expect(screen.getAllByText("게임 종료").length).toBe(2); });
  it("shows the winner with a happy otter and the loser with a crying otter", () => { render(<BattleResultModal result={result} playerId="other" onReturnToWaiting={() => undefined} onRoomList={() => undefined} onModeSelect={() => undefined} />); expect(screen.getByText(/이겨봐요/)).toBeTruthy(); expect(screen.getByText("WINNER").closest("article")?.contains(screen.getByAltText("웃는 수달"))).toBe(true); expect(screen.getByText("RUNNER-UP").closest("article")?.contains(screen.getByAltText("우는 수달"))).toBe(true); });
  it("exposes waiting room, room list and mode actions", () => { const waiting = vi.fn(); const list = vi.fn(); const mode = vi.fn(); render(<BattleResultModal result={result} playerId="me" onReturnToWaiting={waiting} onRoomList={list} onModeSelect={mode} />); fireEvent.click(screen.getByRole("button", { name: "다시 하기" })); fireEvent.click(screen.getByRole("button", { name: "같은 방으로" })); fireEvent.click(screen.getByRole("button", { name: "게임방 목록" })); expect(waiting).toHaveBeenCalledOnce(); expect(list).toHaveBeenCalledOnce(); expect(mode).toHaveBeenCalledOnce(); });
  it("blocks only rematch until the backend result acknowledgement arrives", () => { render(<BattleResultModal result={result} playerId="me" readyForRematch={false} onReturnToWaiting={() => undefined} onRoomList={() => undefined} onModeSelect={() => undefined} />); expect((screen.getByRole("button", { name: /다시 하기/ }) as HTMLButtonElement).disabled).toBe(true); expect((screen.getByRole("button", { name: /같은 방으로/ }) as HTMLButtonElement).disabled).toBe(false); expect(screen.getByText("결과 저장 확인 중입니다.")).toBeTruthy(); });
});
