import { Graphics } from "pixi.js";

export class RaceFinishLineRenderer {
  readonly root = new Graphics();

  resize(x: number, top: number, bottom: number): void {
    this.root.clear();
    const cell = 9;
    for (let y = top; y < bottom; y += cell) {
      const row = Math.floor((y - top) / cell);
      this.root.rect(x, y, cell, cell).fill({ color: row % 2 === 0 ? 0xffffff : 0x19344d });
      this.root.rect(x + cell, y, cell, cell).fill({ color: row % 2 === 0 ? 0x19344d : 0xffffff });
    }
  }
}
