import type {
  RecognitionConnectionState,
  SignRecognitionEvent,
} from "../types/events";

export type SignRecognitionListener = (event: SignRecognitionEvent) => void;

export interface SignRecognizer {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(listener: SignRecognitionListener): () => void;
  getSupportedSymbols(): readonly string[];
  getConnectionState(): RecognitionConnectionState;
  getConfirmationAuthority?(): "TEMPORAL_DECODER" | "LEGACY";
  resetRecognitionSession?(): void;
}
