import type { NormalizedObstaclePoint } from "./JamoObstacleTemplate";

export interface SampledObstaclePathPoint extends NormalizedObstaclePoint { readonly rotation: number }

export class ObstaclePathSampler {
  sample(path: readonly NormalizedObstaclePoint[], progress: number): SampledObstaclePathPoint {
    if (path.length < 2) throw new Error("Obstacle path requires at least two points.");
    const bounded = Math.min(1, Math.max(0, progress));
    const segments = path.slice(1).map((point, index) => {
      const previous = path[index]!;
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      return { previous, point, length: Math.hypot(dx, dy), rotation: Math.atan2(dy, dx) };
    });
    const total = segments.reduce((sum, segment) => sum + segment.length, 0);
    if (total === 0) return { ...path[0]!, rotation: 0 };
    let distance = bounded * total;
    for (const segment of segments) {
      if (distance <= segment.length || segment === segments.at(-1)) {
        const ratio = segment.length === 0 ? 0 : Math.min(1, distance / segment.length);
        return {
          x: segment.previous.x + (segment.point.x - segment.previous.x) * ratio,
          y: segment.previous.y + (segment.point.y - segment.previous.y) * ratio,
          rotation: segment.rotation,
        };
      }
      distance -= segment.length;
    }
    return { ...path.at(-1)!, rotation: 0 };
  }
}
