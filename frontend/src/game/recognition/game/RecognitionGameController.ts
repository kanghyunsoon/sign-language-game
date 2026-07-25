import type { SignRecognizer } from "../core/SignRecognizer";
import { GAME_SYMBOLS } from "../core/symbols";
import { isCompetitiveRecognitionReady } from "../readiness/recognitionReadiness";
import type { RecognitionConnectionState, SignRecognitionEvent } from "../types/events";
import { LearningStatistics, type SymbolLearningStat } from "./LearningStatistics";

export type GameInputMode = "KEYBOARD" | "PYTHON_AI";
export type RecognitionAnswerState = "IDLE" | "CORRECT" | "INCORRECT" | "NO_TARGET_ON_BOARD";
export type RecognitionErrorKind = "SERVER_UNAVAILABLE" | "MODEL_LOAD_FAILED" | "PROTOCOL_ERROR" | "UNKNOWN";

export interface GameSymbolInput {
  submitSymbol(symbol: string): void;
  releaseInput(): void;
  hasAvailableSymbol(symbol: string): boolean;
  getPreferredTargetSymbol(allowedSymbols: readonly string[]): string | null;
  setSpawnSymbols(symbols: readonly string[]): void;
  recordIncorrectInput(): void;
}

export interface RecognitionGameConfig {
  readonly minimumConfidence: number;
}

export const DEFAULT_RECOGNITION_GAME_CONFIG: RecognitionGameConfig = {
  minimumConfidence: 0.88,
};

export interface RecognitionGameState {
  readonly mode: GameInputMode;
  readonly connectionState: RecognitionConnectionState;
  readonly supportedSymbols: readonly string[];
  readonly playableSymbols: readonly string[];
  readonly modelVersion: string | null;
  readonly targetSymbol: string | null;
  readonly prediction: { readonly symbol: string; readonly confidence: number; readonly isStable: boolean } | null;
  readonly answer: RecognitionAnswerState;
  readonly awaitingHandRelease: boolean;
  readonly message: string;
  readonly error: { readonly kind: RecognitionErrorKind; readonly message: string } | null;
  readonly learningStats: readonly SymbolLearningStat[];
}

export type RecognitionGameListener = (state: RecognitionGameState) => void;

const INITIAL_STATE: RecognitionGameState = {
  mode: "KEYBOARD",
  connectionState: "DISCONNECTED",
  supportedSymbols: [],
  playableSymbols: GAME_SYMBOLS.filter((symbol) => !/^\d+$/.test(symbol)),
  modelVersion: null,
  targetSymbol: GAME_SYMBOLS.find((symbol) => !/^\d+$/.test(symbol)) ?? null,
  prediction: null,
  answer: "IDLE",
  awaitingHandRelease: false,
  message: "Keyboard mode is active.",
  error: null,
  learningStats: [],
};

export class RecognitionGameController {
  private readonly listeners = new Set<RecognitionGameListener>();
  private recognizer: SignRecognizer | null = null;
  private unsubscribeRecognizer: (() => void) | null = null;
  private state = INITIAL_STATE;
  private readonly statistics = new LearningStatistics();
  private awaitingReleaseSymbol: string | null = null;

  constructor(
    private readonly gameInput: GameSymbolInput,
    private readonly config: RecognitionGameConfig = DEFAULT_RECOGNITION_GAME_CONFIG,
  ) {}

  attach(recognizer: SignRecognizer): void {
    this.detach();
    this.recognizer = recognizer;
    this.state = {
      ...this.state,
      connectionState: recognizer.getConnectionState(),
      supportedSymbols: recognizer.getSupportedSymbols(),
      playableSymbols: this.symbolsForMode(this.state.mode, recognizer.getSupportedSymbols()),
    };
    this.ensureValidTarget();
    this.gameInput.setSpawnSymbols(this.state.playableSymbols);
    this.unsubscribeRecognizer = recognizer.subscribe((event) => this.handleEvent(event));
    this.emit();
  }

  detach(): void {
    this.unsubscribeRecognizer?.();
    this.unsubscribeRecognizer = null;
    this.recognizer = null;
  }

  async connect(): Promise<void> {
    if (!this.recognizer) throw new Error("No SignRecognizer is attached.");
    await this.recognizer.connect();
  }

  disconnect(): void {
    this.recognizer?.disconnect();
  }

  setMode(mode: GameInputMode): void {
    const playableSymbols = this.symbolsForMode(mode, this.state.supportedSymbols);
    this.state = {
      ...this.state,
      mode,
      playableSymbols,
      targetSymbol: playableSymbols.includes(this.state.targetSymbol ?? "")
        ? this.state.targetSymbol
        : playableSymbols[0] ?? null,
      answer: "IDLE",
      awaitingHandRelease: false,
      message: mode === "KEYBOARD" ? "Keyboard mode is active." : "Waiting for Python model capabilities.",
    };
    this.awaitingReleaseSymbol = null;
    this.gameInput.setSpawnSymbols(playableSymbols);
    if (mode === "PYTHON_AI" && this.state.targetSymbol) this.recordTarget(this.state.targetSymbol);
    this.emit();
  }

  setTarget(targetSymbol: string): void {
    if (!this.state.playableSymbols.includes(targetSymbol)) return;
    this.state = { ...this.state, targetSymbol, answer: "IDLE", message: `Target: ${targetSymbol}` };
    if (this.state.mode === "PYTHON_AI") this.recordTarget(targetSymbol);
    this.emit();
  }

  selectAdjacentTarget(direction: -1 | 1): void {
    const symbols = this.state.playableSymbols;
    if (symbols.length === 0) return;
    const currentIndex = this.state.targetSymbol === null ? -1 : symbols.indexOf(this.state.targetSymbol);
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const targetSymbol = symbols[(baseIndex + direction + symbols.length) % symbols.length] ?? null;
    if (targetSymbol) this.setTarget(targetSymbol);
  }

  subscribe(listener: RecognitionGameListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): RecognitionGameState {
    return this.state;
  }

  syncTargetToBoard(): void {
    const targetSymbol = this.gameInput.getPreferredTargetSymbol(this.state.playableSymbols);
    if (targetSymbol === null || targetSymbol === this.state.targetSymbol) return;

    this.state = {
      ...this.state,
      targetSymbol,
      answer: "IDLE",
      message: `Guide target: ${targetSymbol}. It is the oldest letter on the board.`,
    };
    if (this.state.mode === "PYTHON_AI") this.recordTarget(targetSymbol);
    this.emit();
  }

  resetSessionStatistics(): void {
    this.statistics.clear();
    this.state = this.withStatistics(this.state);
    if (this.state.mode === "PYTHON_AI" && this.state.targetSymbol) this.recordTarget(this.state.targetSymbol);
    this.emit();
  }

  private handleEvent(event: SignRecognitionEvent): void {
    switch (event.type) {
      case "CONNECTION_STATE":
        this.state = { ...this.state, connectionState: event.state, error: event.state === "CONNECTED" ? null : this.state.error };
        break;
      case "CAPABILITIES": {
        const playableSymbols = this.symbolsForMode(this.state.mode, event.supportedSymbols);
        this.state = {
          ...this.state,
          supportedSymbols: event.supportedSymbols,
          playableSymbols,
          modelVersion: event.modelVersion,
          targetSymbol: playableSymbols.includes(this.state.targetSymbol ?? "")
            ? this.state.targetSymbol
            : playableSymbols[0] ?? null,
          message: playableSymbols.length === 0 && this.state.mode === "PYTHON_AI"
            ? "The Python model has no playable game symbols."
            : "Python capabilities loaded.",
          error: null,
        };
        this.gameInput.setSpawnSymbols(playableSymbols);
        if (this.state.mode === "PYTHON_AI" && this.state.targetSymbol) this.recordTarget(this.state.targetSymbol);
        break;
      }
      case "PREDICTION":
        this.state = {
          ...this.state,
          prediction: { symbol: event.symbol, confidence: event.confidence, isStable: event.isStable },
        };
        break;
      case "SIGN_CONFIRMED":
        this.handleConfirmedSymbol(event.symbol, event.confidence);
        return;
      case "HAND_RELEASED":
        if (this.state.mode === "PYTHON_AI") {
          this.gameInput.releaseInput();
          this.awaitingReleaseSymbol = null;
          this.state = { ...this.state, awaitingHandRelease: false, answer: "IDLE", message: "Hand released. Ready for the next sign." };
        }
        break;
      case "ERROR":
        this.state = { ...this.state, message: event.message, error: classifyRecognitionError(event.code, event.message) };
        break;
    }
    this.emit();
  }

  private handleConfirmedSymbol(symbol: string, confidence: number): void {
    if (this.state.mode !== "PYTHON_AI") return;
    if (this.recognizer?.getConfirmationAuthority?.() !== "TEMPORAL_DECODER") {
      if (this.state.awaitingHandRelease && this.awaitingReleaseSymbol === symbol) return;
      if (this.state.awaitingHandRelease && this.awaitingReleaseSymbol !== symbol) {
        this.gameInput.releaseInput();
        this.awaitingReleaseSymbol = null;
        this.state = { ...this.state, awaitingHandRelease: false, answer: "IDLE" };
      }
      const prediction = this.state.prediction;
      if (confidence < this.config.minimumConfidence || !prediction || !prediction.isStable || prediction.symbol !== symbol || prediction.confidence < this.config.minimumConfidence) {
        this.state = { ...this.state, message: `Ignored ${symbol}: legacy recognizer confirmation was not stable.` };
        this.emit();
        return;
      }
    }
    const matchesTarget = this.state.targetSymbol !== null && symbol === this.state.targetSymbol;
    if (!matchesTarget) {
      if (this.state.targetSymbol) {
        this.statistics.recordConfirmation(this.state.targetSymbol, false, confidence);
      }
      this.gameInput.recordIncorrectInput();
      this.awaitingReleaseSymbol = symbol;
      this.state = this.withStatistics({
        ...this.state,
        answer: "INCORRECT",
        awaitingHandRelease: true,
        message: `${symbol}로 인식했습니다. 목표 ${this.state.targetSymbol ?? "-"}와 달라 글자를 제거하지 않습니다.`,
      });
      this.emit();
      return;
    }
    const hasTargetOnBoard = this.gameInput.hasAvailableSymbol(symbol);
    if (hasTargetOnBoard) this.gameInput.submitSymbol(symbol);
    this.awaitingReleaseSymbol = symbol;
    if (this.state.targetSymbol) {
      this.statistics.recordConfirmation(this.state.targetSymbol, symbol === this.state.targetSymbol, confidence);
    }
    this.state = this.withStatistics({
      ...this.state,
      answer: hasTargetOnBoard ? "CORRECT" : "NO_TARGET_ON_BOARD",
      awaitingHandRelease: true,
      message: hasTargetOnBoard
        ? `${symbol} confirmed. Removing the guide letter.`
        : `No ${symbol} letter is currently on the board.`,
    });
    this.emit();
  }

  private symbolsForMode(mode: GameInputMode, supportedSymbols: readonly string[]): readonly string[] {
    if (mode === "KEYBOARD") return GAME_SYMBOLS.filter((symbol) => !/^\d+$/.test(symbol));
    const supported = new Set(supportedSymbols);
    return GAME_SYMBOLS.filter((symbol) =>
      !/^\d+$/.test(symbol) && supported.has(symbol) && isCompetitiveRecognitionReady(symbol),
    );
  }

  private ensureValidTarget(): void {
    if (this.state.playableSymbols.includes(this.state.targetSymbol ?? "")) return;
    this.state = { ...this.state, targetSymbol: this.state.playableSymbols[0] ?? null };
  }

  private recordTarget(symbol: string): void {
    this.statistics.recordTarget(symbol);
    this.state = this.withStatistics(this.state);
  }

  private withStatistics(state: RecognitionGameState): RecognitionGameState {
    return { ...state, learningStats: this.statistics.snapshot() };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

function classifyRecognitionError(code: string, message: string): { readonly kind: RecognitionErrorKind; readonly message: string } {
  if (code === "WEBSOCKET_ERROR") return { kind: "SERVER_UNAVAILABLE", message: "Python AI server is unavailable. Start game-ai-dev-server, then reconnect." };
  if (code.includes("MODEL")) return { kind: "MODEL_LOAD_FAILED", message };
  if (code === "INVALID_SERVER_MESSAGE") return { kind: "PROTOCOL_ERROR", message };
  return { kind: "UNKNOWN", message };
}
