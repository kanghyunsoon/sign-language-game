// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

// 연습 세션은 카메라와 AI 소켓을 붙잡는다. 수신 로직만 보려고 둘 다 대역으로 바꾼다.
vi.mock("../../../game/recognition", () => ({
  HandCamera: () => null,
  PythonWebSocketSignRecognizer: class {
    getConnectionState() {
      return "DISCONNECTED";
    }
    subscribe() {
      return () => {};
    }
    connect() {
      return Promise.resolve();
    }
    disconnect() {}
    pushFrame() {}
  },
}));

import { PracticeHomePage } from "./PracticeHomePage";

afterEach(cleanup);

beforeEach(() => {
  // jsdom에는 카메라가 없다. 세션 화면이 안내 문구로 넘어가는 경로를 쓴다.
  Object.defineProperty(navigator, "mediaDevices", {
    value: undefined,
    configurable: true,
  });
});

const renderPage = (path = "/practice") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <PracticeHomePage />
    </MemoryRouter>,
  );

const renderPageWithSymbols = (symbols: string) =>
  renderPage(`/practice?symbols=${encodeURIComponent(symbols)}`);

/** 세션 화면의 "n / 총개수" 진행 표시. 공백을 정리해 정확히 비교한다. */
const readProgress = () =>
  document
    .querySelector(".practice-progress-count")
    ?.textContent?.replace(/\s+/g, " ")
    .trim();

describe("PracticeHomePage 기본 진입", () => {
  it("파라미터가 없으면 분류 선택 화면을 보여준다", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /자음 연습/ })).toBeTruthy();
    expect(screen.getByText("연습하기")).toBeTruthy();
  });
});

describe("PracticeHomePage 오답노트 연동", () => {
  it("symbols 파라미터로 들어오면 분류 선택을 건너뛰고 바로 연습한다", () => {
    renderPageWithSymbols("ㄱ,ㄴ,ㄷ");

    expect(screen.queryByText("연습하기")).toBeNull();
    expect(readProgress()).toBe("1 / 3");
  });

  it("넘겨받은 글자 수만큼만 세션을 구성한다", () => {
    renderPageWithSymbols("ㄱ,ㅏ");

    // 분류 전체(자음 14 + 모음 17)가 아니라 2문항이어야 한다.
    expect(readProgress()).toBe("1 / 2");
  });

  it("분류가 섞여 있어도 함께 연습할 수 있다", () => {
    renderPageWithSymbols("ㄱ,ㅏ,1");

    expect(readProgress()).toBe("1 / 3");
  });

  it("중복된 글자는 한 번만 연습한다", () => {
    renderPageWithSymbols("ㄱ,ㄱ,ㄴ");

    expect(readProgress()).toBe("1 / 2");
  });

  it("알 수 없는 글자만 넘어오면 분류 선택 화면을 그대로 보여준다", () => {
    renderPageWithSymbols("쀍,zz");

    expect(screen.getByText("연습하기")).toBeTruthy();
  });
});
