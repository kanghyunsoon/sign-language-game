import { Container, Graphics, Text } from "pixi.js";
import type { GlyphDuelView } from "../duel/GlyphDuelModel";
import { glyphSegments as sharedGlyphSegments } from "./GlyphStrokeRegistry";

export class GlyphDuelHudRenderer {
  readonly root = new Container();
  private readonly bars = new Graphics();
  private readonly effect = new Graphics();
  private readonly left = new Text({
    text: "",
    style: { fill: 0x242424, fontSize: 13, fontWeight: "900" },
  });
  private readonly right = new Text({
    text: "",
    style: { fill: 0x242424, fontSize: 13, fontWeight: "900" },
  });
  private readonly phase = new Text({
    text: "",
    style: { fill: 0x071326, fontSize: 12, fontWeight: "900" },
  });
  private readonly timer = new Text({
    text: "",
    style: { fill: 0x071326, fontSize: 13, fontWeight: "900" },
  });
  private readonly callout = new Text({
    text: "",
    style: {
      fill: 0xf7f4ec,
      fontSize: 17,
      fontWeight: "900",
      stroke: { color: 0x171717, width: 6 },
      align: "center",
      wordWrap: true,
      wordWrapWidth: 310,
    },
  });
  private width = 960;
  private height = 520;
  private lastEffectFrameKey = "";
  constructor() {
    this.left.anchor.set(0, 0.5);
    this.right.anchor.set(1, 0.5);
    this.phase.anchor.set(0.5);
    this.timer.anchor.set(0.5);
    this.callout.anchor.set(0.5);
    this.root.addChild(
      this.bars,
      this.effect,
      this.left,
      this.right,
      this.phase,
      this.timer,
      this.callout,
    );
  }
  resize(width: number, height = 520): void {
    this.width = width;
    this.height = height;
    this.lastEffectFrameKey = "";
  }
  render(view: GlyphDuelView | null, now: number): void {
    this.root.visible = Boolean(view);
    if (!view) return;
    const margin = Math.max(28, this.width * 0.045),
      gap = Math.max(110, this.width * 0.14),
      barWidth = Math.max(150, (this.width - gap * 2 - margin * 2) / 2),
      y = 56;
    const hpA = clamp(view.local.health / 100),
      hpB = clamp(view.opponent.health / 100),
      focusA = clamp(view.local.focus / 100),
      focusB = clamp(view.opponent.focus / 100);
    this.bars
      .clear()
      .roundRect(margin, y, barWidth, 18, 4)
      .fill({ color: 0x050a12, alpha: 0.88 })
      .roundRect(margin, y, barWidth * hpA, 18, 4)
      .fill({ color: hpA < 0.3 ? 0xff3f55 : 0x26c6ff })
      .roundRect(this.width - margin - barWidth, y, barWidth, 18, 4)
      .fill({ color: 0x050a12, alpha: 0.88 })
      .roundRect(
        this.width - margin - barWidth + barWidth * (1 - hpB),
        y,
        barWidth * hpB,
        18,
        4,
      )
      .fill({ color: hpB < 0.3 ? 0xff3f55 : 0xff724a })
      .roundRect(margin, y + 23, barWidth, 6, 3)
      .fill({ color: 0xffffff, alpha: 0.12 })
      .roundRect(margin, y + 23, barWidth * focusA, 6, 3)
      .fill({ color: 0xffd45c })
      .roundRect(this.width - margin - barWidth, y + 23, barWidth, 6, 3)
      .fill({ color: 0xffffff, alpha: 0.12 })
      .roundRect(
        this.width - margin - barWidth + barWidth * (1 - focusB),
        y + 23,
        barWidth * focusB,
        6,
        3,
      )
      .fill({ color: 0xffd45c });
    if (view.local.guardPercent > 0)
      this.bars
        .roundRect(margin - 4, y - 4, barWidth + 8, 26, 7)
        .stroke({ color: 0xa96cff, width: 3, alpha: 0.9 });
    if (view.opponent.guardPercent > 0)
      this.bars
        .roundRect(
          this.width - margin - barWidth - 4,
          y - 4,
          barWidth + 8,
          26,
          7,
        )
        .stroke({ color: 0xa96cff, width: 3, alpha: 0.9 });
    for (let i = 0; i < 2; i += 1) {
      this.bars
        .circle(margin + 8 + i * 17, y - 9, 6)
        .fill({ color: i < view.local.rounds ? 0xffd45c : 0x32465d });
      this.bars
        .circle(this.width - margin - 8 - i * 17, y - 9, 6)
        .fill({ color: i < view.opponent.rounds ? 0xffd45c : 0x32465d });
    }
    this.left.text = `HP ${view.local.health}  ·  집중 ${view.local.focus}${view.local.guardPercent ? `  ·  방어 ${view.local.guardPercent}%` : ""}`;
    this.left.position.set(margin, y + 43);
    this.right.text = `${view.opponent.guardPercent ? `방어 ${view.opponent.guardPercent}%  ·  ` : ""}집중 ${view.opponent.focus}  ·  HP ${view.opponent.health}`;
    this.right.position.set(this.width - margin, y + 43);
    const phaseLabel =
      view.phase === "PLANNING"
        ? "동시 선택"
        : view.phase === "WAITING"
          ? "선택 잠금"
          : view.phase === "REVEAL"
            ? "기술 공개"
            : "경기 종료";
    this.phase.text = `TURN ${view.turn} · ${phaseLabel}`;
    this.phase.position.set(this.width * 0.5, 58);
    const seconds =
      view.turnEndsAt === undefined
        ? null
        : Math.max(0, Math.ceil((view.turnEndsAt - now) / 1000));
    this.timer.visible = seconds !== null;
    this.timer.text = seconds === null ? "" : `선택 시간 ${seconds}s`;
    this.timer.position.set(this.width * 0.5, 80);
    this.bars
      .roundRect(this.width * 0.5 - 69, 44, 138, 28, 14)
      .fill({ color: 0xffffff, alpha: 0.94 });
    const age = Math.max(0, now - view.calloutAt);
    const visible = age < 2300 || view.calloutAt === 0;
    this.callout.visible = visible;
    this.effect.visible = visible;
    this.callout.text = view.callout;
    this.callout.alpha =
      view.calloutAt === 0 ? 1 : Math.max(0, 1 - (age - 1700) / 600);
    this.callout.scale.set(
      view.calloutAt === 0 ? 1 : Math.min(1, 0.72 + age / 500),
    );
    this.callout.position.set(this.width * 0.5, 119);
    const effectFrameKey = `${view.revision}:${Math.floor(age / 34)}`;
    if (effectFrameKey !== this.lastEffectFrameKey) {
      this.lastEffectFrameKey = effectFrameKey;
      this.drawMoveEffect(view, age);
    }
  }
  private drawMoveEffect(view: GlyphDuelView, age: number): void {
    this.effect.clear();
    if (view.phase !== "REVEAL" && view.phase !== "FINISHED") return;
    const rawMoves = view.resolvedMoves?.length
      ? view.resolvedMoves
      : view.lastMove
        ? [view.lastMove]
        : [];
    const seenMoves = new Set<string>();
    const moves = rawMoves.filter((move) => {
      const key = `${move.attackerId}:${move.targetId}:${move.symbol}:${move.role}`;
      if (seenMoves.has(key)) return false;
      seenMoves.add(key);
      return true;
    });
    if (!moves.length) return;
    const y = this.height * 0.57,
      fade = Math.max(0, 1 - Math.max(0, age - 1250) / 300);
    if (moves.length === 2 && moves[0]!.symbol === moves[1]!.symbol) {
      const collide = Math.min(1, age / 300),
        center = this.width * 0.5,
        collisionY = y + 4,
        left =
          this.width * 0.23 + 64 + (center - this.width * 0.23 - 64) * collide,
        right =
          this.width * 0.77 - 64 + (center - this.width * 0.77 + 64) * collide;
      this.drawVectorGlyph(
        moves[0]!.symbol,
        left,
        collisionY,
        0.3,
        0xff557a,
        fade,
        8,
      );
      this.drawVectorGlyph(
        moves[0]!.symbol,
        right,
        collisionY,
        0.3,
        0x29d3e2,
        fade,
        8,
      );
      if (collide > 0.78) {
        const burst = (collide - 0.78) / 0.22;
        for (let ray = 0; ray < 14; ray += 1) {
          const a = (Math.PI * 2 * ray) / 14,
            r = 24 + burst * 92;
          this.effect
            .moveTo(center + Math.cos(a) * 12, collisionY + Math.sin(a) * 12)
            .lineTo(center + Math.cos(a) * r, collisionY + Math.sin(a) * r)
            .stroke({
              color: ray % 2 ? 0xffffff : 0xffb52e,
              width: 8,
              alpha: 0.9 * fade,
            });
        }
        this.effect
          .circle(center, collisionY, 20 + burst * 42)
          .fill({ color: 0xffd45c, alpha: 0.62 * fade })
          .stroke({ color: 0xffffff, width: 8, alpha: 0.9 * fade });
      }
      return;
    }
    const attackCount = moves.filter(
      (move) => move.role === "ATTACK" || move.role === "FINISHER",
    ).length;
    [...moves.slice(0, 2)]
      .sort((a, b) => Number(a.role === "GUARD") - Number(b.role === "GUARD"))
      .forEach((move) => {
        const localAttacker = move.attackerId === view.local.playerId,
          targetIsLocal = move.targetId === view.local.playerId,
          source = localAttacker ? this.width * 0.23 : this.width * 0.77,
          target = targetIsLocal ? this.width * 0.23 : this.width * 0.77,
          direction = target > source ? 1 : -1,
          sourceBaseY = y + (localAttacker ? 45 : -15),
          targetBaseY = y + (targetIsLocal ? 45 : -15),
          sourceActionY = sourceBaseY - 52,
          targetActionY = targetBaseY - 52,
          targetGuarding = moves.some(
            (candidate) =>
              candidate.attackerId === move.targetId &&
              candidate.role === "GUARD",
          );
        const launchX = source + direction * 70,
          launchY = sourceActionY,
          impactX = target - direction * 78,
          travel = Math.max(0, Math.min(1, (age - 170) / 290)),
          combatY =
            launchY +
            (targetActionY - launchY) * travel -
            Math.sin(Math.PI * travel) * 22,
          arcY = combatY,
          x = launchX + (impactX - launchX) * travel;
        if (move.role === "ATTACK") {
          const attackDelay = attackCount > 1 && !localAttacker ? 300 : 0,
            attackAge = age - attackDelay;
          if (attackAge < 0) return;
          const attackTargetX = targetGuarding
              ? target - direction * 104
              : target,
            attackTargetY = targetGuarding ? targetBaseY - 57 : targetActionY,
            attackTravel = Math.min(1, attackAge / 380),
            attackX = launchX + (attackTargetX - launchX) * attackTravel,
            attackY =
              launchY +
              (attackTargetY - launchY) * attackTravel -
              Math.sin(Math.PI * attackTravel) * 26,
            attackColor = localAttacker ? 0xff355f : 0xff9a2e,
            attackSoftColor = localAttacker ? 0xff91a9 : 0xffcf85,
            attackFade = Math.max(0, 1 - Math.max(0, attackAge - 1250) / 300),
            slashDuration = Math.max(
              260,
              combatSegments(move.symbol).length * 135,
            ),
            slashProgress = Math.max(
              0,
              Math.min(1, (attackAge - 370) / slashDuration),
            );
          if (attackTravel < 0.94)
            this.drawVectorGlyph(
              move.symbol,
              attackX,
              attackY,
              0.28,
              attackColor,
              attackFade,
              8,
            );
          this.drawAttackGlyph(
            move.symbol,
            attackTargetX,
            attackTargetY,
            slashProgress,
            attackFade * 0.72,
            direction,
            attackColor,
            attackSoftColor,
          );
        } else if (move.role === "CONTROL") {
          this.drawVectorGlyph(move.symbol, x, arcY, 0.34, 0xa96cff, fade, 7);
          if (travel > 0.68) {
            const cageProgress = Math.min(1, (travel - 0.68) / 0.32),
              cageY = targetBaseY - 54;
            if (move.symbol === "ㅇ") {
              for (let cage = 0; cage < 3; cage += 1)
                this.effect
                  .ellipse(target, cageY, 42 + cage * 13, 58 + cage * 8)
                  .stroke({
                    color: cage === 0 ? 0xffffff : 0xa96cff,
                    width: 7 - cage,
                    alpha: (0.78 - cage * 0.15) * fade * cageProgress,
                  });
              this.effect
                .moveTo(target - 54, cageY - 54)
                .lineTo(target - 54, cageY + 54)
                .moveTo(target + 54, cageY - 54)
                .lineTo(target + 54, cageY + 54)
                .stroke({ color: 0xa96cff, width: 5, alpha: 0.65 * fade });
            } else {
              for (let cage = 0; cage < 3; cage += 1)
                this.effect
                  .roundRect(
                    target - 48 - cage * 7,
                    cageY - 52 - cage * 5,
                    96 + cage * 14,
                    104 + cage * 10,
                    8,
                  )
                  .stroke({
                    color: cage === 0 ? 0xffffff : 0xa96cff,
                    width: 7 - cage,
                    alpha: (0.78 - cage * 0.15) * fade * cageProgress,
                  });
            }
          }
        } else if (move.role === "GUARD") {
          const wallX = source + direction * 104,
            raise = Math.min(1, age / 230),
            wallY = sourceBaseY - 57,
            pulse = 1 + Math.sin(age / 70) * 0.035;
          this.effect
            .ellipse(wallX, sourceBaseY + 4, 68 * raise, 13 * raise)
            .fill({ color: 0x4f91ff, alpha: 0.18 * fade })
            .stroke({ color: 0x79c8ff, width: 6, alpha: 0.65 * raise * fade });
          this.drawVectorGlyph(
            move.symbol,
            wallX,
            wallY,
            1.38 * raise * pulse,
            0x4f91ff,
            0.92 * fade,
            24,
          );
          this.drawVectorGlyph(
            move.symbol,
            wallX,
            wallY,
            1.22 * raise * pulse,
            0xd9f5ff,
            0.58 * fade,
            7,
          );
          for (let spark = 0; spark < 4; spark += 1) {
            const sy = wallY - 48 + spark * 32;
            this.effect
              .moveTo(wallX + direction * 58, sy)
              .lineTo(wallX + direction * (76 + (spark % 2) * 10), sy - 7)
              .stroke({
                color: 0xffffff,
                width: 5,
                alpha: raise * fade,
                cap: "square",
              });
          }
        } else if (move.role === "FOCUS") {
          const gather = Math.min(1, age / 470),
            coreX = source + direction * 62,
            coreY = sourceActionY;
          for (let mote = 0; mote < 8; mote += 1) {
            const a = (mote * Math.PI) / 4 + age / 520,
              r = (88 + (mote % 3) * 16) * (1 - gather * 0.78),
              mx = coreX + Math.cos(a) * r,
              my = coreY + Math.sin(a) * r * 0.65;
            this.effect.circle(mx, my, 3 + (mote % 3)).fill({
              color: mote % 2 ? 0xffffff : 0x29d3e2,
              alpha: (0.5 + 0.4 * gather) * fade,
            });
          }
          for (let flame = 0; flame < 4; flame += 1) {
            const fx = source - 42 + flame * 28,
              wave = Math.sin(age / 55 + flame) * 5;
            this.effect
              .moveTo(fx, sourceBaseY + 5)
              .lineTo(
                fx + wave,
                sourceBaseY - 43 - gather * (14 + (flame % 2) * 10),
              )
              .stroke({
                color: flame % 2 ? 0xffffff : 0x29d3e2,
                width: 5,
                alpha: 0.55 * gather * fade,
                cap: "round",
              });
          }
          this.effect
            .ellipse(source, sourceBaseY + 3, 45 + gather * 30, 10 + gather * 8)
            .stroke({ color: 0x29d3e2, width: 7, alpha: 0.7 * gather * fade });
          this.effect
            .circle(coreX, coreY, 8 + gather * 20)
            .fill({ color: 0x29d3e2, alpha: 0.28 * fade })
            .stroke({ color: 0xffffff, width: 5, alpha: gather * fade });
          this.drawVectorGlyph(
            move.symbol,
            coreX,
            coreY,
            0.46 + gather * 0.2,
            0x29d3e2,
            fade,
            9,
          );
        } else {
          const charge = Math.min(1, age / 320),
            launch = Math.max(0, Math.min(1, (age - 320) / 300)),
            blast = Math.max(0, Math.min(1, (age - 600) / 210)),
            coreX = source + direction * 70,
            coreY = sourceActionY,
            targetX = target,
            targetY = targetActionY,
            finisherX = coreX + (targetX - coreX) * launch,
            finisherY =
              coreY +
              (targetY - coreY) * launch -
              Math.sin(Math.PI * launch) * 38,
            warningY = targetY - 88,
            warnPulse = 0.75 + Math.sin(age / 65) * 0.2;
          this.effect
            .rect(0, 0, this.width, this.height)
            .fill({ color: 0x071326, alpha: 0.22 * charge * fade });
          this.effect
            .circle(targetX, warningY, 22 + warnPulse * 5)
            .fill({ color: 0xff3f55, alpha: 0.18 * charge * fade })
            .stroke({ color: 0xffd45c, width: 6, alpha: charge * fade });
          this.effect
            .moveTo(targetX, warningY - 11)
            .lineTo(targetX, warningY + 4)
            .stroke({
              color: 0xffffff,
              width: 6,
              alpha: charge * fade,
              cap: "square",
            });
          this.effect
            .circle(targetX, warningY + 12, 3)
            .fill({ color: 0xffffff, alpha: charge * fade });
          this.effect
            .circle(targetX, targetY, 48 + warnPulse * 8)
            .stroke({ color: 0xff3f55, width: 5, alpha: 0.45 * charge * fade });
          this.effect
            .circle(coreX, coreY, 10 + charge * 10)
            .fill({ color: 0xffb52e, alpha: 0.35 * fade })
            .stroke({ color: 0xffffff, width: 4, alpha: 0.8 * charge * fade });
          this.drawVectorGlyph(
            move.symbol,
            finisherX,
            finisherY,
            0.38 + charge * 0.25 - launch * 0.05,
            0xffb52e,
            fade,
            11,
          );
          if (launch > 0.08)
            this.effect
              .moveTo(coreX, coreY)
              .lineTo(finisherX, finisherY)
              .stroke({ color: 0xffb52e, width: 18, alpha: 0.16 * fade })
              .stroke({ color: 0xffffff, width: 5, alpha: 0.7 * fade });
          if (blast > 0) {
            this.effect
              .circle(targetX, targetY, 28 + blast * 110)
              .fill({ color: 0xff7a2e, alpha: 0.5 * (1 - blast * 0.5) * fade })
              .stroke({
                color: 0xffffff,
                width: 15,
                alpha: (1 - blast * 0.4) * fade,
              });
            for (let ray = 0; ray < 12; ray += 1) {
              const a = (Math.PI * 2 * ray) / 12,
                r = 38 + blast * 165;
              this.effect
                .moveTo(targetX + Math.cos(a) * 16, targetY + Math.sin(a) * 16)
                .lineTo(targetX + Math.cos(a) * r, targetY + Math.sin(a) * r)
                .stroke({
                  color: ray % 2 ? 0xffffff : 0xffb52e,
                  width: 10 - (ray % 3) * 2,
                  alpha: (1 - blast * 0.45) * fade,
                });
            }
          }
        }
      });
  }
  private drawAttackGlyph(
    symbol: string,
    x: number,
    y: number,
    progress: number,
    fade: number,
    _direction: number,
    attackColor: number,
    attackSoftColor: number,
  ): void {
    const segments = combatSegments(symbol),
      count = segments.length,
      isBieup = symbol === "ㅂ";
    segments.forEach((segment, index) => {
      const strokePhase = progress * count - index,
        local = Math.max(0, Math.min(1, strokePhase));
      if (local <= 0) return;
      const [x1, y1, x2, y2] = segment,
        sx = x + x1 * 58,
        sy = y + y1 * 58,
        rawEx = sx + (x2 - x1) * 58 * local,
        rawEy = sy + (y2 - y1) * 58 * local,
        dx = rawEx - sx,
        dy = rawEy - sy,
        length = Math.max(1, Math.hypot(dx, dy)),
        ux = dx / length,
        uy = dy / length,
        nx = -uy,
        ny = ux;
      if (isBieup) {
        this.effect
          .moveTo(sx, sy)
          .lineTo(rawEx, rawEy)
          .stroke({
            color: attackColor,
            width: 14,
            alpha: 0.2 * fade,
            cap: "square",
          })
          .moveTo(sx, sy)
          .lineTo(rawEx, rawEy)
          .stroke({
            color: attackColor,
            width: 7,
            alpha: 0.88 * fade,
            cap: "square",
          })
          .moveTo(sx + nx * 1.5, sy + ny * 1.5)
          .lineTo(rawEx + nx * 1.5, rawEy + ny * 1.5)
          .stroke({
            color: 0xffffff,
            width: 2.4,
            alpha: 0.92 * fade,
            cap: "square",
          });
        if (local < 1)
          this.effect
            .moveTo(rawEx - nx * 11, rawEy - ny * 11)
            .lineTo(rawEx + nx * 11, rawEy + ny * 11)
            .stroke({
              color: 0xffffff,
              width: 3,
              alpha: 0.92 * fade,
              cap: "square",
            });
        return;
      }
      const tailX = sx - ux * 18,
        tailY = sy - uy * 18,
        tipX = rawEx + ux * 25,
        tipY = rawEy + uy * 25;
      this.drawBladePolygon(
        tailX,
        tailY,
        tipX,
        tipY,
        nx,
        ny,
        16,
        attackColor,
        0.14 * fade,
      );
      this.drawBladePolygon(
        tailX + ux * 7,
        tailY + uy * 7,
        tipX,
        tipY,
        nx,
        ny,
        9,
        attackColor,
        0.72 * fade,
      );
      this.drawBladePolygon(
        tailX + ux * 15,
        tailY + uy * 15,
        tipX + ux * 4,
        tipY + uy * 4,
        nx,
        ny,
        3.2,
        0xffffff,
        0.94 * fade,
      );
      this.effect
        .moveTo(tailX - nx * 12, tailY - ny * 12)
        .lineTo(rawEx - nx * 12, rawEy - ny * 12)
        .stroke({
          color: attackSoftColor,
          width: 3,
          alpha: 0.24 * fade,
          cap: "square",
        });
      if (local < 1) {
        this.effect
          .moveTo(rawEx - nx * 17, rawEy - ny * 17)
          .lineTo(rawEx + nx * 17, rawEy + ny * 17)
          .stroke({
            color: 0xffffff,
            width: 3,
            alpha: 0.92 * fade,
            cap: "square",
          });
        for (let drop = 0; drop < 3; drop += 1) {
          const side = drop % 2 ? 1 : -1,
            along = 10 + drop * 7;
          this.effect
            .moveTo(
              rawEx + nx * side * (10 + drop * 3),
              rawEy + ny * side * (10 + drop * 3),
            )
            .lineTo(
              rawEx - ux * along + nx * side * (15 + drop * 4),
              rawEy - uy * along + ny * side * (15 + drop * 4),
            )
            .stroke({
              color: attackColor,
              width: 4 - drop,
              alpha: 0.55 * fade,
              cap: "square",
            });
        }
      }
    });
    if (progress > 0.9) {
      const impact = Math.min(1, (progress - 0.9) / 0.1);
      for (let spark = 0; spark < 5; spark += 1) {
        const a = (Math.PI * 2 * spark) / 5,
          r = 18 + impact * 36;
        this.effect
          .moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10)
          .lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
          .stroke({
            color: spark % 2 ? 0xffffff : attackColor,
            width: 4,
            alpha: (1 - impact) * fade,
            cap: "square",
          });
      }
    }
  }
  private drawBladePolygon(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    nx: number,
    ny: number,
    halfWidth: number,
    color: number,
    alpha: number,
  ): void {
    const dx = ex - sx,
      dy = ey - sy;
    this.effect
      .moveTo(sx, sy)
      .lineTo(sx + dx * 0.2 + nx * halfWidth, sy + dy * 0.2 + ny * halfWidth)
      .lineTo(
        sx + dx * 0.78 + nx * halfWidth * 0.55,
        sy + dy * 0.78 + ny * halfWidth * 0.55,
      )
      .lineTo(ex, ey)
      .lineTo(
        sx + dx * 0.78 - nx * halfWidth * 0.55,
        sy + dy * 0.78 - ny * halfWidth * 0.55,
      )
      .lineTo(sx + dx * 0.2 - nx * halfWidth, sy + dy * 0.2 - ny * halfWidth)
      .closePath()
      .fill({ color, alpha });
  }
  private drawVectorGlyph(
    symbol: string,
    x: number,
    y: number,
    scale: number,
    color: number,
    alpha: number,
    width: number,
  ): void {
    for (const [x1, y1, x2, y2] of combatSegments(symbol))
      this.effect
        .moveTo(x + x1 * 58 * scale, y + y1 * 58 * scale)
        .lineTo(x + x2 * 58 * scale, y + y2 * 58 * scale)
        .stroke({
          color: 0x171717,
          width: width + 6,
          alpha: 0.2 * alpha,
          cap: "round",
        })
        .moveTo(x + x1 * 58 * scale, y + y1 * 58 * scale)
        .lineTo(x + x2 * 58 * scale, y + y2 * 58 * scale)
        .stroke({ color, width, alpha, cap: "round" });
  }
}
function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
type BladeSegment = readonly [number, number, number, number];
function combatSegments(symbol: string): readonly BladeSegment[] {
  return sharedGlyphSegments(symbol);
}
