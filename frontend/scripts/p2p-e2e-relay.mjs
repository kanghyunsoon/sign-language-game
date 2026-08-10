import http from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.env.P2P_E2E_PORT ?? 8091);
let nextRoomId = 1;
let nextTicketId = 1;
const rooms = new Map();
const tickets = new Map();
const lobbyStreams = new Set();
const roomSockets = new Map();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  try {
    if (req.method === "POST" && url.pathname === "/api/auth/sse-ticket") {
      const userId = requiredUserId(url);
      const ticket = issueTicket(userId);
      return json(res, 201, { ticket, expiresInSeconds: 60 });
    }
    if (req.method === "GET" && url.pathname === "/api/game-rooms/subscribe") {
      consumeTicket(url.searchParams.get("ticket"));
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(`event: snapshot\ndata: ${JSON.stringify({ rooms: lobbyRooms() })}\n\n`);
      lobbyStreams.add(res);
      req.on("close", () => lobbyStreams.delete(res));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/webrtc/ice-servers") {
      return json(res, 200, { iceServers: [] });
    }
    if (req.method === "POST" && url.pathname === "/api/game-rooms") {
      const userId = numericUserId(url);
      const body = await readJson(req);
      const gameType = body.gameType;
      if (gameType !== "TETRIS_DUEL" && gameType !== "SIGN_DUEL") return json(res, 400, { message: "gameType is required" });
      const id = nextRoomId++;
      const room = {
        id,
        roomCode: String(100000 + id),
        hostUserId: userId,
        guestUserId: null,
        hostReady: false,
        guestReady: false,
        status: "WAITING",
        participantCount: 1,
        capacity: 2,
        gameType,
      };
      rooms.set(id, room);
      broadcastLobby();
      return json(res, 201, { ...room, realtimeTicket: issueTicket(String(userId)) });
    }
    if (req.method === "POST" && url.pathname === "/api/game-rooms/join") {
      const userId = numericUserId(url);
      const { roomCode } = await readJson(req);
      const room = [...rooms.values()].find((item) => item.roomCode === String(roomCode));
      if (!room) return json(res, 404, { message: "room not found" });
      if (room.hostUserId === userId || room.guestUserId === userId) {
        return json(res, 200, { ...room, realtimeTicket: issueTicket(String(userId)) });
      }
      if (room.status !== "WAITING" || (room.guestUserId !== null && room.guestUserId !== userId)) return json(res, 409, { message: "room is full" });
      room.guestUserId = userId;
      room.participantCount = 2;
      broadcastLobby();
      return json(res, 200, { ...room, realtimeTicket: issueTicket(String(userId)) });
    }
    const match = url.pathname.match(/^\/api\/game-rooms\/(\d+)\/(ready|start|leave|results)$/);
    if (req.method === "POST" && match) {
      const room = rooms.get(Number(match[1]));
      const userId = numericUserId(url);
      if (!room) return json(res, 404, { message: "room not found" });
      if (match[2] === "ready") {
        const { isReady } = await readJson(req);
        if (userId === room.hostUserId) room.hostReady = Boolean(isReady);
        else if (userId === room.guestUserId) room.guestReady = Boolean(isReady);
        else return json(res, 403, { message: "not a participant" });
        broadcastRoom(room.id, { type: "PEER_READY_CHANGED", payload: { userId, isReady: Boolean(isReady) } });
        broadcastLobby();
        return json(res, 200, room);
      }
      if (match[2] === "start") {
        if (userId !== room.hostUserId) return json(res, 403, { message: "host only" });
        if (room.participantCount !== 2 || !room.hostReady || !room.guestReady) return json(res, 409, { message: "both players must be ready" });
        room.status = "IN_PROGRESS";
        broadcastRoom(room.id, { type: "GAME_STARTED", payload: { roomId: room.id } });
        broadcastLobby();
        return json(res, 200, room);
      }
      if (match[2] === "leave") {
        rooms.delete(room.id);
        broadcastLobby();
        res.writeHead(204);
        return res.end();
      }
      if (room.status !== "IN_PROGRESS") return json(res, 409, { message: "room is not in progress" });
      if (userId !== room.hostUserId && userId !== room.guestUserId) return json(res, 403, { message: "not a participant" });
      const { winnerUserId: rawWinnerUserId } = await readJson(req);
      const winnerUserId = rawWinnerUserId === null ? null : Number(rawWinnerUserId);
      if (winnerUserId !== null && winnerUserId !== room.hostUserId && winnerUserId !== room.guestUserId) {
        return json(res, 400, { message: "winnerUserId must be a room participant" });
      }
      room.status = "WAITING";
      room.hostReady = false;
      room.guestReady = false;
      broadcastLobby();
      return json(res, 201, { winnerUserId });
    }
    return json(res, 404, { message: "not found" });
  } catch (error) {
    return json(res, 400, { message: error instanceof Error ? error.message : String(error) });
  }
});

const websocketServer = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const match = url.pathname.match(/^\/api\/ws\/game-rooms\/(\d+)$/);
  if (!match) return socket.destroy();
  try {
    const userId = consumeTicket(url.searchParams.get("ticket"));
    const roomId = Number(match[1]);
    const room = rooms.get(roomId);
    if (!room || (room.hostUserId !== Number(userId) && room.guestUserId !== Number(userId))) throw new Error("not a room participant");
    websocketServer.handleUpgrade(req, socket, head, (ws) => websocketServer.emit("connection", ws, { roomId, userId }));
  } catch {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
  }
});

websocketServer.on("connection", (ws, context) => {
  const peers = roomSockets.get(context.roomId) ?? new Set();
  peers.add(ws);
  roomSockets.set(context.roomId, peers);
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type !== "SIGNAL" || !message.payload) return;
      for (const peer of peers) if (peer !== ws && peer.readyState === peer.OPEN) peer.send(JSON.stringify(message));
    } catch {}
  });
  ws.on("close", () => {
    peers.delete(ws);
    if (peers.size === 0) roomSockets.delete(context.roomId);
  });
});

server.listen(port, "127.0.0.1", () => console.log(`[p2p-e2e-relay] http://127.0.0.1:${port}`));

function requiredUserId(url) {
  const value = url.searchParams.get("userId");
  if (!value) throw new Error("userId is required");
  return value;
}
function numericUserId(url) {
  const value = Number(requiredUserId(url));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("numeric userId is required");
  return value;
}
function issueTicket(userId) {
  const ticket = `e2e-${nextTicketId++}-${userId}`;
  tickets.set(ticket, String(userId));
  return ticket;
}
function consumeTicket(ticket) {
  if (!ticket || !tickets.has(ticket)) throw new Error("invalid ticket");
  const userId = tickets.get(ticket);
  tickets.delete(ticket);
  return userId;
}
function lobbyRooms() {
  return [...rooms.values()].filter((room) => room.status !== "CLOSED").map(({ id, roomCode, status, participantCount, capacity, gameType }) => ({ id, roomCode, status, participantCount, capacity, gameType }));
}
function broadcastLobby() {
  const payload = `event: update\ndata: ${JSON.stringify({ rooms: lobbyRooms() })}\n\n`;
  for (const response of lobbyStreams) response.write(payload);
}
function broadcastRoom(roomId, message) {
  for (const socket of roomSockets.get(roomId) ?? []) if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}
function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}
async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}
