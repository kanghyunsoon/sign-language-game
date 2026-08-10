import type { BattleBodyTransform } from "../transport/battleTransportTypes";

/**
 * Stable hash of the board state used by recovery snapshots. Coordinates are
 * quantized before hashing so JSON formatting cannot create false mismatches.
 */
export function boardStateChecksum(bodies: readonly BattleBodyTransform[]): string {
  const canonical = [...bodies]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((body) => [
      body.id,
      body.symbol,
      fixed(body.x),
      fixed(body.y),
      fixed(body.angle),
      body.state,
    ].join("|"))
    .join(";");
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const fixed = (value: number) => Math.round(value * 100_000).toString();
