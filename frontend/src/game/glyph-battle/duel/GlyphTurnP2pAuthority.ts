import { elementalModifier, getGlyphCombatRule, type GlyphAttackKind } from "./GlyphCombatRules";
import type { GlyphTurnChoiceCommand, GlyphTurnFighterState, GlyphTurnResolvedChoice, GlyphTurnServerEvent } from "./GlyphTurnMatchContract";

interface Fighter { playerId: string; health: number; focus: number; guardPercent: number; rounds: number; lastKind: GlyphAttackKind | null; }

/** Host-only authoritative resolver for a two-player DataChannel glyph turn match. */
export class GlyphTurnP2pAuthority {
  private readonly fighters = new Map<string, Fighter>();
  private readonly choices = new Map<string, GlyphTurnChoiceCommand>();
  private readonly processed = new Set<string>();
  private readonly listeners = new Set<(event: GlyphTurnServerEvent) => void>();
  private sequence = 0;
  private turn = 1;
  private finished = false;

  constructor(
    readonly matchId: string,
    readonly playerIds: readonly [string, string],
    private readonly now: () => number = Date.now,
    private readonly createEventId: () => string = () => crypto.randomUUID(),
  ) {
    for (const playerId of playerIds) this.fighters.set(playerId, { playerId, health: 100, focus: 0, guardPercent: 0, rounds: 0, lastKind: null });
  }

  subscribe(listener: (event: GlyphTurnServerEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  start(turnEndsAt: number = this.now() + 10_000): void { this.emitSnapshot(turnEndsAt); }

  submit(playerId: string, command: GlyphTurnChoiceCommand): void {
    if (this.finished || !this.fighters.has(playerId) || command.matchId !== this.matchId || command.turn !== this.turn) return;
    if (this.processed.has(command.commandId) || this.choices.has(playerId)) return;
    this.processed.add(command.commandId); this.choices.set(playerId, command);
    this.emit({ type: "GLYPH_TURN_CHOICE_LOCKED", eventId: this.createEventId(), matchId: this.matchId, sequence: ++this.sequence, occurredAt: this.now(), turn: this.turn, playerId, turnEndsAt: 0 });
    if (this.choices.size === this.playerIds.length) this.resolve();
  }

  private resolve(): void {
    const [firstId, secondId] = this.playerIds;
    const first = this.choices.get(firstId)!; const second = this.choices.get(secondId)!;
    const resolved = [this.apply(firstId, secondId, first.symbol), this.apply(secondId, firstId, second.symbol)] as const;
    const at = this.now();
    const fighters = this.snapshotFighters();
    this.emit({ type: "GLYPH_TURN_RESOLVED", eventId: this.createEventId(), matchId: this.matchId, sequence: ++this.sequence, occurredAt: at, turn: this.turn, choices: resolved, fighters });
    this.choices.clear();
    this.finished = fighters.some((fighter) => fighter.health <= 0);
    if (!this.finished) { this.turn += 1; this.emitSnapshot(this.now() + 10_000); }
  }

  private apply(playerId: string, targetId: string, symbol: string): GlyphTurnResolvedChoice {
    const attacker = this.fighters.get(playerId)!; const target = this.fighters.get(targetId)!; const rule = getGlyphCombatRule(symbol);
    const affinity = elementalModifier(rule.kind, target.lastKind); let power = rule.damage;
    if (rule.focusCost > 0) { if (attacker.focus >= rule.focusCost) attacker.focus -= rule.focusCost; else power = Math.ceil(power * .45); }
    const raw = Math.max(0, Math.round(power * affinity.multiplier)); const damage = Math.max(0, raw - Math.round(raw * target.guardPercent / 100));
    target.health = Math.max(0, target.health - damage); target.focus = Math.max(0, target.focus - rule.focusDrain); target.guardPercent = 0;
    attacker.focus = Math.min(100, attacker.focus + rule.focusGain); attacker.guardPercent = Math.max(attacker.guardPercent, rule.damageReduction); attacker.lastKind = rule.kind;
    return { playerId, symbol, role: rule.role, damage, shieldGained: rule.damageReduction, focusDelta: rule.focusGain - rule.focusCost, effectiveness: affinity.multiplier > 1 ? "ADVANTAGE" : affinity.multiplier < 1 ? "RESISTED" : "NEUTRAL" };
  }

  private emitSnapshot(turnEndsAt?: number): void { this.emit({ type: "GLYPH_DUEL_SNAPSHOT", eventId: this.createEventId(), matchId: this.matchId, sequence: ++this.sequence, occurredAt: this.now(), serverTime: this.now(), turn: this.turn, turnEndsAt, phase: this.finished ? "FINISHED" : "PLANNING", lockedPlayerIds: [], fighters: this.snapshotFighters() }); }
  private snapshotFighters(): readonly [GlyphTurnFighterState, GlyphTurnFighterState] { return this.playerIds.map((id) => { const { lastKind: _lastKind, ...fighter } = this.fighters.get(id)!; return fighter; }) as unknown as readonly [GlyphTurnFighterState, GlyphTurnFighterState]; }
  private emit(event: GlyphTurnServerEvent): void { for (const listener of this.listeners) listener(event); }
}
