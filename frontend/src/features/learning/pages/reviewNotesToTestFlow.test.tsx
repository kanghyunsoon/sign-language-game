// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../../game/recognition", () => ({
  HandCamera: () => null,
}));

vi.mock("../recognition/PracticeWebSocketSignRecognizer", () => ({
  PracticeWebSocketSignRecognizer: class {
    getConnectionState() { return "DISCONNECTED"; }
    subscribe() { return () => {}; }
    connect() { return Promise.resolve(); }
    disconnect() {}
    sendLandmarkFrame() {}
    notifyHandNotDetected() {}
    getPerformanceMonitor() { return undefined; }
    getTemporalDecoder() { return undefined; }
  },
}));

import { ReviewNotesPage } from "./ReviewNotesPage";
import { TestPage } from "./TestPage";
import { addReviewNote, removeReviewNotes } from "../data/reviewNotes";
import { fingerspellingEntries } from "../data/fingerspelling";

const reset = () => {
  window.localStorage.clear();
  removeReviewNotes(fingerspellingEntries.map((e) => e.symbol));
};
beforeEach(() => {
  reset();
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
});
afterEach(() => { cleanup(); reset(); });

describe("오답노트 -> 테스트 -> 뒤로가기 실제 흐름", () => {
  it("오답노트로 돌아온다", () => {
    ["ㄱ", "ㄴ"].forEach(addReviewNote);

    render(
      <MemoryRouter initialEntries={["/review-notes"]}>
        <Routes>
          <Route path="/review-notes" element={<ReviewNotesPage />} />
          <Route path="/test" element={<TestPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // 오답노트에서 두 글자를 골라 테스트로 넘어간다.
    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트하기" }));

    expect(screen.getByText("1 / 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(screen.getByText("REVIEW NOTES")).toBeTruthy();
  });
});
