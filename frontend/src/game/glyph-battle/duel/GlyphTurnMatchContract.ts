import type { GlyphMoveRole } from "./GlyphCombatRules";

/**
 * Canonical contract for the replacement Match module.
 * Choice events sent to an opponent never contain symbol, role or element.
 */
export interface GlyphTurnChoiceCommand {
  readonly type:"GLYPH_TURN_CHOICE_COMMAND";readonly commandId:string;readonly matchId:string;readonly turn:number;readonly symbol:string;readonly chosenAt:number;
}
export interface GlyphTurnChoiceLockedEvent {
  readonly type:"GLYPH_TURN_CHOICE_LOCKED";readonly eventId:string;readonly matchId:string;readonly sequence:number;readonly occurredAt:number;readonly turn:number;readonly playerId:string;readonly turnEndsAt:number;
}
export interface GlyphTurnResolvedChoice { readonly playerId:string;readonly symbol:string;readonly role:GlyphMoveRole;readonly damage:number;readonly shieldGained:number;readonly focusDelta:number;readonly effectiveness:"ADVANTAGE"|"RESISTED"|"NEUTRAL" }
export interface GlyphTurnFighterState { readonly playerId:string;readonly health:number;readonly focus:number;readonly guardPercent:number;readonly rounds:number }
export interface GlyphTurnResolvedEvent {
  readonly type:"GLYPH_TURN_RESOLVED";readonly eventId:string;readonly matchId:string;readonly sequence:number;readonly occurredAt:number;readonly turn:number;readonly choices:readonly [GlyphTurnResolvedChoice,GlyphTurnResolvedChoice];readonly fighters:readonly [GlyphTurnFighterState,GlyphTurnFighterState];
}
export interface GlyphTurnSnapshotEvent {
  readonly type:"GLYPH_DUEL_SNAPSHOT";readonly eventId:string;readonly matchId:string;readonly sequence:number;readonly occurredAt:number;readonly serverTime:number;readonly turn:number;readonly turnEndsAt?:number;readonly phase:"PLANNING"|"REVEAL"|"FINISHED";readonly lockedPlayerIds:readonly string[];readonly fighters:readonly [GlyphTurnFighterState,GlyphTurnFighterState];
}

export type GlyphTurnServerEvent=GlyphTurnChoiceLockedEvent|GlyphTurnResolvedEvent|GlyphTurnSnapshotEvent;
