import { LetterRegistry } from "./LetterRegistry";
import { SymbolLetterQueues } from "./SymbolLetterQueues";
import type { LetterEntity, RemovalTarget } from "./types";

export class RemovalTargetSelector {
  constructor(
    private readonly registry: LetterRegistry,
    private readonly queues: SymbolLetterQueues,
  ) {}

  select(symbol: string): RemovalTarget | null {
    const queue = this.queues.get(symbol);
    const settled = oldestValid(queue.settledIds, "SETTLED", this.registry);
    if (settled) return targetOf(settled);
    const falling = oldestValid(queue.fallingIds, "FALLING", this.registry);
    return falling ? targetOf(falling) : null;
  }
}

function oldestValid(
  ids: readonly string[],
  state: "SETTLED" | "FALLING",
  registry: LetterRegistry,
): LetterEntity | null {
  let selected: LetterEntity | null = null;
  for (const id of ids) {
    const letter = registry.get(id);
    if (!letter || letter.state !== state) continue;
    if (selected === null || priorityTime(letter) < priorityTime(selected) || (priorityTime(letter) === priorityTime(selected) && letter.id < selected.id)) {
      selected = letter;
    }
  }
  return selected;
}

function priorityTime(letter: LetterEntity): number {
  return letter.spawnedAt;
}

function targetOf(letter: LetterEntity): RemovalTarget {
  if (letter.state !== "SETTLED" && letter.state !== "FALLING") throw new Error("Invalid removal target state");
  return { id: letter.id, symbol: letter.symbol, state: letter.state };
}
