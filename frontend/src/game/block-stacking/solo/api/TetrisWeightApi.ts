export interface TetrisWeight {
  readonly signId: number;
  readonly weight: number;
}

interface SignSummary {
  readonly id: number;
  readonly label: string;
}

export type TetrisWeightFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface TetrisWeightApiOptions {
  readonly baseUrl?: string;
  readonly userId: string;
  readonly fetcher?: TetrisWeightFetch;
  readonly credentials?: RequestCredentials;
  readonly headers?: HeadersInit;
}

const WEIGHT_BIAS_STRENGTH = 0.2;
const MAX_EFFECTIVE_WEIGHT = 1.2;

/**
 * Converts the backend learning weight into a deliberately mild game bias.
 *
 * Backend 1.4 -> game 1.08
 * Backend 2.0 -> game 1.20
 */
export function softenTetrisWeight(weight: number): number {
  if (!Number.isFinite(weight) || weight <= 1) return 1;
  return Math.min(MAX_EFFECTIVE_WEIGHT, 1 + (weight - 1) * WEIGHT_BIAS_STRENGTH);
}

export class TetrisWeightApi {
  private readonly baseUrl: string;
  private readonly fetcher: TetrisWeightFetch;
  private readonly credentials: RequestCredentials;
  private readonly headers: HeadersInit;

  constructor(private readonly options: TetrisWeightApiOptions) {
    this.baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.credentials = options.credentials ?? "same-origin";
    this.headers = options.headers ?? {};
  }

  /**
   * Loads one round's symbol weights. Any request or contract failure returns
   * an empty map, which makes the runtime use its uniform 1.0 fallback.
   */
  async getSymbolWeights(): Promise<Readonly<Record<string, number>>> {
    try {
      const [weights, consonants, vowels] = await Promise.all([
        this.getArray(`/wrong-answers/tetris-weights?userId=${encodeURIComponent(this.options.userId)}`, parseWeight),
        this.getArray("/signs?category=CONSONANT", parseSign),
        this.getArray("/signs?category=VOWEL", parseSign),
      ]);
      const labelsById = new Map(
        [...consonants, ...vowels].map((sign) => [sign.id, sign.label] as const),
      );

      return Object.fromEntries(weights.flatMap(({ signId, weight }) => {
        const label = labelsById.get(signId);
        return label === undefined ? [] : [[label, softenTetrisWeight(weight)]];
      }));
    } catch {
      return {};
    }
  }

  private async getArray<T>(path: string, parseItem: (value: unknown) => T): Promise<readonly T[]> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: "GET",
      credentials: this.credentials,
      headers: this.headers,
    });
    if (!response.ok) throw new Error(`Tetris weight API returned ${response.status}.`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new TypeError("Tetris weight API response must be an array.");
    return payload.map(parseItem);
  }
}

function parseWeight(value: unknown): TetrisWeight {
  const record = requireRecord(value);
  if (!Number.isSafeInteger(record.signId) || (record.signId as number) < 0) {
    throw new TypeError("Tetris weight signId must be a non-negative integer.");
  }
  if (typeof record.weight !== "number" || !Number.isFinite(record.weight) || record.weight <= 0) {
    throw new TypeError("Tetris weight must be a positive finite number.");
  }
  return { signId: record.signId as number, weight: record.weight };
}

function parseSign(value: unknown): SignSummary {
  const record = requireRecord(value);
  if (!Number.isSafeInteger(record.id) || (record.id as number) < 0) {
    throw new TypeError("Sign id must be a non-negative integer.");
  }
  if (typeof record.label !== "string" || record.label.length === 0) {
    throw new TypeError("Sign label must be a non-empty string.");
  }
  return { id: record.id as number, label: record.label };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("API item must be an object.");
  }
  return value as Record<string, unknown>;
}
