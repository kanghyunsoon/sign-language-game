// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useNavigate } from "react-router-dom";

import { GameCameraRouteLifecycle, isGameCameraRoute } from "./GameCameraRouteLifecycle";

const camera = vi.hoisted(() => ({ stop: vi.fn() }));

vi.mock("./GameModuleContext", () => ({
  useGameModuleContext: () => ({ sharedCameraSession: camera }),
}));

afterEach(() => {
  cleanup();
  camera.stop.mockReset();
});

describe("GameCameraRouteLifecycle", () => {
  it("stops the shared camera after browser-style navigation leaves a camera page", async () => {
    function NavigationProbe() {
      const navigate = useNavigate();
      return <button onClick={() => navigate("/game")}>leave camera page</button>;
    }

    const view = render(
      <MemoryRouter initialEntries={["/game/solo"]}>
        <GameCameraRouteLifecycle />
        <NavigationProbe />
      </MemoryRouter>,
    );

    expect(camera.stop).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "leave camera page" }));
    await waitFor(() => expect(camera.stop).toHaveBeenCalledTimes(1));
  });
});

describe("isGameCameraRoute", () => {
  it.each([
    "/game/solo",
    "/game/solo/",
    "/game/battle/practice",
    "/game/battle/135",
    "/game/battle/135/play",
    "/game/turn-battle/practice",
    "/game/turn-battle/135/play",
  ])("keeps the shared camera available on %s", (pathname) => {
    expect(isGameCameraRoute(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/game",
    "/game/block",
    "/game/battle",
    "/game/battle/preview",
    "/game/battle/135/result",
    "/game/turn-battle",
    "/game/turn-battle/135",
    "/game/recognition/crowd-test",
  ])("releases the shared camera on %s", (pathname) => {
    expect(isGameCameraRoute(pathname)).toBe(false);
  });
});
