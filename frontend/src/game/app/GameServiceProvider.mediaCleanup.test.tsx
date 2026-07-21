// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DefaultSharedGameCameraSession } from "../media/camera/SharedGameCameraSession";
import { MeshBattleMediaSession } from "../media/mesh/MeshBattleMediaSession";
import type { GameModuleConfig } from "./GameModule";
import { GameServiceProvider } from "./GameServiceProvider";
import { DefaultActivePlayerSession } from "../recognition/active-player";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("GameServiceProvider media cleanup", () => {
  it("disconnects Mesh peers before releasing the shared camera on module exit", async () => {
    const order: string[] = [];
    vi.spyOn(MeshBattleMediaSession.prototype, "disconnect").mockImplementation(async () => {
      order.push("mesh");
    });
    vi.spyOn(DefaultSharedGameCameraSession.prototype, "stop").mockImplementation(() => {
      order.push("camera");
    });
    const view = render(
      <GameServiceProvider user={{ userId: "user-1", displayName: "Player" }} config={config}>
        <span>game</span>
      </GameServiceProvider>,
    );

    view.unmount();

    await waitFor(() => expect(order).toEqual(["mesh", "camera"]));
  });

  it("does not permanently dispose the active player session during the StrictMode effect probe", async () => {
    const dispose = vi.spyOn(DefaultActivePlayerSession.prototype, "dispose");
    function RegistrationProbe() {
      useEffect(() => undefined, []);
      return <span>strict game</span>;
    }
    const view = render(
      <StrictMode>
        <GameServiceProvider user={{ userId: "user-1", displayName: "Player" }} config={config}>
          <RegistrationProbe />
        </GameServiceProvider>
      </StrictMode>,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(dispose).not.toHaveBeenCalled();
    expect(view.getByText("strict game")).toBeTruthy();
    view.unmount();
    await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
  });
});

const config: GameModuleConfig = {
  soloApiBaseUrl: "/solo",
  roomApiBaseUrl: "/rooms",
  gameWebSocketUrl: "ws://game",
  rtcConfigApiBaseUrl: "/rtc",
  aiWebSocketUrl: "ws://ai",
};
