import type {
  CompleteSoloSessionRequest,
  SoloGameApi,
  SoloGameResult,
  StartSoloSessionRequest,
  StartSoloSessionResponse,
} from "./SoloGameApi";

interface PendingCompletion {
  readonly soloSessionId: string;
  readonly request: CompleteSoloSessionRequest;
}

export class SoloSessionCoordinator {
  private activeSession: StartSoloSessionResponse | null = null;
  private pendingCompletion: PendingCompletion | null = null;
  private starting: Promise<StartSoloSessionResponse> | null = null;

  constructor(private readonly api: SoloGameApi) {}

  async start(request: StartSoloSessionRequest): Promise<StartSoloSessionResponse> {
    if (this.starting) return this.starting;
    if (this.activeSession) throw new Error("A solo session is already active.");
    const operation = this.api.startSession(request);
    this.starting = operation;
    try {
      const session = await operation;
      this.activeSession = session;
      this.pendingCompletion = null;
      return session;
    } finally {
      this.starting = null;
    }
  }

  async complete(request: CompleteSoloSessionRequest): Promise<SoloGameResult> {
    if (!this.activeSession) throw new Error("No active solo session exists.");
    this.pendingCompletion = { soloSessionId: this.activeSession.soloSessionId, request };
    return this.submitPending();
  }

  async retryCompletion(): Promise<SoloGameResult> {
    if (!this.pendingCompletion) throw new Error("No failed solo completion is available to retry.");
    return this.submitPending();
  }

  getActiveSession(): StartSoloSessionResponse | null {
    return this.activeSession;
  }

  hasPendingCompletion(): boolean {
    return this.pendingCompletion !== null;
  }

  getResults(): Promise<readonly SoloGameResult[]> {
    return this.api.getResults();
  }

  private async submitPending(): Promise<SoloGameResult> {
    const pending = this.pendingCompletion;
    if (!pending) throw new Error("No solo completion is pending.");
    const result = await this.api.completeSession(pending.soloSessionId, pending.request);
    this.pendingCompletion = null;
    this.activeSession = null;
    return result;
  }
}
