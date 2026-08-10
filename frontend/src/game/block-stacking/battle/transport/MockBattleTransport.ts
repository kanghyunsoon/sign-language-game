import type { BattleGameTransport } from "./BattleGameTransport";
import type { BattleConnectionOptions, BattleConnectionState, ClientBattleMessage, ServerBattleMessage } from "./battleTransportTypes";

export class MockBattleTransport implements BattleGameTransport {
  readonly sent: ClientBattleMessage[] = []; readonly connections: BattleConnectionOptions[] = [];
  private readonly listeners = new Set<(message: ServerBattleMessage) => void>(); private readonly stateListeners = new Set<(state: BattleConnectionState) => void>(); private state: BattleConnectionState = "DISCONNECTED";
  constructor(private readonly connectError: Error | null = null) {}
  async connect(options: BattleConnectionOptions): Promise<void> { this.connections.push(options); this.setState("CONNECTING"); if (this.connectError) { this.setState("ERROR"); throw this.connectError; } this.setState("CONNECTED"); }
  disconnect(): void { this.setState("DISCONNECTED"); }
  send(message: ClientBattleMessage): void { if (this.state !== "CONNECTED") throw new Error("Battle transport is not connected."); this.sent.push(message); }
  subscribe(listener: (message: ServerBattleMessage) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeConnectionState(listener: (state: BattleConnectionState) => void): () => void { this.stateListeners.add(listener); listener(this.state); return () => this.stateListeners.delete(listener); }
  getConnectionState(): BattleConnectionState { return this.state; }
  emit(message: ServerBattleMessage): void { for (const listener of this.listeners) listener(message); }
  simulateConnectionState(state: BattleConnectionState): void { this.setState(state); }
  private setState(state: BattleConnectionState): void { this.state = state; for (const listener of this.stateListeners) listener(state); }
}
