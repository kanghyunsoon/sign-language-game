import { BackendGameRoomClient, LobbySseClient, RealtimeTicketClient, type BackendGameRoom, type LobbyRoomSummary } from "../../../realtime";
import type { BattleRoomGateway } from "./BattleRoomGateway";
import type { BattleRoomDetail, BattleRoomGatewayOptions, BattleRoomParticipant, BattleRoomSession, BattleRoomSummary, CreateRoomRequest } from "./roomTypes";

type RoomsListener = (rooms: readonly BattleRoomSummary[]) => void;
type SwaggerRoomGatewayOptions = BattleRoomGatewayOptions & { readonly gameType?: "TETRIS_DUEL" | "SIGN_DUEL" };

/**
 * The game-room REST response and lobby SSE are the sole metadata authority.
 * No browser storage or cross-tab metadata cache is used: it could otherwise
 * overwrite a renamed room or a newly delegated host with stale client data.
 */
export class SwaggerBattleRoomGateway implements BattleRoomGateway {
  private readonly client: BackendGameRoomClient;
  private readonly lobby: LobbySseClient;
  private readonly roomCache = new Map<number, BackendGameRoom>();
  private readonly lobbyCache = new Map<number, LobbyRoomSummary>();
  private readonly listeners = new Set<RoomsListener>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private membershipMutation: Promise<void> = Promise.resolve();
  private pendingMembershipMutations = 0;
  private lobbyStarted = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: SwaggerRoomGatewayOptions) {
    const ticketClient = new RealtimeTicketClient({ apiBaseUrl: options.baseUrl, userId: options.currentUser.userId, headers: options.headers, fetcher: options.fetch });
    this.client = new BackendGameRoomClient({ apiBaseUrl: options.baseUrl, userId: options.currentUser.userId, headers: options.headers, fetcher: options.fetch });
    this.lobby = new LobbySseClient({ apiBaseUrl: options.baseUrl, ticketClient });
    this.lobby.subscribe((event) => this.applyLobbySnapshot(event.rooms));
    this.lobby.subscribeError((error) => {
      for (const listener of this.errorListeners) listener(error);
      this.scheduleReconnect();
    });
  }

  async getRooms(): Promise<readonly BattleRoomSummary[]> { this.ensureLobby(); return this.currentRooms(); }

  async refreshRooms(): Promise<readonly BattleRoomSummary[]> {
    this.lobby.disconnect();
    this.lobbyStarted = false;
    this.lobbyCache.clear();
    this.emitRooms();
    this.ensureLobby();
    return this.currentRooms();
  }

  subscribeRooms(listener: RoomsListener, onError?: (error: Error) => void): () => void {
    this.listeners.add(listener);
    if (onError) this.errorListeners.add(onError);
    listener(this.currentRooms());
    this.ensureLobby();
    return () => {
      this.listeners.delete(listener);
      if (onError) this.errorListeners.delete(onError);
      if (this.listeners.size === 0) {
        this.lobby.disconnect();
        this.lobbyStarted = false;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };
  }

  async createRoom(request: CreateRoomRequest): Promise<BattleRoomSession> {
    return this.enqueueMembershipMutation(async () => this.remember(await this.client.create({
      gameType: this.options.gameType ?? "TETRIS_DUEL",
      roomTitle: request.roomTitle.trim(),
      symbolRange: request.symbolRange,
    })));
  }

  async joinRoom(roomCode: string): Promise<BattleRoomSession> {
    return this.enqueueMembershipMutation(async () => this.remember(await this.client.join(roomCode)));
  }

  async getRoom(roomId: string): Promise<BattleRoomDetail> {
    const cached = this.roomCache.get(parseRoomId(roomId));
    if (!cached) throw new Error("방의 상세 정보를 찾을 수 없습니다. 방 목록에서 다시 입장해 주세요.");
    return toDetail(cached, this.options);
  }

  async setReady(roomId: string, isReady: boolean): Promise<BattleRoomSession> {
    return this.remember(await this.client.ready(parseRoomId(roomId), isReady));
  }

  async startGame(roomId: string): Promise<void> { this.remember(await this.client.start(parseRoomId(roomId))); }

  async leaveRoom(roomId: string): Promise<void> {
    const id = parseRoomId(roomId);
    const confirmAfterPendingMutation = this.pendingMembershipMutations > 0;
    this.forgetRoom(id);
    const immediateLeave = this.client.leave(id).then(() => ({ ok: true as const }), (cause: unknown) => ({ ok: false as const, cause }));
    await this.enqueueMembershipMutation(async () => {
      try {
        const firstAttempt = await immediateLeave;
        if (confirmAfterPendingMutation) {
          try { await this.client.leave(id); } catch (cause) { if (!isAlreadyGoneRoom(cause)) throw cause; }
        } else if (!firstAttempt.ok && !isAlreadyGoneRoom(firstAttempt.cause)) throw firstAttempt.cause;
      } finally { this.forgetRoom(id); }
    });
  }

  async returnToWaiting(roomId: string): Promise<void> {
    const id = parseRoomId(roomId);
    const current = this.roomCache.get(id);
    if (!current) throw new Error("방의 상세 정보를 찾을 수 없습니다.");
    this.roomCache.set(id, { ...current, status: "WAITING", hostReady: false, guestReady: false });
    this.emitRooms();
  }

  private remember(room: BackendGameRoom): BattleRoomSession {
    this.roomCache.set(room.id, room);
    return { ...toDetail(room, this.options), currentUser: this.options.currentUser };
  }

  private enqueueMembershipMutation<T>(operation: () => Promise<T>): Promise<T> {
    this.pendingMembershipMutations += 1;
    const result = this.membershipMutation.then(operation, operation);
    const tracked = result.finally(() => { this.pendingMembershipMutations = Math.max(0, this.pendingMembershipMutations - 1); });
    this.membershipMutation = tracked.then(() => undefined, () => undefined);
    return tracked;
  }

  private forgetRoom(id: number): void { this.roomCache.delete(id); this.lobbyCache.delete(id); this.emitRooms(); }

  private ensureLobby(): void {
    if (this.lobbyStarted) return;
    this.lobbyStarted = true;
    void this.lobby.connect().catch((cause) => {
      this.lobbyStarted = false;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      for (const listener of this.errorListeners) listener(error);
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    this.lobbyStarted = false;
    if (this.listeners.size === 0 || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.ensureLobby(); }, 1_000);
  }

  private currentRooms(): readonly BattleRoomSummary[] {
    const expected = this.options.gameType ?? "TETRIS_DUEL";
    return [...this.lobbyCache.values()]
      .filter((room) => room.gameType === expected && room.status === "WAITING" && room.participantCount < room.capacity)
      .map(toSummary);
  }

  private applyLobbySnapshot(rooms: readonly LobbyRoomSummary[]): void {
    this.lobbyCache.clear();
    for (const room of rooms) if (room.status !== "CLOSED") this.lobbyCache.set(room.id, room);
    this.emitRooms();
  }

  private emitRooms(): void { const rooms = this.currentRooms(); for (const listener of this.listeners) listener(rooms); }
}

function isAlreadyGoneRoom(cause: unknown): boolean { return cause instanceof Error && /\((?:403|404|410)\)/.test(cause.message); }

function toSummary(room: LobbyRoomSummary): BattleRoomSummary {
  if (!room.title || !room.hostName) throw new Error("Game room metadata is missing from the server response.");
  return {
    roomId: room.roomCode,
    title: room.title,
    status: room.status === "IN_PROGRESS" ? "PLAYING" : room.participantCount >= room.capacity ? "FULL" : "WAITING",
    playerCount: room.participantCount,
    maxPlayers: room.capacity,
    hostUserId: "",
    hostName: room.hostName,
    symbolRange: room.symbolRange,
    createdAt: null,
    canJoin: room.status === "WAITING" && room.participantCount < room.capacity,
    roomCode: room.roomCode,
  };
}

function toDetail(room: BackendGameRoom, options: BattleRoomGatewayOptions): BattleRoomDetail {
  const currentUserId = options.currentUser.userId;
  const participants: BattleRoomParticipant[] = [
    { userId: String(room.hostUserId), displayName: room.hostName, isHost: true, ready: room.hostReady },
    ...(room.guestUserId === null ? [] : [{ userId: String(room.guestUserId), displayName: String(room.guestUserId), isHost: false, ready: room.guestReady }]),
  ];
  const isHost = String(room.hostUserId) === currentUserId;
  const full = room.participantCount >= room.capacity;
  const canStart = isHost && full && room.hostReady && room.guestReady && room.status === "WAITING";
  return {
    roomId: String(room.id), title: room.roomTitle,
    status: room.status === "IN_PROGRESS" ? "PLAYING" : room.status === "CLOSED" ? "FINISHED" : full ? "FULL" : "WAITING",
    playerCount: room.participantCount, maxPlayers: room.capacity,
    hostUserId: String(room.hostUserId), hostName: room.hostName, symbolRange: room.symbolRange,
    createdAt: null, canJoin: room.status === "WAITING" && !full, roomCode: room.roomCode, participants,
    hostReady: room.hostReady, guestReady: room.guestReady, currentUserReady: isHost ? room.hostReady : room.guestReady,
    canStart, startBlockReason: canStart ? undefined : !full ? "상대방이 입장해야 시작할 수 있습니다." : "두 참가자가 모두 준비해야 시작할 수 있습니다.",
    rematch: false, activeMatchId: room.status === "IN_PROGRESS" ? String(room.id) : null, matchStartAt: null,
  };
}

function parseRoomId(value: string): number { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw new Error("올바르지 않은 방 ID입니다."); return id; }
