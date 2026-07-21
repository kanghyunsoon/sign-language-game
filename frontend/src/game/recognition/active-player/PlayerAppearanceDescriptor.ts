import type { PersonReIdentificationAdapter, PlayerAppearanceDescriptor } from "./activePlayerTypes";
export type { PlayerAppearanceDescriptor } from "./activePlayerTypes";
export class NoOpPersonReIdentificationAdapter implements PersonReIdentificationAdapter {
  async createEmbedding(): Promise<null> { return null; }
  similarity(first: Float32Array, second: Float32Array): number { return cosine(first, second); }
}
export function cosine(first: Float32Array, second: Float32Array): number {
  if (first.length === 0 || first.length !== second.length) return 0;
  let dot = 0, left = 0, right = 0;
  for (let index = 0; index < first.length; index += 1) { dot += first[index]! * second[index]!; left += first[index]! ** 2; right += second[index]! ** 2; }
  return left && right ? Math.max(0, Math.min(1, dot / Math.sqrt(left * right))) : 0;
}
