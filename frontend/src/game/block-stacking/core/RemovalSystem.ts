import { InputLock } from "./InputLock";
import { LetterRegistry } from "./LetterRegistry";
import { RemovalTargetSelector } from "./RemovalTargetSelector";
import { SymbolLetterQueues } from "./SymbolLetterQueues";
import { DEFAULT_GAME_CONFIG, type GameConfig, type GameEvent, type GameSnapshot, type LetterEntity } from "./types";

export class RemovalSystem {
  private readonly registry = new LetterRegistry();
  private readonly queues = new SymbolLetterQueues();
  private readonly selector = new RemovalTargetSelector(this.registry, this.queues);
  private readonly inputLock: InputLock;

  constructor(config: GameConfig = DEFAULT_GAME_CONFIG) {
    this.inputLock = new InputLock(config.inputLock);
  }

  spawnLetter(id: string, symbol: string, spawnedAt: number): GameEvent {
    const letter = this.registry.add(id, symbol, spawnedAt);
    this.queues.enqueueFalling(symbol, id);
    return { type: "LETTER_SPAWNED", letter };
  }

  settleLetter(id: string, settledAt: number): GameEvent {
    const letter = this.registry.transition(id, "SETTLED", settledAt);
    this.queues.enqueueSettled(letter.symbol, id);
    return { type: "LETTER_SETTLED", letter };
  }

  resumeLetter(id: string, movedAt: number): Extract<GameEvent, { readonly type: "LETTER_SPAWNED" }> | null {
    const existing = this.registry.get(id);
    if (!existing || existing.state !== "SETTLED") return null;
    const letter = this.registry.transition(id, "FALLING", movedAt);
    return { type: "LETTER_SPAWNED", letter };
  }

  confirmSymbol(symbol: string, at: number): readonly GameEvent[] {
    if (!this.inputLock.tryLock(symbol, at)) {
      return [{ type: "INPUT_REJECTED", symbol, reason: "LOCKED", at }];
    }
    const events: GameEvent[] = [{ type: "INPUT_LOCKED", symbol, at }];
    const target = this.selector.select(symbol);
    if (!target) return [...events, { type: "REMOVAL_SKIPPED", symbol, at }];
    const letter = this.registry.transition(target.id, "REMOVING", at);
    return [...events, { type: "LETTER_REMOVING", letter }];
  }

  completeRemoval(id: string, removedAt: number): Extract<GameEvent, { readonly type: "LETTER_REMOVED" }> {
    const letter = this.registry.transition(id, "REMOVED", removedAt);
    return { type: "LETTER_REMOVED", letter };
  }

  handReleased(at: number): Extract<GameEvent, { readonly type: "HAND_RELEASED" }> {
    return { type: "HAND_RELEASED", releasedSymbol: this.inputLock.release(), at };
  }

  getLetter(id: string): LetterEntity | undefined {
    return this.registry.get(id);
  }

  queueSnapshot(symbol: string) {
    return this.queues.get(symbol);
  }

  snapshot(): GameSnapshot {
    return { letters: this.registry.snapshot(), inputLock: this.inputLock.snapshot() };
  }
}
