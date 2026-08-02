import { afterEach, describe, expect, it, vi } from "vitest";

import { SwaggerBattleRoomGateway } from "./SwaggerBattleRoomGateway";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SwaggerBattleRoomGateway", () => {
  it("creates a TETRIS_DUEL room using the deployed Swagger request body", async () => {
    let requestInit: RequestInit | undefined;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init; return response(room()); });
    const gateway = createGateway(fetcher);
    const created = await gateway.createRoom({ title: "ignored", difficulty: "EASY", symbolRange: ["ㄱ"] });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/game-rooms?userId=1",
      expect.objectContaining({ method: "POST" }),
    );
    expect(requestInit?.body).toBe(JSON.stringify({ gameType: "TETRIS_DUEL" }));
    expect(created.roomId).toBe("10");
    expect(created.roomCode).toBe("ABC123");
  });

  it("preserves the creator's room title, nickname, and symbol range for lobby cards", async () => {
    const gateway = createGateway(vi.fn(async () => response(room())));
    const created = await gateway.createRoom({
      title: "초급 자음방",
      difficulty: "CONSONANTS",
      symbolRange: ["ㄱ", "ㄴ"],
    });
    const state = gateway as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly unknown[];
    };
    state.lobbyCache.set(10, {
      id: 10,
      roomCode: "ABC123",
      status: "WAITING",
      participantCount: 1,
      capacity: 2,
      gameType: "TETRIS_DUEL",
    });

    expect(created).toMatchObject({
      title: "초급 자음방",
      difficulty: "CONSONANTS",
      symbolRange: ["ㄱ", "ㄴ"],
    });
    expect(state.currentRooms()).toEqual([
      expect.objectContaining({
        title: "초급 자음방",
        hostName: created.hostName,
        difficulty: "CONSONANTS",
        symbolRange: ["ㄱ", "ㄴ"],
      }),
    ]);
  });

  it("re-publishes an early lobby room with creator metadata as soon as create completes", async () => {
    let resolveCreate!: (value: Response) => void;
    const gateway = createGateway(vi.fn(() => new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    })));
    const state = gateway as unknown as {
      lobbyCache: Map<number, unknown>;
      listeners: Set<(rooms: readonly { title: string; hostName: string }[]) => void>;
    };
    state.lobbyCache.set(10, {
      id: 10,
      roomCode: "ABC123",
      status: "WAITING",
      participantCount: 1,
      capacity: 2,
      gameType: "TETRIS_DUEL",
    });
    const snapshots: Array<readonly { title: string; hostName: string }[]> = [];
    state.listeners.add((rooms) => {
      snapshots.push(rooms.map(({ title, hostName }) => ({ title, hostName })));
    });

    const creating = gateway.createRoom({
      title: "내가 만든 대전방",
      difficulty: "CONSONANTS",
      symbolRange: ["ㄱ", "ㄴ"],
    });
    await vi.waitFor(() => expect(resolveCreate).toBeTypeOf("function"));
    resolveCreate(response(room()));
    await creating;

    expect(snapshots.at(-1)).toEqual([
      { title: "내가 만든 대전방", hostName: "나" },
    ]);
  });

  it("applies persisted room metadata immediately when another tab updates storage", () => {
    const values = new Map<string, string>();
    const eventListeners = new Map<string, EventListener>();
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    vi.stubGlobal("window", {
      localStorage,
      addEventListener: (type: string, listener: EventListener) => eventListeners.set(type, listener),
      removeEventListener: (type: string) => eventListeners.delete(type),
    });
    const gateway = createGateway(vi.fn());
    const state = gateway as unknown as {
      lobbyCache: Map<number, unknown>;
      listeners: Set<(rooms: readonly { title: string; hostName: string }[]) => void>;
      startDisplayMetadataSync(): void;
      stopDisplayMetadataSync(): void;
    };
    state.lobbyCache.set(10, {
      id: 10,
      roomCode: "ABC123",
      status: "WAITING",
      participantCount: 1,
      capacity: 2,
      gameType: "TETRIS_DUEL",
    });
    const snapshots: Array<readonly { title: string; hostName: string }[]> = [];
    state.listeners.add((rooms) => snapshots.push(rooms));
    state.startDisplayMetadataSync();
    const key = "sudal:battle-room-display:TETRIS_DUEL";
    localStorage.setItem(key, JSON.stringify([[10, {
      title: "저장된 대전방",
      hostName: "수달왕",
      difficulty: "CONSONANTS",
      symbolRange: ["ㄱ", "ㄴ"],
    }]]));

    eventListeners.get("storage")?.({ key } as StorageEvent);

    expect(snapshots.at(-1)).toEqual([
      expect.objectContaining({ title: "저장된 대전방", hostName: "수달왕" }),
    ]);
    state.stopDisplayMetadataSync();
  });

  it("restores the creator's title and nickname after the gateway is recreated", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const creatorGateway = createGateway(vi.fn(async () => response(room())));
    await creatorGateway.createRoom({
      title: "수달왕의 자음방",
      difficulty: "CONSONANTS",
      symbolRange: ["ㄱ", "ㄴ"],
    });

    const restoredGateway = createGateway(vi.fn());
    const state = restoredGateway as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly unknown[];
    };
    state.lobbyCache.set(10, {
      id: 10,
      roomCode: "ABC123",
      status: "WAITING",
      participantCount: 1,
      capacity: 2,
      gameType: "TETRIS_DUEL",
    });

    expect(state.currentRooms()).toEqual([
      expect.objectContaining({
        title: "수달왕의 자음방",
        hostName: "나",
        difficulty: "CONSONANTS",
        symbolRange: ["ㄱ", "ㄴ"],
      }),
    ]);
  });

  it("shares creator metadata with another signed-in tab and replaces explicit lobby placeholders", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      dispatchEvent: vi.fn(),
    });
    const creatorGateway = createGateway(vi.fn(async () => response(room())));
    await creatorGateway.createRoom({
      title: "둘이 하는 자음방",
      difficulty: "CONSONANTS",
      symbolRange: ["ㄱ", "ㄴ"],
    });

    const guestGateway = createGateway(vi.fn(), { userId: "2", displayName: "친구" });
    const guestState = guestGateway as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly unknown[];
    };
    guestState.lobbyCache.set(10, {
      id: 10,
      roomCode: "ABC123",
      status: "WAITING",
      participantCount: 1,
      capacity: 2,
      gameType: "TETRIS_DUEL",
      title: "프링글수 대전방",
      hostName: "프링글수 유저",
    });

    expect(guestState.currentRooms()).toEqual([
      expect.objectContaining({
        title: "둘이 하는 자음방",
        hostName: "나",
        difficulty: "CONSONANTS",
        symbolRange: ["ㄱ", "ㄴ"],
      }),
    ]);
  });

  it("finds creator metadata by room code when an early lobby snapshot uses a different id", async () => {
    const values = new Map<string, string>();
    const localStorage = {
      get length() { return values.size; },
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      key: (index: number) => [...values.keys()][index] ?? null,
    };
    vi.stubGlobal("window", { localStorage, dispatchEvent: vi.fn() });
    const creator = createGateway(vi.fn(async () => response(room())));
    await creator.createRoom({ title: "초대코드 기준 방", difficulty: "CONSONANTS", symbolRange: ["ㄱ", "ㄴ"] });

    const guest = createGateway(vi.fn(), { userId: "2", displayName: "친구" });
    const guestState = guest as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly unknown[];
    };
    guestState.lobbyCache.set(999, {
      id: 999,
      roomCode: "ABC123",
      status: "WAITING",
      participantCount: 1,
      capacity: 2,
      gameType: "TETRIS_DUEL",
    });

    expect(guestState.currentRooms()).toEqual([
      expect.objectContaining({ title: "초대코드 기준 방", hostName: "나" }),
    ]);
  });

  it("pushes creator metadata to an already-open opponent tab without a refresh", async () => {
    const values = new Map<string, string>();
    const localStorage = {
      get length() { return values.size; },
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      key: (index: number) => [...values.keys()][index] ?? null,
    };
    vi.stubGlobal("window", {
      localStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const peers = new Map<string, Set<FakeBroadcastChannel>>();
    class FakeBroadcastChannel {
      readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
      constructor(readonly name: string) {
        const members = peers.get(name) ?? new Set<FakeBroadcastChannel>();
        members.add(this);
        peers.set(name, members);
      }
      addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void): void { this.listeners.add(listener); }
      removeEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void): void { this.listeners.delete(listener); }
      postMessage(data: unknown): void {
        for (const peer of peers.get(this.name) ?? []) {
          if (peer !== this) for (const listener of peer.listeners) listener({ data } as MessageEvent<unknown>);
        }
      }
      close(): void { peers.get(this.name)?.delete(this); }
    }
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);

    const guest = createGateway(vi.fn(), { userId: "2", displayName: "guest" });
    const guestState = guest as unknown as {
      lobbyCache: Map<number, unknown>;
    };
    guestState.lobbyCache.set(10, {
      id: 10, roomCode: "ABC123", status: "WAITING",
      participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL",
      title: "프링글수 대전방", hostName: "프링글수 유저",
    });
    const snapshots: Array<readonly { title: string; hostName: string }[]> = [];
    const unsubscribe = guest.subscribeRooms((rooms) => snapshots.push(rooms));

    const creator = createGateway(vi.fn(async () => response(room())), { userId: "1", displayName: "방장닉네임" });
    await creator.createRoom({ title: "직접 입력한 방 제목", difficulty: "CONSONANTS", symbolRange: ["ㄱ"] });

    expect(snapshots.at(-1)).toEqual([
      expect.objectContaining({ title: "직접 입력한 방 제목", hostName: "방장닉네임" }),
    ]);
    unsubscribe();
  });

  it("does not reuse stale metadata when a destroyed room id gets a new invitation code", () => {
    const values = new Map<string, string>([[
      "sudal:battle-room-display:TETRIS_DUEL",
      JSON.stringify([[10, {
        title: "예전 방", hostName: "예전 방장", difficulty: "CONSONANTS",
        symbolRange: ["ㄱ"], roomCode: "OLD123",
      }]]),
    ]]);
    vi.stubGlobal("window", {
      localStorage: {
        get length() { return values.size; },
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        key: (index: number) => [...values.keys()][index] ?? null,
      },
    });
    const gateway = createGateway(vi.fn());
    const state = gateway as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly { title: string; hostName: string }[];
    };
    state.lobbyCache.set(10, {
      id: 10, roomCode: "NEW456", status: "WAITING",
      participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL",
    });

    expect(state.currentRooms()[0]).not.toMatchObject({ title: "예전 방", hostName: "예전 방장" });
  });

  it("publishes a newly created room immediately with the submitted title and signed-in nickname", async () => {
    const gateway = createGateway(vi.fn(async () => response(room())));
    const state = gateway as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly { title: string; hostName: string }[];
    };
    await gateway.createRoom({
      title: "Creator room title",
      difficulty: "CONSONANTS",
      symbolRange: ["ㄱ"],
    });

    expect(state.currentRooms()).toEqual([
      expect.objectContaining({
        title: "Creator room title",
        hostName: "나",
        roomCode: "ABC123",
      }),
    ]);
  });

  it("merges stale gateway metadata instead of erasing another room", async () => {
    const values = new Map<string, string>();
    const localStorage = {
      get length() { return values.size; },
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      key: (index: number) => [...values.keys()][index] ?? null,
    };
    vi.stubGlobal("window", { localStorage, dispatchEvent: vi.fn() });
    const first = createGateway(vi.fn(async () => response(room())));
    const staleSecond = createGateway(
      vi.fn(async () => response(room({ id: 11, roomCode: "DEF456", hostUserId: 2 }))),
      { userId: "2", displayName: "두번째 방장" },
    );

    await first.createRoom({ title: "첫 번째 방", difficulty: "CONSONANTS", symbolRange: ["ㄱ"] });
    await staleSecond.createRoom({ title: "두 번째 방", difficulty: "VOWELS", symbolRange: ["ㅏ"] });

    const restored = createGateway(vi.fn(), { userId: "3", displayName: "참가자" });
    const restoredState = restored as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly { title: string; hostName: string }[];
    };
    restoredState.lobbyCache.set(10, { id: 10, roomCode: "ABC123", status: "WAITING", participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL" });
    restoredState.lobbyCache.set(11, { id: 11, roomCode: "DEF456", status: "WAITING", participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL" });

    expect(restoredState.currentRooms()).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "첫 번째 방", hostName: "나" }),
      expect.objectContaining({ title: "두 번째 방", hostName: "두번째 방장" }),
    ]));
  });

  it("migrates room metadata saved by another user under the former scoped key", () => {
    const values = new Map<string, string>([["sudal:battle-room-display:TETRIS_DUEL:1", JSON.stringify([[10, {
      title: "기존 모음방",
      hostName: "수달왕",
      difficulty: "VOWELS",
      symbolRange: ["ㅏ", "ㅓ"],
    }]])]]);
    const localStorage = {
      get length() { return values.size; },
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      key: (index: number) => [...values.keys()][index] ?? null,
    };
    vi.stubGlobal("window", { localStorage });

    const guestGateway = createGateway(vi.fn(), { userId: "2", displayName: "친구" });
    const guestState = guestGateway as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly unknown[];
    };
    guestState.lobbyCache.set(10, {
      id: 10,
      roomCode: "ABC123",
      status: "WAITING",
      participantCount: 1,
      capacity: 2,
      gameType: "TETRIS_DUEL",
      title: "프링글수 대전방",
      hostName: "프링글수 유저",
    });

    expect(guestState.currentRooms()).toEqual([
      expect.objectContaining({ title: "기존 모음방", hostName: "수달왕" }),
    ]);
  });

  it("joins with the Swagger roomCode body", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(room({ guestUserId: 2, participantCount: 2 })));
    const gateway = createGateway(fetcher);
    await gateway.joinRoom(" ABC123 ");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/game-rooms/join?userId=1",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ roomCode: "ABC123" }) }),
    );
  });

  it("shows only rooms for the gateway's documented game type", async () => {
    const gateway = createGateway(vi.fn());
    const currentRooms = (gateway as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly unknown[];
    });
    currentRooms.lobbyCache.set(1, {
      id: 1, roomCode: "BLOCK1", status: "WAITING",
      participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL",
      title: "Custom block room", hostName: "owner-one",
    });
    currentRooms.lobbyCache.set(2, {
      id: 2, roomCode: "SIGN01", status: "WAITING",
      participantCount: 1, capacity: 2, gameType: "SIGN_DUEL",
      title: "Custom sign room", hostName: "owner-two",
    });

    expect(currentRooms.currentRooms()).toEqual([
      expect.objectContaining({ roomCode: "BLOCK1" }),
    ]);
  });

  it("removes rooms omitted from a complete lobby update", () => {
    const gateway = createGateway(vi.fn());
    const lobbyState = gateway as unknown as {
      lobbyCache: Map<number, unknown>;
      applyLobbySnapshot(rooms: readonly unknown[]): void;
    };
    lobbyState.lobbyCache.set(1, {
      id: 1, roomCode: "CLOSED", status: "WAITING",
      participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL",
    });
    lobbyState.applyLobbySnapshot([{
      id: 2, roomCode: "ACTIVE", status: "WAITING",
      participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL",
    }]);

    expect([...lobbyState.lobbyCache.keys()]).toEqual([2]);
  });

  it("does not hide an authoritative join conflict behind stale cache", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(room({ guestUserId: 2, participantCount: 2 })))
      .mockResolvedValueOnce(response(null, 409));
    const gateway = createGateway(fetcher);

    await gateway.joinRoom("ABC123");

    await expect(gateway.joinRoom("ABC123")).rejects.toThrow("Game room request failed (409).");
  });

  it("sends leave immediately while a room hydration join is still pending", async () => {
    let resolveJoin!: (value: Response) => void;
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/join")) {
        return new Promise<Response>((resolve) => { resolveJoin = resolve; });
      }
      if (url.includes("/leave")) return Promise.resolve(response(undefined, 204));
      return Promise.resolve(response(room()));
    });
    const gateway = createGateway(fetcher);
    const joining = gateway.joinRoom("ABC123");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    const leaving = gateway.leaveRoom("10");

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("/game-rooms/10/leave");
    resolveJoin(response(room()));
    await joining;
    await leaving;
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes("/leave"))).toHaveLength(2);
  });

  it("removes a leaving room from the local lobby before the server responds", async () => {
    let resolveLeave!: (value: Response) => void;
    const fetcher = vi.fn((input: RequestInfo | URL) => String(input).includes("/leave")
      ? new Promise<Response>((resolve) => { resolveLeave = resolve; })
      : Promise.resolve(response(room())));
    const gateway = createGateway(fetcher);
    const state = gateway as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly unknown[];
    };
    state.lobbyCache.set(10, {
      id: 10, roomCode: "ABC123", status: "WAITING",
      participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL",
    });

    const leaving = gateway.leaveRoom("10");

    expect(state.currentRooms()).toEqual([]);
    resolveLeave(response(undefined, 204));
    await leaving;
  });

  it("keeps shared room display metadata when a participant leaves", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/leave")
      ? response(undefined, 204)
      : response(room()));
    const gateway = createGateway(fetcher);
    const created = await gateway.createRoom({
      title: "남아 있는 대전방",
      difficulty: "CONSONANTS",
      symbolRange: ["ㄱ", "ㄴ"],
    });

    await gateway.leaveRoom("10");

    const state = gateway as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly { title: string; hostName: string }[];
    };
    state.lobbyCache.set(10, {
      id: 10,
      roomCode: "ABC123",
      status: "WAITING",
      participantCount: 1,
      capacity: 2,
      gameType: "TETRIS_DUEL",
    });
    expect(state.currentRooms()).toEqual([
      expect.objectContaining({ title: "남아 있는 대전방", hostName: created.hostName }),
    ]);
  });

  it("updates the shared host nickname after ownership changes", async () => {
    const gateway = createGateway(vi.fn(async () => response(room())));
    await gateway.createRoom({
      title: "이어지는 대전방",
      difficulty: "CONSONANTS",
      symbolRange: ["ㄱ", "ㄴ"],
    });
    gateway.updateRoomDisplayMetadata("10", {
      title: "이어지는 대전방",
      hostName: "새 방장",
      difficulty: "CONSONANTS",
      symbolRange: ["ㄱ", "ㄴ"],
    });

    const state = gateway as unknown as {
      lobbyCache: Map<number, unknown>;
      currentRooms(): readonly { title: string; hostName: string }[];
    };
    state.lobbyCache.set(10, {
      id: 10,
      roomCode: "ABC123",
      status: "WAITING",
      participantCount: 1,
      capacity: 2,
      gameType: "TETRIS_DUEL",
    });
    expect(state.currentRooms()).toEqual([
      expect.objectContaining({ title: "이어지는 대전방", hostName: "새 방장" }),
    ]);
  });

  it("maps ready state and uses role-based room data", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(room({
      guestUserId: 2,
      participantCount: 2,
      hostReady: true,
      guestReady: true,
    })));
    const gateway = createGateway(fetcher);
    const ready = await gateway.setReady("10", true);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/game-rooms/10/ready?userId=1",
      expect.objectContaining({ body: JSON.stringify({ isReady: true }) }),
    );
    expect(ready.canStart).toBe(true);
    expect(ready.currentUserReady).toBe(true);
  });

  it("never calls a non-existent room detail endpoint", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(room()));
    const gateway = createGateway(fetcher);
    await expect(gateway.getRoom("10")).rejects.toThrow("상세 정보");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("mirrors the documented post-result WAITING state for a rematch", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(room({
      guestUserId: 2,
      participantCount: 2,
      hostReady: true,
      guestReady: true,
      status: "IN_PROGRESS",
    })));
    const gateway = createGateway(fetcher);
    await gateway.startGame("10");

    await gateway.returnToWaiting("10");

    await expect(gateway.getRoom("10")).resolves.toMatchObject({
      status: "FULL",
      hostReady: false,
      guestReady: false,
      activeMatchId: null,
      canStart: false,
    });
  });
});

function createGateway(fetcher: ReturnType<typeof vi.fn>, currentUser = { userId: "1", displayName: "나" }) {
  return new SwaggerBattleRoomGateway({
    baseUrl: "/api",
    currentUser,
    headers: { Authorization: "Bearer token" },
    fetch: fetcher as unknown as typeof globalThis.fetch,
  });
}

function room(overrides: Partial<{
  id: number;
  roomCode: string;
  hostUserId: number;
  guestUserId: number | null;
  participantCount: number;
  hostReady: boolean;
  guestReady: boolean;
  status: "WAITING" | "IN_PROGRESS";
}> = {}) {
  return {
    id: 10,
    roomCode: "ABC123",
    hostUserId: 1,
    guestUserId: null,
    hostReady: false,
    guestReady: false,
    status: "WAITING",
    participantCount: 1,
    capacity: 2,
    gameType: "TETRIS_DUEL",
    ...overrides,
  };
}

function response(value: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}
