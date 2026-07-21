import type { SignRecognizer, SignRecognitionListener } from "./SignRecognizer";
import type { RecognitionConnectionState, SignRecognitionEvent } from "../types/events";

export interface KeyboardSignRecognizerOptions {
  readonly supportedSymbols: readonly string[];
  readonly modelVersion?: string;
}

/** Deterministic development adapter; callers provide the confirmed symbol explicitly. */
export class KeyboardSignRecognizer implements SignRecognizer {
  private readonly listeners = new Set<SignRecognitionListener>();
  private state: RecognitionConnectionState = "DISCONNECTED";
  private readonly modelVersion: string;

  constructor(private readonly options: KeyboardSignRecognizerOptions) {
    this.modelVersion = options.modelVersion ?? "keyboard-v1";
  }

  async connect(): Promise<void> {
    if (this.state === "CONNECTED") return;
    this.state = "CONNECTED";
    this.emit({ type: "CONNECTION_STATE", state: this.state, changedAt: Date.now() });
    this.emit({ type: "CAPABILITIES", modelVersion: this.modelVersion, supportedSymbols: this.options.supportedSymbols, sequenceLength: 0 });
  }

  disconnect(): void {
    if (this.state === "DISCONNECTED") return;
    this.state = "DISCONNECTED";
    this.emit({ type: "CONNECTION_STATE", state: this.state, changedAt: Date.now() });
  }

  subscribe(listener: SignRecognitionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSupportedSymbols(): readonly string[] { return this.options.supportedSymbols; }
  getConnectionState(): RecognitionConnectionState { return this.state; }

  confirmSymbol(symbol: string, confidence = 1, confirmedAt = Date.now()): void {
    if (this.state !== "CONNECTED" || !this.options.supportedSymbols.includes(symbol)) return;
    this.emit({ type: "PREDICTION", frameId: confirmedAt, symbol, confidence, isStable: true, predictedAt: confirmedAt });
    this.emit({ type: "SIGN_CONFIRMED", symbol, confidence, confirmedAt, modelVersion: this.modelVersion });
  }

  releaseHand(releasedAt = Date.now()): void { if (this.state === "CONNECTED") this.emit({ type: "HAND_RELEASED", releasedAt }); }
  private emit(event: SignRecognitionEvent): void { this.listeners.forEach((listener) => listener(event)); }
}
