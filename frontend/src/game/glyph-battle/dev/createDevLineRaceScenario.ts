import { LineRaceController, LocalLineRaceRuntime, resolveLineRaceRuntimeConfig } from "../core";
import type { LineRaceRuntimeConfig } from "../core";
import { DevLineRaceClock } from "./DevLineRaceClock";

export interface DevLineRaceScenario {
  readonly clock: DevLineRaceClock;
  readonly runtime: LocalLineRaceRuntime;
  readonly controller: LineRaceController;
}

export function createDevLineRaceScenario(
  config: Partial<LineRaceRuntimeConfig> = {},
  source?: () => number,
): DevLineRaceScenario {
  const resolved = resolveLineRaceRuntimeConfig(config);
  const clock = new DevLineRaceClock(source);
  const runtime = new LocalLineRaceRuntime(resolved, clock);
  return { clock, runtime, controller: new LineRaceController(runtime, clock) };
}
