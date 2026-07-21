import type { LetterEntity, LetterState } from "./types";

export class LetterRegistry {
  private readonly letters = new Map<string, LetterEntity>();

  add(id: string, symbol: string, spawnedAt: number): LetterEntity {
    if (this.letters.has(id)) throw new Error(`Letter already exists: ${id}`);
    const letter: LetterEntity = { id, symbol, state: "FALLING", spawnedAt };
    this.letters.set(id, letter);
    return letter;
  }

  get(id: string): LetterEntity | undefined {
    return this.letters.get(id);
  }

  transition(id: string, state: LetterState, at: number): LetterEntity {
    const current = this.letters.get(id);
    if (!current) throw new Error(`Unknown letter: ${id}`);
    if (!canTransition(current.state, state)) {
      throw new Error(`Cannot transition ${id} from ${current.state} to ${state}`);
    }
    const updated: LetterEntity = {
      ...current,
      state,
      ...(state === "SETTLED" ? { settledAt: at } : {}),
      ...(state === "FALLING" ? { settledAt: undefined } : {}),
      ...(state === "REMOVING" ? { removingAt: at } : {}),
      ...(state === "REMOVED" ? { removedAt: at } : {}),
    };
    this.letters.set(id, updated);
    return updated;
  }

  snapshot(): readonly LetterEntity[] {
    return [...this.letters.values()].sort((left, right) => left.spawnedAt - right.spawnedAt || left.id.localeCompare(right.id));
  }
}

function canTransition(from: LetterState, to: LetterState): boolean {
  return (from === "FALLING" && (to === "SETTLED" || to === "REMOVING"))
    || (from === "SETTLED" && (to === "FALLING" || to === "REMOVING"))
    || (from === "REMOVING" && to === "REMOVED");
}
