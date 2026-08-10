import { Graphics } from "pixi.js";

export class ObstacleWarningRenderer {
  readonly root = new Graphics();
  render(x: number, y: number, now: number): void {
    const pulse = .55 + Math.sin(now / 80) * .18;
    this.root.clear().circle(x, y, 25 + pulse * 8).stroke({ color: 0xf2a43a, width: 4, alpha: pulse });
    this.root.moveTo(x - 12, y).lineTo(x + 12, y).stroke({ color: 0xd66b24, width: 3, alpha: .9 });
  }
}
