import { Container, Graphics, Text } from "pixi.js";
import type { LineRaceRuntimeSnapshot } from "../core";
import {
  TimeBasedObstaclePathFollower,
  createDefaultJamoObstacleRegistry,
  type JamoObstacleTemplate,
  type LocalJamoObstacleSnapshot,
  type ObstacleBounds,
} from "../obstacle";
import type { LaneRoadShape, TraversalRunnerPosition } from "./RaceLaneRenderer";
import { ObstacleDestroyEffect } from "./ObstacleDestroyEffect";
import { ObstacleWarningRenderer } from "./ObstacleWarningRenderer";

interface ObstacleView {
  readonly root: Container;
  readonly attackTrail: Graphics;
  readonly projectile: Graphics;
  readonly projectileGlyph: Text;
  readonly projectileLabel: Text;
  readonly impact: Graphics;
  readonly token: Graphics;
  readonly glyph: Text;
  readonly warning: ObstacleWarningRenderer;
  readonly effect: ObstacleDestroyEffect;
  readonly focus: Graphics;
  readonly focusLabel: Text;
  readonly follower: TimeBasedObstaclePathFollower;
  traversalStartedAt?: number;
}

export interface LineRaceObstacleFeedback {
  readonly obstacleId?: string;
  readonly state?: "TARGET" | "RECOGNIZING" | "PENDING" | "SUCCESS" | "REJECTED";
  readonly progress?: number;
}

export interface JamoObstacleRenderResult {
  readonly runnerPositions: ReadonlyMap<string, TraversalRunnerPosition>;
  readonly roadShapes: ReadonlyMap<string, readonly LaneRoadShape[]>;
  readonly laneImpacts: ReadonlyMap<string, number>;
}

export type GlyphAttackKind = "SEAL" | "WAVE" | "CUT" | "BURST";

export function getGlyphAttackStyle(symbol: string): { readonly kind: GlyphAttackKind; readonly label: string; readonly color: number } {
  if (["ㅇ", "ㅁ"].includes(symbol)) return { kind: "SEAL", label: "봉인", color: 0xa96cff };
  if (["ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅢ", "ㅚ", "ㅟ"].includes(symbol)) {
    return { kind: "WAVE", label: "파동", color: 0x29d3e2 };
  }
  if (["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅂ", "ㅅ", "ㅈ"].includes(symbol)) return { kind: "CUT", label: "절단", color: 0xff557a };
  return { kind: "BURST", label: "폭발", color: 0xffa32b };
}

export class JamoObstacleRenderer {
  readonly root = new Container();
  private readonly views = new Map<string, ObstacleView>();
  private readonly registry = createDefaultJamoObstacleRegistry();
  private width = 960;
  private topLaneY = 198;
  private bottomLaneY = 374;
  private feedback: LineRaceObstacleFeedback = {};

  constructor(private readonly raceLength: number) {}

  resize(width: number, _height: number, topLaneY: number, bottomLaneY: number): void {
    this.width = width;
    this.topLaneY = topLaneY;
    this.bottomLaneY = bottomLaneY;
  }

  // Path debug is intentionally disabled in the player-facing renderer. The old
  // letter-shaped detour obscured both lanes and made the runner leave the track.
  setDebugVisible(_visible: boolean): void {}
  setFeedback(feedback: LineRaceObstacleFeedback): void { this.feedback = feedback; }

  render(snapshot: LineRaceRuntimeSnapshot): JamoObstacleRenderResult {
    const activeIds = new Set(snapshot.obstacles.map((item) => item.obstacleId));
    const runnerPositions = new Map<string, TraversalRunnerPosition>();
    const roadShapes = new Map<string, LaneRoadShape[]>();
    const laneImpacts = new Map<string, number>();

    for (const obstacle of snapshot.obstacles) {
      const template = this.registry.getById(obstacle.templateId);
      if (!template) continue;
      const roadTemplate = createRoadTemplate(template);
      const attackStyle = getGlyphAttackStyle(obstacle.symbol);
      const view = this.view(obstacle, template);
      const bounds = this.bounds(obstacle, roadTemplate);
      const centerX = bounds.x + roadTemplate.entryOffset.x * bounds.width;
      const laneY = obstacle.targetPlayerId === "PLAYER_A" ? this.topLaneY : this.bottomLaneY;
      const fallY = laneY - 86 * (1 - obstacle.fallProgress);
      const tokenY = obstacle.state === "FALLING" ? fallY : laneY;
      const counterShake = obstacle.state === "COUNTERED" ? Math.sin(snapshot.simulationNow / 24) * 7 : 0;
      const collisionShake = obstacle.state === "TRAVERSING" ? Math.sin(snapshot.simulationNow / 32) * 3 : 0;
      const x = centerX + counterShake + collisionShake;

      const pathPoints = roadTemplate.normalizedPath.map((point) => ({
        x: bounds.x + point.x * bounds.width,
        y: bounds.y + point.y * bounds.height,
      }));
      const firstStrokePoint = template.normalizedPath[0]!;
      const accentPoints = template.normalizedPath.map((point) => ({
        x: bounds.x + (.16 + point.x * .68) * bounds.width,
        y: bounds.y + (1 - (firstStrokePoint.y - point.y) * .8) * bounds.height,
      }));
      const pathColor = obstacle.state === "COUNTERED" || obstacle.state === "REMOVING"
        ? 0x2b9b70
        : obstacle.state === "WARNING"
          ? 0xf0a23a
          : attackStyle.color;
      const pathAlpha = obstacle.state === "WARNING"
        ? .24
        : obstacle.state === "REMOVING"
          ? Math.max(0, 1 - obstacle.removalProgress)
          : obstacle.state === "FALLING" ? .45 + obstacle.fallProgress * .45 : 1;
      const pathReveal = obstacle.state === "FALLING" ? obstacle.fallProgress : 1;
      // The glyph is an attack animation, not persistent scenery. Never leave
      // ACTIVE letters parked in front of a player where they can pile up.
      if (["TRAVERSING", "COUNTERED", "REMOVING"].includes(obstacle.state)) {
        const playerRoads = roadShapes.get(obstacle.targetPlayerId) ?? [];
        playerRoads.push({ points: pathPoints, accentPoints, color: pathColor, alpha: pathAlpha, reveal: pathReveal, state: obstacle.state });
        roadShapes.set(obstacle.targetPlayerId, playerRoads);
      }

      const attacker = snapshot.players.find((player) => player.playerId !== obstacle.targetPlayerId);
      const attackerX = this.width * (obstacle.targetPlayerId === "PLAYER_A" ? .8 : .2);
      const attackerY = obstacle.targetPlayerId === "PLAYER_A" ? this.bottomLaneY : this.topLaneY;
      const warningDuration = Math.max(1, obstacle.warningEndsAt - obstacle.warningStartedAt);
      const flightProgress = Math.min(1, Math.max(0, (snapshot.simulationNow - obstacle.warningStartedAt) / warningDuration));
      const flightEase = 1 - Math.pow(1 - flightProgress, 3);
      const projectileX = attackerX + (centerX - attackerX) * flightEase;
      const projectileY = attackerY + (laneY - attackerY) * flightEase - Math.sin(Math.PI * flightProgress) * 86;
      view.attackTrail.visible = obstacle.state === "WARNING";
      view.projectile.visible = obstacle.state === "WARNING";
      view.projectileGlyph.visible = obstacle.state === "WARNING";
      view.projectileLabel.visible = obstacle.state === "WARNING";
      if (obstacle.state === "WARNING") {
        const attackColor = attackStyle.color;
        view.attackTrail.clear();
        for (let echo = 0; echo < 4; echo += 1) {
          const echoProgress = Math.max(0, flightProgress - echo * .045);
          const echoEase = 1 - Math.pow(1 - echoProgress, 3);
          const echoX = attackerX + (centerX - attackerX) * echoEase;
          const echoY = attackerY + (laneY - attackerY) * echoEase - Math.sin(Math.PI * echoProgress) * 86;
          view.attackTrail.circle(echoX, echoY, 14 - echo * 2).fill({ color: attackColor, alpha: .18 - echo * .035 });
        }
        view.attackTrail.moveTo(attackerX, attackerY - 18).lineTo(projectileX, projectileY)
          .stroke({ color: attackColor, width: 5, alpha: .16 + flightProgress * .26, cap: "round" });
        this.drawProjectile(view.projectile, attackStyle.kind, attackColor, snapshot.simulationNow);
        view.projectile.position.set(projectileX, projectileY);
        view.projectile.rotation = Math.sin(flightProgress * Math.PI * 3) * .16;
        view.projectileGlyph.position.set(projectileX, projectileY - 1);
        view.projectileLabel.text = `${attacker?.displayName ?? "공격자"}의 ${obstacle.symbol} · ${attackStyle.label}`;
        view.projectileLabel.position.set(projectileX, projectileY - 43);
      }

      view.impact.visible = obstacle.state === "FALLING";
      view.impact.clear();
      if (obstacle.state === "FALLING") {
        const impactStrength = Math.max(0, 1 - obstacle.fallProgress);
        const impactColor = attackStyle.color;
        view.impact.circle(centerX, laneY, 34 + obstacle.fallProgress * 72)
          .stroke({ color: impactColor, width: 10, alpha: impactStrength * .9 });
        for (let ray = 0; ray < 8; ray += 1) {
          const angle = ray / 8 * Math.PI * 2;
          const inner = 18 + obstacle.fallProgress * 18;
          const outer = inner + 24 * impactStrength;
          view.impact.moveTo(centerX + Math.cos(angle) * inner, laneY + Math.sin(angle) * inner)
            .lineTo(centerX + Math.cos(angle) * outer, laneY + Math.sin(angle) * outer)
            .stroke({ color: impactColor, width: 4, alpha: impactStrength });
        }
        laneImpacts.set(obstacle.targetPlayerId, Math.sin(snapshot.simulationNow / 19) * impactStrength * 11);
      }

      const tokenColor = obstacle.state === "COUNTERED"
        ? 0x2b9b70
        : obstacle.state === "TRAVERSING"
          ? 0xc44855
          : obstacle.state === "WARNING"
            ? 0xf0a23a
            : 0xf26c86;
      view.token.visible = obstacle.state === "FALLING";
      view.token.clear()
        .roundRect(-30, -27, 60, 54, 15)
        .fill({ color: tokenColor, alpha: obstacle.state === "REMOVING" ? 1 - obstacle.removalProgress : .96 })
        .stroke({ color: 0xffffff, width: 4, alpha: .95 });
      view.token.position.set(x, tokenY - 4);

      const focused = this.feedback.obstacleId === obstacle.obstacleId;
      view.focus.clear();
      view.focusLabel.visible = focused;
      if (focused) {
        const color = this.feedback.state === "SUCCESS" ? 0x27815a : this.feedback.state === "REJECTED" ? 0xc56b28 : 0x276da8;
        view.focus.roundRect(bounds.x - 8, bounds.y - 8, bounds.width + 16, bounds.height + 16, 18)
          .stroke({ color, width: this.feedback.state === "RECOGNIZING" ? 6 : 4, alpha: .95 });
        if (this.feedback.state === "RECOGNIZING") view.focus
          .roundRect(bounds.x, laneY + 11, bounds.width * Math.max(.08, this.feedback.progress ?? 0), 6, 3)
          .fill({ color });
        view.focusLabel.text = this.feedback.state === "RECOGNIZING" ? `인식 중 ${Math.round((this.feedback.progress ?? 0) * 100)}%`
          : this.feedback.state === "SUCCESS" ? "카운터 성공" : this.feedback.state === "PENDING" ? "결과 확인 중" : "카운터 목표";
        view.focusLabel.position.set(bounds.x + bounds.width / 2, bounds.y - 14);
      }

      view.warning.root.visible = obstacle.state === "WARNING";
      if (obstacle.state === "WARNING") view.warning.render(centerX, laneY, snapshot.simulationNow);

      view.glyph.visible = obstacle.state === "FALLING";
      view.glyph.position.set(x, tokenY - 5);
      view.glyph.alpha = obstacle.state === "REMOVING" ? 1 - obstacle.removalProgress : 1;
      view.effect.root.visible = obstacle.state === "COUNTERED" || obstacle.state === "REMOVING";
      if (view.effect.root.visible) view.effect.render(centerX, laneY, obstacle.state === "COUNTERED" ? .15 : obstacle.removalProgress);

      if (obstacle.state === "TRAVERSING" && obstacle.traversalStartedAt !== undefined) {
        if (view.traversalStartedAt !== obstacle.traversalStartedAt) {
          view.follower.start({
            template: roadTemplate,
            startedAt: obstacle.traversalStartedAt,
            durationMs: obstacle.penaltyMs,
            obstacleBounds: bounds,
          });
          view.traversalStartedAt = obstacle.traversalStartedAt;
        } else {
          view.follower.resize(bounds);
        }
        const traversalProgress = Math.min(1, Math.max(0, (snapshot.simulationNow - obstacle.traversalStartedAt) / Math.max(1, obstacle.penaltyMs)));
        const territoryX = this.width * (obstacle.targetPlayerId === "PLAYER_A" ? .2 : .8);
        const direction = obstacle.targetPlayerId === "PLAYER_A" ? -1 : 1;
        const impactPosition = attackStyle.kind === "CUT"
          ? view.follower.getPosition(snapshot.simulationNow)
          : attackStyle.kind === "SEAL"
            ? { x: territoryX + Math.sin(snapshot.simulationNow / 24) * 6, y: laneY + Math.sin(Math.PI * traversalProgress) * 5, rotation: Math.sin(snapshot.simulationNow / 31) * .08 }
            : attackStyle.kind === "WAVE"
              ? { x: territoryX + direction * Math.sin(Math.PI * traversalProgress) * 88, y: laneY - Math.sin(Math.PI * traversalProgress) * 28, rotation: direction * Math.sin(Math.PI * traversalProgress) * .16 }
              : { x: territoryX + Math.sin(traversalProgress * Math.PI * 5) * 16, y: laneY - Math.sin(Math.PI * traversalProgress) * 125, rotation: Math.sin(traversalProgress * Math.PI * 6) * .23 };
        runnerPositions.set(obstacle.targetPlayerId, { ...impactPosition, symbol: `${obstacle.symbol} ${attackStyle.label}` });
      }
    }

    for (const [id, view] of this.views) {
      if (activeIds.has(id)) continue;
      view.follower.dispose();
      view.root.destroy({ children: true });
      this.views.delete(id);
    }
    return { runnerPositions, roadShapes, laneImpacts };
  }

  destroy(): void {
    for (const view of this.views.values()) {
      view.follower.dispose();
      view.root.destroy({ children: true });
    }
    this.views.clear();
  }

  private drawProjectile(graphics: Graphics, kind: GlyphAttackKind, color: number, now: number): void {
    const pulse = Math.sin(now / 55) * 3;
    graphics.clear();
    if (kind === "SEAL") {
      graphics.circle(0, 0, 34 + pulse).stroke({ color, width: 8, alpha: .28 })
        .circle(0, 0, 25).fill({ color, alpha: .94 }).stroke({ color: 0xffffff, width: 4, alpha: .95 });
      return;
    }
    if (kind === "WAVE") {
      graphics.roundRect(-39 - pulse, -22, 78 + pulse * 2, 44, 22).fill({ color, alpha: .26 })
        .roundRect(-30, -18, 60, 36, 18).fill({ color, alpha: .96 }).stroke({ color: 0xffffff, width: 4, alpha: .95 });
      return;
    }
    if (kind === "CUT") {
      graphics.moveTo(0, -36 - pulse).lineTo(30, 0).lineTo(0, 36 + pulse).lineTo(-30, 0).lineTo(0, -36 - pulse)
        .fill({ color, alpha: .94 }).stroke({ color: 0xffffff, width: 4, alpha: .95 });
      return;
    }
    graphics.circle(0, 0, 26 + pulse).fill({ color, alpha: .96 }).stroke({ color: 0xffffff, width: 4, alpha: .95 });
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = ray / 8 * Math.PI * 2;
      graphics.moveTo(Math.cos(angle) * 28, Math.sin(angle) * 28)
        .lineTo(Math.cos(angle) * (39 + pulse), Math.sin(angle) * (39 + pulse))
        .stroke({ color, width: 5, alpha: .8 });
    }
  }

  private view(obstacle: LocalJamoObstacleSnapshot, template: JamoObstacleTemplate): ObstacleView {
    const existing = this.views.get(obstacle.obstacleId);
    if (existing) return existing;
    const root = new Container();
    const attackTrail = new Graphics();
    const projectile = new Graphics();
    const projectileGlyph = new Text({ text: template.symbol, style: { fill: 0xffffff, fontSize: 32, fontWeight: "900", stroke: { color: 0x692643, width: 2 } } });
    projectileGlyph.anchor.set(.5);
    const projectileLabel = new Text({ text: "", style: { fill: 0x17324d, fontSize: 13, fontWeight: "900", stroke: { color: 0xffffff, width: 4 } } });
    projectileLabel.anchor.set(.5);
    const impact = new Graphics();
    const token = new Graphics();
    const glyph = new Text({ text: template.symbol, style: { fill: 0xffffff, fontSize: 34, fontWeight: "900", stroke: { color: 0x7e3047, width: 2 } } });
    glyph.anchor.set(.5);
    const warning = new ObstacleWarningRenderer();
    const effect = new ObstacleDestroyEffect();
    const focus = new Graphics();
    const focusLabel = new Text({ text: "", style: { fill: 0x17324d, fontSize: 15, fontWeight: "900", stroke: { color: 0xffffff, width: 4 } } });
    focusLabel.anchor.set(.5);
    root.addChild(attackTrail, warning.root, focus, impact, token, glyph, projectile, projectileGlyph, projectileLabel, focusLabel, effect.root);
    this.root.addChild(root);
    const created = { root, attackTrail, projectile, projectileGlyph, projectileLabel, impact, token, glyph, warning, effect, focus, focusLabel, follower: new TimeBasedObstaclePathFollower() };
    this.views.set(obstacle.obstacleId, created);
    return created;
  }

  private bounds(obstacle: LocalJamoObstacleSnapshot, template: JamoObstacleTemplate): ObstacleBounds {
    const laneY = obstacle.targetPlayerId === "PLAYER_A" ? this.topLaneY : this.bottomLaneY;
    const territoryCenter = this.width * (obstacle.targetPlayerId === "PLAYER_A" ? .2 : .8);
    const width = Math.min(235, Math.max(165, this.width * .2));
    const height = Math.min(125, Math.max(86, this.width * .095));
    const desiredX = territoryCenter - template.entryOffset.x * width;
    const x = Math.max(24, Math.min(this.width - width - 24, desiredX));
    return { x, y: laneY - height * .72, width, height };
  }
}

/**
 * Turns a glyph stroke into a forward-moving world segment. The runner enters
 * from the left, traces the complete jamo, returns over open strokes when
 * needed, and rejoins the race on the right without teleporting.
 */
export function createRoadTemplate(template: JamoObstacleTemplate): JamoObstacleTemplate {
  const first = template.normalizedPath[0]!;
  const letterPath = template.normalizedPath.map((point) => ({
    x: .16 + point.x * .68,
    y: 1 - (first.y - point.y) * .8,
  }));
  const last = letterPath[letterPath.length - 1]!;
  const startsWhereItEnds = last.x === letterPath[0]!.x && last.y === letterPath[0]!.y;
  const returnPath = startsWhereItEnds ? [] : letterPath.slice(0, -1).reverse();
  const normalizedPath = [{ x: 0, y: 1 }, ...letterPath, ...returnPath, { x: 1, y: 1 }];
  return {
    ...template,
    normalizedPath,
    entryOffset: normalizedPath[0]!,
    exitOffset: normalizedPath[normalizedPath.length - 1]!,
  };
}
