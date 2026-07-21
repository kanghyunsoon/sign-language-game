import { Container, Graphics, Text } from "pixi.js";
import type { LineRaceRuntimeSnapshot } from "../core";

export class RaceHudRenderer {
  readonly root = new Container();
  private readonly background = new Graphics();
  private readonly stateText = new Text({ text: "", style: { fill: 0xffffff, fontSize: 16, fontWeight: "700" } });
  private readonly timeText = new Text({ text: "", style: { fill: 0xffffff, fontSize: 20, fontWeight: "900" } });
  private readonly winnerText = new Text({ text: "", style: { fill: 0xffe36b, fontSize: 15, fontWeight: "800" } });

  constructor() {
    this.root.addChild(this.background, this.stateText, this.timeText, this.winnerText);
  }

  resize(width: number): void {
    this.background.clear().roundRect(12, 12, width - 24, 60, 10).fill({ color: 0x1f5d8f });
    this.stateText.position.set(28, 31);
    this.timeText.anchor.set(0.5, 0);
    this.timeText.position.set(width / 2, 27);
    this.winnerText.anchor.set(1, 0);
    this.winnerText.position.set(width - 28, 32);
  }

  render(snapshot: LineRaceRuntimeSnapshot): void {
    this.stateText.text = `상태 ${snapshot.state}${snapshot.state === "PAUSED" ? " · 일시정지" : ""}`;
    this.timeText.text = `남은 시간 ${(snapshot.remainingMs / 1000).toFixed(1)}s`;
    this.winnerText.text = snapshot.state !== "FINISHED"
      ? "현재 승자 -"
      : snapshot.winnerPlayerId ? `승자 ${snapshot.winnerPlayerId}` : "DRAW";
  }
}
