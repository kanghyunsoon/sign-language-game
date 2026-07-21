/** Stable frontend boundary for a backend-owned Match module. */
export interface MatchConnectionOptions {
  readonly url: string;
  readonly roomId: string;
  readonly playerId: string;
  readonly accessToken?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface MatchModuleTransport<TCommand, TEvent, TState extends string, TOptions extends MatchConnectionOptions = MatchConnectionOptions> {
  connect(options: TOptions): Promise<void>;
  disconnect(): void;
  send(command: TCommand): void;
  subscribe(listener: (event: TEvent) => void): () => void;
  subscribeConnectionState(listener: (state: TState) => void): () => void;
  getConnectionState(): TState;
}
