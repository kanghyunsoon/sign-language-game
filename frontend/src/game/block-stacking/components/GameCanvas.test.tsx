// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameCanvas } from "./GameCanvas";

const rendererMock = vi.hoisted(() => {
  const pending: Array<{
    host: HTMLElement;
    resolve: (renderer: {
      destroy: ReturnType<typeof vi.fn>;
      resize: ReturnType<typeof vi.fn>;
    }) => void;
  }> = [];
  return {
    pending,
    create: vi.fn((host: HTMLElement) => new Promise((resolve) => pending.push({
      host,
      resolve: resolve as (renderer: {
        destroy: ReturnType<typeof vi.fn>;
        resize: ReturnType<typeof vi.fn>;
      }) => void,
    }))),
  };
});

vi.mock("../render/PixiGameRenderer", () => ({
  PixiGameRenderer: { create: rendererMock.create },
}));

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  rendererMock.pending.splice(0);
  rendererMock.create.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GameCanvas", () => {
  it("does not let a stale StrictMode renderer remove the current canvas", async () => {
    const view = render(
      <StrictMode>
        <GameCanvas className="game-canvas-test" />
      </StrictMode>,
    );
    await waitFor(() => expect(rendererMock.pending).toHaveLength(2));

    const stale = rendererMock.pending[0]!;
    const current = rendererMock.pending[1]!;
    const currentCanvas = document.createElement("canvas");
    current.host.replaceChildren(currentCanvas);
    current.resolve({ destroy: vi.fn(), resize: vi.fn() });
    await waitFor(() => expect(view.container.querySelector("canvas")).toBe(currentCanvas));

    const staleCanvas = document.createElement("canvas");
    stale.host.replaceChildren(staleCanvas);
    stale.resolve({ destroy: vi.fn(), resize: vi.fn() });
    await waitFor(() => expect(view.container.querySelector("canvas")).toBe(currentCanvas));
  });
});
