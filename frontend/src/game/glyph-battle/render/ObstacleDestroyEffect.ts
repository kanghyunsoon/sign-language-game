import { Graphics } from "pixi.js";

export class ObstacleDestroyEffect {
  readonly root = new Graphics();
  render(x: number, y: number, progress: number): void {
    this.root.clear();
    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * Math.PI * 2;
      const distance = 12 + progress * 34;
      const size = Math.max(1, 5 * (1 - progress));
      this.root.circle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, size)
        .fill({ color: index % 2 === 0 ? 0xffd85c : 0x62d5ff, alpha: 1 - progress });
    }
  }
}
