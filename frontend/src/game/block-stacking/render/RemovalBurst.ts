import { Container, Graphics } from "pixi.js";

interface BurstParticle {
  readonly view: Graphics;
  readonly directionX: number;
  readonly directionY: number;
  readonly distance: number;
  readonly rotation: number;
}

const PARTICLE_COLORS = [0xffd24d, 0xff5a67, 0xffffff] as const;
const PARTICLE_COUNT = 20;

export class RemovalBurst {
  readonly root = new Container();
  private readonly ring = new Graphics()
    .circle(0, 0, 38)
    .stroke({ color: 0xffd24d, width: 8, alpha: 0.95 });
  private readonly particles: readonly BurstParticle[];

  constructor(x: number, y: number) {
    this.root.position.set(x, y);
    this.root.addChild(this.ring);
    this.particles = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
      const angle = (Math.PI * 2 * index) / PARTICLE_COUNT;
      const particle = new Graphics()
        .circle(0, 0, index % 3 === 0 ? 8 : 5.5)
        .fill(PARTICLE_COLORS[index % PARTICLE_COLORS.length]);
      particle.blendMode = "add";
      this.root.addChild(particle);
      return {
        view: particle,
        directionX: Math.cos(angle),
        directionY: Math.sin(angle),
        distance: 90 + (index % 5) * 12,
        rotation: index % 2 === 0 ? 1.2 : -1.2,
      };
    });
  }

  update(progress: number): void {
    const clamped = Math.min(Math.max(progress, 0), 1);
    const travel = 1 - (1 - clamped) ** 3;
    const opacity = (1 - clamped) ** 1.4;
    this.ring.scale.set(0.45 + travel * 2.15);
    this.ring.alpha = opacity;
    for (const particle of this.particles) {
      particle.view.position.set(
        particle.directionX * particle.distance * travel,
        particle.directionY * particle.distance * travel,
      );
      particle.view.rotation = particle.rotation * travel;
      particle.view.scale.set(1 - clamped * 0.45);
      particle.view.alpha = opacity;
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
