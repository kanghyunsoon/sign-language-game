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
type RoomDisplayMetadata = Pick<CreateRoomRequest, "title" | "difficulty" | "symbolRange"> & {
  readonly hostName: string;
};
const ROOM_DISPLAY_METADATA_KEY_PREFIX = "sudal:battle-room-display:";
const ROOM_DISPLAY_METADATA_UPDATED_EVENT = "sudal:battle-room-display-updated";

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
  private readonly roomDisplayMetadata = new Map<number, RoomDisplayMetadata>();
  private readonly listeners = new Set<RoomsListener>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private membershipMutation: Promise<void> = Promise.resolve();
  private pendingMembershipMutations = 0;
  private lobbyStarted = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private displayMetadataSyncStarted = false;

  constructor(private readonly options: SwaggerRoomGatewayOptions) {
    this.restoreDisplayMetadata();
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
      // Both `snapshot` and `update` carry the backend's complete WAITING-room
      // list. Replacing the cache is required so a room omitted after its last
      // participant leaves disappears for every connected lobby client.
      this.applyLobbySnapshot(event.rooms);
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
    this.startDisplayMetadataSync();
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
        this.stopDisplayMetadataSync();
      }
    };
  }

  async createRoom(request: CreateRoomRequest): Promise<BattleRoomSession> {
    return this.enqueueMembershipMutation(async () => {
      const room = await this.client.create(this.options.gameType ?? "TETRIS_DUEL");
      this.roomDisplayMetadata.set(room.id, {
        title: request.title.trim(),
        hostName: this.options.currentUser.displayName,
        difficulty: request.difficulty,
        symbolRange: [...request.symbolRange],
      });
      this.persistDisplayMetadata();
      const session = this.remember(room);
      // The lobby SSE can announce the new room before the create response
      // arrives. Re-publish now that its creator metadata is available so the
      // fallback title/nickname never remains on screen until a refresh.
      this.emitRooms();
      return session;
    });
  }

  async joinRoom(roomCode: string): Promise<BattleRoomSession> {
    // The current backend contract makes join idempotent for an existing
    // participant and returns the authoritative room state plus a fresh ticket.
    return this.enqueueMembershipMutation(async () => this.remember(await this.client.join(roomCode)));
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
    const confirmAfterPendingMutation = this.pendingMembershipMutations > 0;

    // A leave must reach the backend immediately. Waiting behind the
    // idempotent room-hydration join kept an abandoned host room visible to
    // every other lobby subscriber until that join eventually completed.
    this.forgetRoom(id);
    const immediateLeave = this.client.leave(id).then(
      () => ({ ok: true as const }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );

    await this.enqueueMembershipMutation(async () => {
      try {
        const firstAttempt = await immediateLeave;
        if (confirmAfterPendingMutation) {
          // The urgent request may race an older join. Once that join has
          // settled, confirm leave again so a late join cannot resurrect the
          // membership or make the room public again.
          try {
            await this.client.leave(id);
          } catch (cause) {
            if (!isAlreadyGoneRoom(cause)) throw cause;
          }
        } else if (!firstAttempt.ok && !isAlreadyGoneRoom(firstAttempt.cause)) {
          throw firstAttempt.cause;
        }
      } finally {
        // A failed/already-completed remote leave must not keep a ghost room in
        // this browser's authoritative-looking local lobby cache.
        this.forgetRoom(id);
      }
    });
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
    return { ...toDetail(room, this.options, this.roomDisplayMetadata.get(room.id)), currentUser: this.options.currentUser };
  }

  private enqueueMembershipMutation<T>(operation: () => Promise<T>): Promise<T> {
    // A route change can issue leave while the waiting room's idempotent join
    // is still hydrating, and the lobby can issue create before that leave has
    // completed. Preserve call order so a late join cannot resurrect a room
    // membership and a new room is never created before the previous leave.
    this.pendingMembershipMutations += 1;
    const result = this.membershipMutation.then(operation, operation);
    const tracked = result.finally(() => {
      this.pendingMembershipMutations = Math.max(0, this.pendingMembershipMutations - 1);
    });
    this.membershipMutation = tracked.then(() => undefined, () => undefined);
    return tracked;
  }

  private forgetRoom(id: number): void {
    this.roomCache.delete(id);
    this.lobbyCache.delete(id);
    this.roomDisplayMetadata.delete(id);
    this.persistDisplayMetadata();
    this.emitRooms();
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
      // The result endpoint resets a completed match to WAITING while both
      // participants are still viewing the result modal. Such a 2/2 room is
      // not joinable and must not reappear in room search before either player
      // explicitly leaves. The same rule also keeps any other full room out of
      // the public finder until a seat actually becomes available.
      .filter((room) => (
        room.gameType === expected
        && room.status === "WAITING"
        && room.participantCount < room.capacity
      ))
      .map((room) => toSummary(room, this.roomDisplayMetadata.get(room.id)));
  }

  private applyLobbySnapshot(rooms: readonly LobbyRoomSummary[]): void {
    this.lobbyCache.clear();
    for (const room of rooms) {
      if (room.status !== "CLOSED") this.lobbyCache.set(room.id, room);
    }
    this.emitRooms();
  }

  private startDisplayMetadataSync(): void {
    if (this.displayMetadataSyncStarted || typeof window === "undefined") return;
    this.displayMetadataSyncStarted = true;
    window.addEventListener("storage", this.handleDisplayMetadataStorage);
    window.addEventListener(ROOM_DISPLAY_METADATA_UPDATED_EVENT, this.handleLocalDisplayMetadataUpdate);
  }

  private stopDisplayMetadataSync(): void {
    if (!this.displayMetadataSyncStarted || typeof window === "undefined") return;
    this.displayMetadataSyncStarted = false;
    window.removeEventListener("storage", this.handleDisplayMetadataStorage);
    window.removeEventListener(ROOM_DISPLAY_METADATA_UPDATED_EVENT, this.handleLocalDisplayMetadataUpdate);
  }

  private readonly handleDisplayMetadataStorage = (event: StorageEvent): void => {
    if (event.key !== this.displayMetadataStorageKey()) return;
    this.reloadDisplayMetadataAndEmit();
  };

  private readonly handleLocalDisplayMetadataUpdate = (event: Event): void => {
    const detail = (event as CustomEvent<{ readonly key?: string }>).detail;
    if (detail?.key !== this.displayMetadataStorageKey()) return;
    this.reloadDisplayMetadataAndEmit();
  };

  private reloadDisplayMetadataAndEmit(): void {
    this.roomDisplayMetadata.clear();
    this.restoreDisplayMetadata();
    this.emitRooms();
  }

  private emitRooms(): void {
    const rooms = this.currentRooms();
    for (const listener of this.listeners) listener(rooms);
  }

  private restoreDisplayMetadata(): void {
    try {
      if (typeof window === "undefined") return;
      const raw = window.localStorage.getItem(this.displayMetadataStorageKey());
      if (!raw) return;
      const entries = JSON.parse(raw) as unknown;
      if (!Array.isArray(entries)) return;
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || !Number.isSafeInteger(entry[0]) || !isRoomDisplayMetadata(entry[1])) continue;
        this.roomDisplayMetadata.set(entry[0], entry[1]);
      }
    } catch {
      // Storage may be unavailable in private browsing; the live room still works.
    }
  }

  private persistDisplayMetadata(): void {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(
        this.displayMetadataStorageKey(),
        JSON.stringify([...this.roomDisplayMetadata.entries()]),
      );
      window.dispatchEvent(new CustomEvent(ROOM_DISPLAY_METADATA_UPDATED_EVENT, {
        detail: { key: this.displayMetadataStorageKey() },
      }));
    } catch {
      // Display metadata persistence is an enhancement, not a gameplay dependency.
    }
  }

  private displayMetadataStorageKey(): string {
    return `${ROOM_DISPLAY_METADATA_KEY_PREFIX}${this.options.gameType ?? "TETRIS_DUEL"}:${this.options.currentUser.userId}`;
  }
}

function isRoomDisplayMetadata(value: unknown): value is RoomDisplayMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.title === "string"
    && typeof record.hostName === "string"
    && typeof record.difficulty === "string"
    && Array.isArray(record.symbolRange)
    && record.symbolRange.every((symbol) => typeof symbol === "string");
}

function isAlreadyGoneRoom(cause: unknown): boolean {
  return cause instanceof Error && /\((?:403|404|410)\)/.test(cause.message);
}

function toSummary(room: LobbyRoomSummary, metadata?: RoomDisplayMetadata): BattleRoomSummary {
  return {
    // The list has no join-by-id API. The card carries the room code as its join key.
    roomId: room.roomCode,
    title: room.title ?? metadata?.title ?? "프링글수 대전방",
    status: room.status === "IN_PROGRESS" ? "PLAYING" : room.participantCount >= room.capacity ? "FULL" : "WAITING",
    playerCount: room.participantCount,
    maxPlayers: room.capacity,
    hostUserId: "",
    hostName: room.hostName ?? metadata?.hostName ?? "프링글수 유저",
    difficulty: room.difficulty ?? metadata?.difficulty ?? "BASIC",
    symbolRange: room.symbolRange ?? metadata?.symbolRange ?? [],
    createdAt: null,
    canJoin: room.status === "WAITING" && room.participantCount < room.capacity,
    roomCode: room.roomCode,
  };
}

function toDetail(room: BackendGameRoom, options: BattleRoomGatewayOptions, metadata?: RoomDisplayMetadata): BattleRoomDetail {
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
    title: metadata?.title ?? "프링글수 대전방",
    status: room.status === "IN_PROGRESS" ? "PLAYING" : room.status === "CLOSED" ? "FINISHED" : full ? "FULL" : "WAITING",
    playerCount: room.participantCount,
    maxPlayers: room.capacity,
    hostUserId: String(room.hostUserId),
    hostName: metadata?.hostName ?? participants[0]?.displayName ?? "프링글수 유저",
    difficulty: metadata?.difficulty ?? "BASIC",
    symbolRange: metadata?.symbolRange ?? [],
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
