import {
  BackendGameRoomClient,
  LobbySseClient,
  RealtimeTicketClient,
  type BackendGameRoom,
  type LobbyRoomSummary,
} from "../../../realtime";
import type { BattleRoomGateway } from "./BattleRoomGateway";
import type {
  BattleRoomDetail,
  BattleRoomGatewayOptions,
  BattleRoomParticipant,
  BattleRoomSession,
  BattleRoomSummary,
  CreateRoomRequest,
} from "./roomTypes";

type RoomsListener = (rooms: readonly BattleRoomSummary[]) => void;
type SwaggerRoomGatewayOptions = BattleRoomGatewayOptions & {
  readonly gameType?: "TETRIS_DUEL" | "SIGN_DUEL";
};

/**
 * Adapter for the deployed Swagger contract.
 *
 * The backend deliberately has no room-list REST endpoint and no room-detail GET.
 * Lobby state therefore comes from SSE, while the full room response is cached
 * from create/join/ready/start REST responses.
 */
export class SwaggerBattleRoomGateway implements BattleRoomGateway {
  private readonly client: BackendGameRoomClient;
  private readonly lobby: LobbySseClient;
  private readonly roomCache = new Map<number, BackendGameRoom>();
  private readonly lobbyCache = new Map<number, LobbyRoomSummary>();
  private readonly listeners = new Set<RoomsListener>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private lobbyStarted = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: SwaggerRoomGatewayOptions) {
    const ticketClient = new RealtimeTicketClient({
      apiBaseUrl: options.baseUrl,
      userId: options.currentUser.userId,
      headers: options.headers,
      fetcher: options.fetch,
    });
    this.client = new BackendGameRoomClient({
      apiBaseUrl: options.baseUrl,
      userId: options.currentUser.userId,
      headers: options.headers,
      fetcher: options.fetch,
    });
    this.lobby = new LobbySseClient({ apiBaseUrl: options.baseUrl, ticketClient });
    this.lobby.subscribe((event) => {
      if (event.type === "snapshot") this.lobbyCache.clear();
      for (const room of event.rooms) {
        if (room.status === "CLOSED") this.lobbyCache.delete(room.id);
        else this.lobbyCache.set(room.id, room);
      }
      this.emitRooms();
    });
    this.lobby.subscribeError((error) => {
      for (const listener of this.errorListeners) listener(error);
      this.scheduleReconnect();
    });
  }

  async getRooms(): Promise<readonly BattleRoomSummary[]> {
    this.ensureLobby();
    return this.currentRooms();
  }

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

  async createRoom(_request: CreateRoomRequest): Promise<BattleRoomSession> {
    return this.remember(await this.client.create(this.options.gameType ?? "TETRIS_DUEL"));
  }

  async joinRoom(roomCode: string): Promise<BattleRoomSession> {
    // The current backend contract makes join idempotent for an existing
    // participant and returns the authoritative room state plus a fresh ticket.
    return this.remember(await this.client.join(roomCode));
  }

  async getRoom(roomId: string): Promise<BattleRoomDetail> {
    const cached = this.roomCache.get(parseRoomId(roomId));
    if (!cached) {
      throw new Error("이 방의 상세 정보가 없습니다. 방 목록에서 다시 입장해 주세요.");
    }
    return toDetail(cached, this.options);
  }

  async setReady(roomId: string, isReady: boolean): Promise<BattleRoomSession> {
    return this.remember(await this.client.ready(parseRoomId(roomId), isReady));
  }

  async startGame(roomId: string): Promise<void> {
    this.remember(await this.client.start(parseRoomId(roomId)));
  }

  async leaveRoom(roomId: string): Promise<void> {
    const id = parseRoomId(roomId);
    try {
      await this.client.leave(id);
    } finally {
      // A failed/already-completed remote leave must not keep a ghost room in
      // this browser's authoritative-looking local lobby cache.
      this.roomCache.delete(id);
      this.lobbyCache.delete(id);
      this.emitRooms();
    }
  }

  async returnToWaiting(roomId: string): Promise<void> {
    // The result endpoint itself returns the room to WAITING (FR-013). There
    // is no follow-up room-detail endpoint, so mirror that documented state in
    // the cache used by the waiting-room screen.
    const id = parseRoomId(roomId);
    const current = this.roomCache.get(id);
    if (!current) throw new Error("이 방의 상세 정보가 없습니다. 방 목록에서 다시 입장해 주세요.");
    this.roomCache.set(id, {
      ...current,
      status: "WAITING",
      hostReady: false,
      guestReady: false,
    });
    this.emitRooms();
  }

  private remember(room: BackendGameRoom): BattleRoomSession {
    this.roomCache.set(room.id, room);
    return { ...toDetail(room, this.options), currentUser: this.options.currentUser };
  }

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
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureLobby();
    }, 1_000);
  }

  private currentRooms(): readonly BattleRoomSummary[] {
    const expected = this.options.gameType ?? "TETRIS_DUEL";
    return [...this.lobbyCache.values()]
      .filter((room) => room.gameType === expected)
      .map(toSummary);
  }

  private emitRooms(): void {
    const rooms = this.currentRooms();
    for (const listener of this.listeners) listener(rooms);
  }
}

function toSummary(room: LobbyRoomSummary): BattleRoomSummary {
  return {
    // The list has no join-by-id API. The card carries the room code as its join key.
    roomId: room.roomCode,
    title: `대전방 ${room.roomCode}`,
    status: room.status === "IN_PROGRESS" ? "PLAYING" : room.participantCount >= room.capacity ? "FULL" : "WAITING",
    playerCount: room.participantCount,
    maxPlayers: room.capacity,
    hostUserId: "",
    hostName: "방장",
    difficulty: "기본",
    symbolRange: [],
    createdAt: null,
    canJoin: room.status === "WAITING" && room.participantCount < room.capacity,
    roomCode: room.roomCode,
  };
}

function toDetail(room: BackendGameRoom, options: BattleRoomGatewayOptions): BattleRoomDetail {
  const currentUserId = options.currentUser.userId;
  const participants: BattleRoomParticipant[] = [
    participant(String(room.hostUserId), true, room.hostReady, currentUserId, options),
    ...(room.guestUserId === null ? [] : [
      participant(String(room.guestUserId), false, room.guestReady, currentUserId, options),
    ]),
  ];
  const isHost = String(room.hostUserId) === currentUserId;
  const full = room.participantCount >= room.capacity;
  const canStart = isHost && full && room.hostReady && room.guestReady && room.status === "WAITING";
  return {
    roomId: String(room.id),
    title: `대전방 ${room.roomCode}`,
    status: room.status === "IN_PROGRESS" ? "PLAYING" : room.status === "CLOSED" ? "FINISHED" : full ? "FULL" : "WAITING",
    playerCount: room.participantCount,
    maxPlayers: room.capacity,
    hostUserId: String(room.hostUserId),
    hostName: participants[0]?.displayName ?? "방장",
    difficulty: "기본",
    symbolRange: [],
    createdAt: null,
    canJoin: room.status === "WAITING" && !full,
    roomCode: room.roomCode,
    participants,
    hostReady: room.hostReady,
    guestReady: room.guestReady,
    currentUserReady: isHost ? room.hostReady : room.guestReady,
    canStart,
    startBlockReason: canStart ? undefined : !full ? "상대방이 입장해야 시작할 수 있습니다." : "두 참가자가 모두 준비해야 시작할 수 있습니다.",
    rematch: false,
    activeMatchId: room.status === "IN_PROGRESS" ? String(room.id) : null,
    matchStartAt: null,
  };
}

function participant(userId: string, isHost: boolean, ready: boolean, currentUserId: string, options: BattleRoomGatewayOptions): BattleRoomParticipant {
  return {
    userId,
    displayName: userId === currentUserId ? options.currentUser.displayName : isHost ? "방장" : "상대방",
    isHost,
    ready,
  };
}

function parseRoomId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("올바르지 않은 방 ID입니다.");
  return id;
}
