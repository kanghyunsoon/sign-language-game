import type { GameDataChannel } from "../../media/core/GameDataChannel";
import { WebRtcDataChannelTransport, type WebRtcGameTransportState } from "../../realtime";
import { elementalModifier, getGlyphCombatRule, type GlyphAttackKind } from "./GlyphCombatRules";
import type { GlyphTurnChoiceCommand, GlyphTurnFighterState, GlyphTurnResolvedChoice, GlyphTurnServerEvent } from "./GlyphTurnMatchContract";
import type { GlyphTurnConnectionOptions, GlyphTurnConnectionState, GlyphTurnMatchTransport } from "./GlyphTurnMatchTransport";

interface P2pGlyphTurnOptions {
  readonly getChannel: () => GameDataChannel | null;
  readonly localPlayerId: string;
}
interface Fighter { playerId: string; health: number; focus: number; guardPercent: number; rounds: number; lastKind: GlyphAttackKind | null; }
type PeerCommand = GlyphTurnChoiceCommand | { readonly type: "GLYPH_DUEL_SNAPSHOT_REQUEST"; readonly matchId: string };

/**
 * Browser-hosted authority for the current two-player room.  The backend only
 * creates the room and relays WebRTC signalling; game state never traverses
 * the Room WebSocket.
 */
export class P2pGlyphTurnMatchTransport implements GlyphTurnMatchTransport {
  private readonly transport: WebRtcDataChannelTransport<PeerCommand, GlyphTurnServerEvent>;
  private readonly fighters = new Map<string, Fighter>();
  private readonly choices = new Map<string, GlyphTurnChoiceCommand & { readonly playerId: string }>();
  private readonly processedCommands = new Set<string>();
  private playerIds: readonly string[];
  private hostPlayerId: string;
  private matchId = "";
  private turn = 1;
  private sequence = 0;
  private unsubscribeCommands: (() => void) | null = null;
  private connectGeneration = 0;

  constructor(private readonly options: P2pGlyphTurnOptions) {
    this.playerIds = [options.localPlayerId];
    this.hostPlayerId = options.localPlayerId;
    this.transport = new WebRtcDataChannelTransport(options.getChannel, isGlyphTurnEvent);
    for (const playerId of this.playerIds) this.fighters.set(playerId, { playerId, health: 100, focus: 0, guardPercent: 0, rounds: 0, lastKind: null });
  }

  async connect(options: GlyphTurnConnectionOptions): Promise<void> {
    const generation = ++this.connectGeneration;
    this.matchId = options.matchId;
    this.hostPlayerId = options.hostPlayerId ?? this.options.localPlayerId;
    this.playerIds = [...new Set(options.playerIds ?? this.playerIds)].slice(0, 2);
    for (const playerId of this.playerIds) if (!this.fighters.has(playerId)) this.fighters.set(playerId, { playerId, health: 100, focus: 0, guardPercent: 0, rounds: 0, lastKind: null });
    await this.transport.connect(options);
    if (generation !== this.connectGeneration || this.transport.getConnectionState() !== "CONNECTED") return;
    if (this.isHost()) {
      this.unsubscribeCommands ??= this.transport.subscribeCommands((command, remoteUserId) => this.handlePeerCommand(command, remoteUserId));
      this.publishSnapshot();
    } else {
      this.transport.send({ type: "GLYPH_DUEL_SNAPSHOT_REQUEST", matchId: this.matchId });
    }
  }

  disconnect(): void { this.connectGeneration += 1; this.unsubscribeCommands?.(); this.unsubscribeCommands = null; this.transport.disconnect(); }
  send(command: GlyphTurnChoiceCommand): void {
    if (this.isHost()) this.handleChoice(command, this.options.localPlayerId);
    else this.transport.send(command);
  }
  requestSnapshot(matchId: string): void {
    if (matchId !== this.matchId) return;
    if (this.isHost()) this.publishSnapshot();
    else this.transport.send({ type: "GLYPH_DUEL_SNAPSHOT_REQUEST", matchId });
  }
  subscribe(listener: (event: GlyphTurnServerEvent) => void): () => void { return this.transport.subscribe(listener); }
  subscribeConnectionState(listener: (state: GlyphTurnConnectionState) => void): () => void { return this.transport.subscribeConnectionState((state) => listener(state)); }
  getConnectionState(): GlyphTurnConnectionState { return this.transport.getConnectionState(); }

  private isHost(): boolean { return this.options.localPlayerId === this.hostPlayerId; }
  private handlePeerCommand(command: PeerCommand, remoteUserId: string): void {
    if (command.type === "GLYPH_DUEL_SNAPSHOT_REQUEST") { if (command.matchId === this.matchId) this.publishSnapshot(); return; }
    this.handleChoice(command, remoteUserId);
  }
  private handleChoice(command: GlyphTurnChoiceCommand, playerId: string): void {
    if (!this.isHost() || command.matchId !== this.matchId || command.turn !== this.turn || playerId !== this.playerIds.find((id) => id === playerId)) return;
    if (this.processedCommands.has(command.commandId) || this.choices.has(playerId)) return;
    try { getGlyphCombatRule(command.symbol); } catch { return; }
    this.processedCommands.add(command.commandId); this.choices.set(playerId, { ...command, playerId });
    this.transport.publishEvent({ type: "GLYPH_TURN_CHOICE_LOCKED", eventId: id(), matchId: this.matchId, sequence: ++this.sequence, occurredAt: Date.now(), turn: this.turn, playerId, turnEndsAt: Date.now() + 10_000 });
    if (this.choices.size === this.playerIds.length) this.resolveTurn();
    else this.publishSnapshot();
  }
  private resolveTurn(): void {
    const now = Date.now(); const choices = this.playerIds.map((playerId) => this.choices.get(playerId)!);
    const resolved = choices.map((choice, index) => this.resolveChoice(choice, this.playerIds[(index + 1) % this.playerIds.length]));
    const finished = [...this.fighters.values()].some((fighter) => fighter.health <= 0);
    this.transport.publishEvent({ type: "GLYPH_TURN_RESOLVED", eventId: id(), matchId: this.matchId, sequence: ++this.sequence, occurredAt: now, turn: this.turn, choices: resolved as [GlyphTurnResolvedChoice, GlyphTurnResolvedChoice], fighters: this.snapshotFighters() });
    this.choices.clear(); this.turn += 1;
    if (!finished) this.publishSnapshot();
    else this.transport.publishSnapshot({ type: "GLYPH_DUEL_SNAPSHOT", eventId: id(), matchId: this.matchId, sequence: ++this.sequence, occurredAt: Date.now(), serverTime: Date.now(), turn: this.turn, phase: "FINISHED", lockedPlayerIds: [], fighters: this.snapshotFighters() });
  }
  private resolveChoice(choice: GlyphTurnChoiceCommand & { readonly playerId: string }, targetId: string): GlyphTurnResolvedChoice {
    const attacker = this.fighters.get(choicePlayer(choice))!;
    const defender = this.fighters.get(targetId)!; const rule = getGlyphCombatRule(choice.symbol); const affinity = elementalModifier(rule.kind, defender.lastKind);
    let power = rule.damage; if (rule.focusCost > 0) { if (attacker.focus >= rule.focusCost) attacker.focus -= rule.focusCost; else power = Math.ceil(power * .45); }
    const raw = Math.max(1, Math.round(power * affinity.multiplier)); const damage = Math.max(0, raw - Math.round(raw * defender.guardPercent / 100));
    defender.guardPercent = 0; defender.health = Math.max(0, defender.health - damage); attacker.focus = Math.min(100, attacker.focus + rule.focusGain); defender.focus = Math.max(0, defender.focus - rule.focusDrain); attacker.guardPercent = Math.max(attacker.guardPercent, rule.damageReduction); attacker.lastKind = rule.kind;
    return { playerId: attacker.playerId, symbol: choice.symbol, role: rule.role, damage, shieldGained: rule.damageReduction, focusDelta: rule.focusGain - rule.focusCost, effectiveness: affinity.label === "상성 우위" ? "ADVANTAGE" : affinity.label === "효과 감소" ? "RESISTED" : "NEUTRAL" };
  }
  private publishSnapshot(): void { this.transport.publishSnapshot({ type: "GLYPH_DUEL_SNAPSHOT", eventId: id(), matchId: this.matchId, sequence: ++this.sequence, occurredAt: Date.now(), serverTime: Date.now(), turn: this.turn, turnEndsAt: Date.now() + 10_000, phase: "PLANNING", lockedPlayerIds: [...this.choices.keys()], fighters: this.snapshotFighters() }); }
  private snapshotFighters(): [GlyphTurnFighterState, GlyphTurnFighterState] { return this.playerIds.map((playerId) => { const fighter = this.fighters.get(playerId)!; return { playerId, health: fighter.health, focus: fighter.focus, guardPercent: fighter.guardPercent, rounds: fighter.rounds }; }) as [GlyphTurnFighterState, GlyphTurnFighterState]; }
}
function choicePlayer(choice: GlyphTurnChoiceCommand & { readonly playerId: string }): string { return choice.playerId; }
function isGlyphTurnEvent(value: unknown): value is GlyphTurnServerEvent { return !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string" && ["GLYPH_TURN_CHOICE_LOCKED", "GLYPH_TURN_RESOLVED", "GLYPH_DUEL_SNAPSHOT"].includes((value as { type: string }).type); }
function id(): string { return crypto.randomUUID(); }