import { Container, Graphics, Text } from "pixi.js";
import type { LineRaceRuntimeSnapshot } from "../core";
import type { GlyphDuelView } from "../duel/GlyphDuelModel";
import { RaceRunnerRenderer, type RunnerMotionCue } from "./RaceRunnerRenderer";

export interface TraversalRunnerPosition { readonly x: number; readonly y: number; readonly rotation: number; readonly symbol?: string }
export interface LaneRoadShape {
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly accentPoints?: readonly { readonly x: number; readonly y: number }[];
  readonly color?: number;
  readonly alpha?: number;
  readonly reveal?: number;
  readonly state?: string;
}

const TRAVERSAL_RECOVERY_MS = 720;

export function interpolateTraversalRecovery(from: TraversalRunnerPosition, target: TraversalRunnerPosition, elapsedMs: number): TraversalRunnerPosition {
  const progress = Math.min(1, Math.max(0, elapsedMs / TRAVERSAL_RECOVERY_MS));
  const eased = 1 - Math.pow(1 - progress, 3);
  return { x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased, rotation: from.rotation * (1 - eased) };
}

export function resolveRunnerMotionCue(playerId: string, view: GlyphDuelView | null | undefined, now: number): RunnerMotionCue {
  if (!view) return { motion: "IDLE", ageMs: 0 };
  const ageMs = Math.max(0, now - view.calloutAt);
  const moves = view.resolvedMoves?.length ? view.resolvedMoves : view.lastMove ? [view.lastMove] : [];
  if (moves.length > 0 && ageMs < 820) {
    const laneFighterId = playerId === "PLAYER_A" ? view.local.playerId : view.opponent.playerId;
    const ownMove = moves.find((move) => move.attackerId === laneFighterId);
    const incomingMove = moves.find((move) => move.targetId === laneFighterId && move.damage > 0 && (move.role === "ATTACK" || move.role === "FINISHER"));
    if (ownMove && ageMs < 270) return { motion: ownMove.role, ageMs };
    const hitStartsAt = incomingMove?.role === "FINISHER" ? 600 : 480;
    if (incomingMove && ageMs >= hitStartsAt && ageMs < hitStartsAt + 190) return { motion: "HIT", ageMs: ageMs - hitStartsAt };
    if (ownMove && ageMs < 420) return { motion: ownMove.role, ageMs };
  }
  if (playerId === "PLAYER_A" && view.phase === "WAITING") return { motion: "LOCKED", ageMs };
  return { motion: "IDLE", ageMs };
}

/**
 * Kept under the old class name so networking/runtime code does not change.
 * Visually this is no longer a race lane: it is one fighter's territory in a
 * shared glyph arena.
 */
export class RaceLaneRenderer {
  readonly root = new Container();
  private readonly territory = new Graphics();
  private readonly glyphWorld = new Graphics();
  private readonly powerBar = new Graphics();
  private readonly name: Text;
  private readonly detail: Text;
  private readonly status: Text;
  private readonly runner: RaceRunnerRenderer;
  private arenaY = 300;
  private fighterX = 240;

  constructor(private readonly playerId: string) {
    const isPlayer = playerId === "PLAYER_A";
    this.name = new Text({ text: playerId, style: { fill: 0x171717, fontSize: 19, fontWeight: "900" } });
    this.name.anchor.set(.5);
    this.detail = new Text({ text: "", style: { fill: 0x333333, fontSize: 12, fontWeight: "700" } });
    this.detail.anchor.set(.5);
    this.status = new Text({ text: isPlayer ? "나" : "상대", style: { fill: 0x555555, fontSize: 13, fontWeight: "900" } });
    this.status.anchor.set(.5);
    this.runner = new RaceRunnerRenderer(playerId);
    this.root.addChild(this.territory, this.glyphWorld, this.powerBar, this.name, this.detail, this.status, this.runner.root);
  }

  resize(width: number, arenaY: number, fighterScale=1): void {
    this.arenaY = arenaY + (this.playerId === "PLAYER_A" ? 24 : -42);
    this.fighterX = width * (this.playerId === "PLAYER_A" ? .23 : .77);
    this.runner.setViewportScale(fighterScale);
  }

  render(snapshot: LineRaceRuntimeSnapshot, _raceLength: number, traversalPosition?: TraversalRunnerPosition, roadShapes: readonly LaneRoadShape[] = [], impactX = 0, duelView?: GlyphDuelView | null,duelNow=snapshot.simulationNow): void {
    const player = snapshot.players.find((candidate) => candidate.playerId === this.playerId);
    if (!player) { this.root.visible = false; return; }
    this.root.visible = true;
    this.root.position.set(impactX, 0);

    const ownColor = 0x171717;
    const pulse = .5 + Math.sin(snapshot.simulationNow / 360) * .12;
    this.territory.clear()
      .moveTo(this.fighterX-72,this.arenaY+21).bezierCurveTo(this.fighterX-31,this.arenaY+15,this.fighterX+31,this.arenaY+29,this.fighterX+74,this.arenaY+20).stroke({color:ownColor,width:3,alpha:.16+pulse*.08})
      .moveTo(this.fighterX-46,this.arenaY+29).bezierCurveTo(this.fighterX-15,this.arenaY+25,this.fighterX+19,this.arenaY+33,this.fighterX+48,this.arenaY+28).stroke({color:ownColor,width:1.5,alpha:.12})
      .moveTo(this.fighterX-91,this.arenaY+13).lineTo(this.fighterX-76,this.arenaY+11).stroke({color:ownColor,width:2,alpha:.13})
      .moveTo(this.fighterX+78,this.arenaY+12).lineTo(this.fighterX+94,this.arenaY+9).stroke({color:ownColor,width:2,alpha:.13});

    this.renderGlyphWorld(roadShapes);
    const activeX = traversalPosition?.x ?? this.fighterX;
    const activeY = traversalPosition?.y ?? this.arenaY;
    const trapped = Boolean(traversalPosition);
    const colliding = player.state === "TRAVERSING" && !trapped;
    this.runner.render(activeX, activeY, snapshot.simulationNow, snapshot.state === "PLAYING", traversalPosition?.rotation ?? 0, colliding, resolveRunnerMotionCue(this.playerId, duelView, duelNow));

    this.name.text = player.displayName ?? (this.playerId==="PLAYER_A"?"나":"연습 봇");
    const nameOffset=this.playerId==="PLAYER_B"?35:46;
    this.name.position.set(this.fighterX, this.arenaY + nameOffset);
    this.status.position.set(this.fighterX, this.arenaY + nameOffset + 20);
    this.status.visible=false;
    this.detail.text = trapped ? `${traversalPosition?.symbol ?? "글자"} 피격 중` : "";
    this.detail.position.set(this.fighterX, this.arenaY + nameOffset + 22);

    this.powerBar.clear();
  }

  private renderGlyphWorld(shapes: readonly LaneRoadShape[]): void {
    this.glyphWorld.clear();
    for (const shape of shapes) {
      if (shape.state === "WARNING" || shape.points.length < 2) continue;
      const source = shape.accentPoints ?? shape.points;
      const reveal = Math.min(1, Math.max(.05, shape.reveal ?? 1));
      const visible = source.slice(0, Math.max(2, Math.ceil(source.length * reveal)));
      const alpha = shape.alpha ?? 1;
      const color = shape.color ?? 0xb35cff;
      const draw = () => {
        this.glyphWorld.moveTo(visible[0]!.x, visible[0]!.y);
        for (const point of visible.slice(1)) this.glyphWorld.lineTo(point.x, point.y);
      };
      draw(); this.glyphWorld.stroke({ color: 0x171717, width: 18, alpha: .08 * alpha, cap: "round", join: "round" });
      draw(); this.glyphWorld.stroke({ color, width: 7, alpha: .72 * alpha, cap: "round", join: "round" });
      draw(); this.glyphWorld.stroke({ color: 0x171717, width: 2, alpha: .82 * alpha, cap: "round", join: "round" });
    }
  }
}
