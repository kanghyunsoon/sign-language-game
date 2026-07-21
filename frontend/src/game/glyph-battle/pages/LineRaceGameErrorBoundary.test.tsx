// @vitest-environment jsdom
import { Component, StrictMode, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LineRaceGameErrorBoundary } from "./LineRaceGameErrorBoundary";

afterEach(cleanup);

class BrokenGame extends Component { render(): ReactNode { throw new Error("pixi failed"); } }

describe("LineRaceGameErrorBoundary", () => {
  it("contains renderer failures in StrictMode and offers recovery actions", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const retry = vi.fn(), lobby = vi.fn();
    render(<StrictMode><LineRaceGameErrorBoundary resetKey="match:1" onRetry={retry} onLobby={lobby}><BrokenGame /></LineRaceGameErrorBoundary></StrictMode>);
    expect(screen.getByRole("heading", { name: "경기 화면을 복구할 수 없습니다" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    fireEvent.click(screen.getByRole("button", { name: "로비 복귀" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(lobby).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
