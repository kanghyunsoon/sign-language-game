// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

/** 지금 주소를 화면에 적어, 리다이렉트 여부를 눈에 보이는 값으로 확인한다. */
function LocationProbe() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

/**
 * 저장된 토큰이 없으면 AuthProvider가 네트워크 요청 없이 바로 ready가 되므로,
 * 비로그인 상태는 localStorage만 비워 두면 그대로 재현된다.
 */
beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );

const currentPath = () => screen.getByTestId("path").textContent;

describe("비로그인 접근 제한", () => {
  it.each(["/main", "/practice", "/test", "/review-notes", "/dictionary"])(
    "%s는 로그인 화면으로 보낸다",
    (path) => {
      renderAt(path);

      expect(currentPath()).toBe("/login");
      // 주소만이 아니라 로그인 화면이 실제로 그려졌는지도 확인한다.
      expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    },
  );

  it.each(["/", "/login", "/signup"])("%s는 로그인 없이도 열린다", (path) => {
    renderAt(path);

    expect(currentPath()).toBe(path);
  });
});
