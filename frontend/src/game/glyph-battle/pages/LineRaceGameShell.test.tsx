// @vitest-environment jsdom

import { StrictMode } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LINE_RACE_RUNTIME_CONFIG, type LineRaceRuntime } from "../core";
import type { LineRaceRenderer } from "../render";
import { LineRaceGameShell } from "./LineRaceGameShell";

afterEach(cleanup);

describe("LineRaceGameShell", () => {
  it("keeps frame updates outside React state and destroys renderer on unmount", async () => {
    const runtime: LineRaceRuntime = {
      start: vi.fn(), update: vi.fn(), pause: vi.fn(), resume: vi.fn(), reset: vi.fn(), finish: vi.fn(),
      getSnapshot: vi.fn(() => ({ state: "IDLE" as const, now: 0, simulationNow: 0, remainingMs: 60_000, players: [], obstacles: [] })),
      subscribe: vi.fn(() => () => undefined), dispose: vi.fn(),
    };
    const renderer = { render: vi.fn(), start: vi.fn(), destroy: vi.fn(), setPathDebugVisible: vi.fn() } as unknown as LineRaceRenderer;
    const createRenderer = vi.fn(async () => renderer);
    const view = render(
      <LineRaceGameShell
        runtime={runtime}
        clock={{ now: () => 100 }}
        config={DEFAULT_LINE_RACE_RUNTIME_CONFIG}
        createRenderer={createRenderer}
      />,
    );
    await waitFor(() => expect(renderer.start).toHaveBeenCalledTimes(1));
    const frame = vi.mocked(renderer.start).mock.calls[0]?.[0] as () => void;
    frame();
    expect(runtime.update).toHaveBeenCalledWith(100);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
  });

  it("serializes StrictMode initialization so a stale renderer cannot replace the live canvas", async () => {
    const runtime = {
      start: vi.fn(), update: vi.fn(), pause: vi.fn(), resume: vi.fn(), reset: vi.fn(), finish: vi.fn(),
      getSnapshot: vi.fn(() => ({ state: "IDLE" as const, now: 0, simulationNow: 0, remainingMs: 60_000, players: [], obstacles: [] })),
      subscribe: vi.fn(() => () => undefined), dispose: vi.fn(),
    } as LineRaceRuntime;
    const liveRenderer = {
      render: vi.fn(), start: vi.fn(), destroy: vi.fn(), setPathDebugVisible: vi.fn(),
    } as unknown as LineRaceRenderer;
    const createRenderer = vi.fn(async () => liveRenderer);

    const view = render(
      <StrictMode>
        <LineRaceGameShell
          runtime={runtime}
          clock={{ now: () => 0 }}
          config={DEFAULT_LINE_RACE_RUNTIME_CONFIG}
          createRenderer={createRenderer}
        />
      </StrictMode>,
    );

    await waitFor(() => expect(liveRenderer.start).toHaveBeenCalledTimes(1));
    expect(createRenderer).toHaveBeenCalledTimes(1);
    expect(liveRenderer.destroy).not.toHaveBeenCalled();
    view.unmount();
    expect(liveRenderer.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not recreate Pixi when React supplies a new config object with unchanged values", async()=>{
    const runtime={start:vi.fn(),update:vi.fn(),pause:vi.fn(),resume:vi.fn(),reset:vi.fn(),finish:vi.fn(),getSnapshot:vi.fn(()=>({state:"IDLE" as const,now:0,simulationNow:0,remainingMs:60_000,players:[],obstacles:[]})),subscribe:vi.fn(()=>()=>undefined),dispose:vi.fn()} as LineRaceRuntime;
    const renderer={render:vi.fn(),start:vi.fn(),destroy:vi.fn(),setPathDebugVisible:vi.fn()} as unknown as LineRaceRenderer;
    const createRenderer=vi.fn(async()=>renderer);const clock={now:()=>0};
    const view=render(<LineRaceGameShell runtime={runtime} clock={clock} config={{...DEFAULT_LINE_RACE_RUNTIME_CONFIG}} createRenderer={createRenderer}/>);
    await waitFor(()=>expect(createRenderer).toHaveBeenCalledTimes(1));
    view.rerender(<LineRaceGameShell runtime={runtime} clock={clock} config={{...DEFAULT_LINE_RACE_RUNTIME_CONFIG}} createRenderer={createRenderer}/>);
    await Promise.resolve();
    expect(createRenderer).toHaveBeenCalledTimes(1);expect(renderer.destroy).not.toHaveBeenCalled();
  });

  it("destroys a renderer that finishes initialization after unmount", async () => {
    let resolveRenderer!: (renderer: LineRaceRenderer) => void;
    const renderer = { render: vi.fn(), start: vi.fn(), stop: vi.fn(), destroy: vi.fn(), setPathDebugVisible: vi.fn() } as unknown as LineRaceRenderer;
    const createRenderer = vi.fn(() => new Promise<LineRaceRenderer>((resolve) => { resolveRenderer = resolve; }));
    const runtime = {
      start: vi.fn(), update: vi.fn(), pause: vi.fn(), resume: vi.fn(), reset: vi.fn(), finish: vi.fn(),
      getSnapshot: vi.fn(() => ({ state: "IDLE" as const, now: 0, simulationNow: 0, remainingMs: 0, players: [], obstacles: [] })),
      subscribe: vi.fn(() => () => undefined), dispose: vi.fn(),
    } as LineRaceRuntime;
    const view = render(<LineRaceGameShell runtime={runtime} clock={{ now: () => 0 }} config={DEFAULT_LINE_RACE_RUNTIME_CONFIG} createRenderer={createRenderer} />);
    await waitFor(() => expect(createRenderer).toHaveBeenCalledTimes(1));
    view.unmount();
    resolveRenderer(renderer);
    await waitFor(() => expect(renderer.destroy).toHaveBeenCalledTimes(1));
    expect(renderer.start).not.toHaveBeenCalled();
  });
});
