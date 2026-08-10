import { useEffect, useRef, useState } from "react";
import type { LineRaceClock, LineRaceRuntime, LineRaceRuntimeConfig } from "../core";
import { LINE_RACE_RENDERER_REVISION, LineRaceRenderer, type LineRaceObstacleFeedback } from "../render";
import styles from "../dev/LineRaceDevHarness.module.css";
import type { GlyphDuelView } from "../duel/GlyphDuelModel";

const rendererMountQueues = new WeakMap<HTMLElement, Promise<void>>();

export interface LineRaceGameShellProps {
  readonly runtime: LineRaceRuntime;
  readonly clock: LineRaceClock;
  readonly config: LineRaceRuntimeConfig;
  readonly debugPaths?: boolean;
  readonly createRenderer?: typeof LineRaceRenderer.create;
  readonly obstacleFeedback?: LineRaceObstacleFeedback;
  readonly duelView?: GlyphDuelView;
}

export function LineRaceGameShell({
  runtime,
  clock,
  config,
  debugPaths = false,
  createRenderer = LineRaceRenderer.create,
  obstacleFeedback,
  duelView,
}: LineRaceGameShellProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feedbackRef = useRef<LineRaceObstacleFeedback>(obstacleFeedback ?? {});
  feedbackRef.current = obstacleFeedback ?? {};
  const duelViewRef = useRef<GlyphDuelView | undefined>(duelView);
  duelViewRef.current = duelView;
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let renderer: LineRaceRenderer | null = null;
    setError(null);

    const previousMount = rendererMountQueues.get(mount) ?? Promise.resolve();
    const mountTask = previousMount.catch(() => undefined).then(async () => {
      if (cancelled) return;
      try {
        const created = await createRenderer(mount, configRef.current);
        if (cancelled) {
          created.destroy();
          return;
        }
        renderer = created;
        created.setPathDebugVisible(debugPaths);
        created.setObstacleFeedback?.(feedbackRef.current);
        if (duelViewRef.current) created.setDuelView?.(duelViewRef.current);
        created.render(runtime.getSnapshot());
        created.start(() => {
          if (cancelled) return;
          try {
            runtime.update(clock.now());
            created.setObstacleFeedback?.(feedbackRef.current);
            if (duelViewRef.current) created.setDuelView?.(duelViewRef.current);
            created.render(runtime.getSnapshot());
          } catch (cause: unknown) {
            created.stop();
            if (!cancelled) setError(cause instanceof Error ? cause.message : "라인 레이스 화면을 갱신하지 못했습니다.");
          }
        });
      } catch (cause: unknown) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "라인 레이스 화면을 초기화하지 못했습니다.");
      }
    });
    rendererMountQueues.set(mount, mountTask);

    return () => {
      cancelled = true;
      try { renderer?.destroy(); } catch { /* renderer cleanup must never crash React unmount */ }
    };
  // Network controllers return a fresh config object on every React render.
  // Depend on scalar values so Pixi is not destroyed and recreated every tick.
  }, [clock, config.raceLength, config.baseSpeedPerSecond, config.matchDurationMs, config.countdownMs, createRenderer, debugPaths, runtime, LINE_RACE_RENDERER_REVISION]);

  return (
    <section className={styles.gameShell} aria-label="라인 레이스 경기 화면">
      <div ref={mountRef} className={styles.canvasMount} data-testid="line-race-canvas" />
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
  );
}
