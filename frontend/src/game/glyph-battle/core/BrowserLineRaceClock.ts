import type { LineRaceClock } from "./LineRaceClock";

export class BrowserLineRaceClock implements LineRaceClock {
  now(): number {
    return performance.now();
  }
}
