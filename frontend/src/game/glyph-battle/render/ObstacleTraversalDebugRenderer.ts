import { Graphics } from "pixi.js";
import type { JamoObstacleTemplate, ObstacleBounds } from "../obstacle";

export class ObstacleTraversalDebugRenderer {
  readonly root = new Graphics();
  render(template: JamoObstacleTemplate, bounds: ObstacleBounds, visible: boolean, active = false): void {
    this.root.clear();
    this.root.visible = visible;
    if (!visible) return;
    const [first, ...rest] = template.normalizedPath;
    if (!first) return;
    this.root.moveTo(bounds.x + first.x * bounds.width, bounds.y + first.y * bounds.height);
    for (const point of rest) this.root.lineTo(bounds.x + point.x * bounds.width, bounds.y + point.y * bounds.height);
    this.root.stroke({ color: 0xffffff, width: active ? 10 : 7, alpha: .95 });
    this.root.moveTo(bounds.x + first.x * bounds.width, bounds.y + first.y * bounds.height);
    for (const point of rest) this.root.lineTo(bounds.x + point.x * bounds.width, bounds.y + point.y * bounds.height);
    this.root.stroke({ color: active ? 0xd22f72 : 0x3577a8, width: active ? 5 : 3, alpha: .95 });
  }
}
