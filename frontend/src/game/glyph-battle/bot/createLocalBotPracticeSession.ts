import { createDevLineRaceScenario, type DevLineRaceScenario } from "../dev/createDevLineRaceScenario";
import { DefaultLocalLineRaceCommandGateway, LocalBotLineRaceTransport } from "../transport";
import type { LineRaceRuntimeConfig } from "../core";
import { MockLineRaceBot } from "./MockLineRaceBot";
import { SeededRandom } from "./SeededRandom";
import { createLineRaceBotProfile, type LineRaceBotDifficulty } from "./botProfiles";
import { COMPETITIVE_RECOGNITION_SYMBOLS } from "../../recognition/readiness/recognitionReadiness";

export interface LocalBotPracticeSession {
  readonly scenario: DevLineRaceScenario;
  readonly userTransport: LocalBotLineRaceTransport;
  readonly botTransport: LocalBotLineRaceTransport;
  readonly bot: MockLineRaceBot;
  readonly seed: number;
  dispose(): void;
}

export function createLocalBotPracticeSession(options: {
  readonly seed?: number;
  readonly difficulty?: LineRaceBotDifficulty;
  readonly runtimeConfig?: Partial<LineRaceRuntimeConfig>;
  readonly source?: () => number;
} = {}): LocalBotPracticeSession {
  const seed = options.seed ?? 12_345;
  const scenario = createDevLineRaceScenario(options.runtimeConfig, options.source);
  const available = new Set(scenario.controller.getObstacleTemplates().map((template) => template.symbol));
  const symbols = COMPETITIVE_RECOGNITION_SYMBOLS.filter((symbol) => available.has(symbol));
  const random = new SeededRandom(seed);
  const botConfig = createLineRaceBotProfile(options.difficulty ?? "NORMAL", symbols, seed);
  const botHand = pickInitialHand(symbols, random);
  const userGateway = new DefaultLocalLineRaceCommandGateway({
    controller: scenario.controller, localPlayerId: "PLAYER_A", opponentPlayerId: "PLAYER_B",
    supportedSymbols: symbols,
  });
  const botGateway = new DefaultLocalLineRaceCommandGateway({
    controller: scenario.controller, localPlayerId: "PLAYER_B", opponentPlayerId: "PLAYER_A",
    initialHand: botHand, supportedSymbols: botConfig.supportedSymbols, random: () => random.next(),
  });
  const userTransport = new LocalBotLineRaceTransport(userGateway, scenario.controller, "PLAYER_A", () => Date.now());
  const botTransport = new LocalBotLineRaceTransport(botGateway, scenario.controller, "PLAYER_B");
  const bot = new MockLineRaceBot({ config: botConfig, transport: botTransport, random });
  return {
    scenario, userTransport, botTransport, bot, seed,
    dispose: () => { bot.dispose(); userTransport.dispose(); botTransport.dispose(); scenario.runtime.dispose(); },
  };
}

function pickInitialHand(symbols: readonly string[], random: SeededRandom): readonly string[] {
  if (symbols.length < 3) throw new Error("Bot practice requires at least three symbols.");
  const pool = [...symbols]; const hand: string[] = [];
  while (hand.length < 3) hand.push(pool.splice(Math.floor(random.next() * pool.length), 1)[0] as string);
  return hand;
}
