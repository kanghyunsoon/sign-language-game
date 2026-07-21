import { Stomp } from "@stomp/stompjs";
import { useEffect, useRef, useState } from "react";

import { createDevAuthHeaders } from "../../app/devAuthHeaders";
import { useGameModuleContext } from "../../app/GameModuleContext";
import { GameVideoTile } from "../components/GameVideoTile";
import type { GameMediaEvent } from "../core/GameMediaEvent";
import type { RemoteGameMediaParticipant } from "../core/GameMediaParticipant";
import type { GameMediaSessionState } from "../core/GameMediaSession";
import { MeshWebRtcMediaSession } from "../mesh/MeshWebRtcMediaSession";
import { requestWebRtcClientConfig } from "../mesh/webRtcConfig";
import { MockMediaStreamFactory } from "../mock/MockMediaStreamFactory";
import type { ClientRtcSignalingMessage, ServerRtcSignalingMessage } from "../signaling/WebRtcSignalingMessages";
import type { WebRtcSignalingTransport } from "../signaling/WebRtcSignalingTransport";
import { WebSocketWebRtcSignalingTransport, type SignalingStompClient } from "../signaling/WebSocketWebRtcSignalingTransport";
import { GameMediaDevControlPanel } from "./GameMediaDevControlPanel";

export function GameMediaDevHarnessPage() {
  const context = useGameModuleContext();
  const [userId, setUserId] = useState(context.user.userId);
  const [displayName, setDisplayName] = useState(context.user.displayName);
  const [roomId, setRoomId] = useState("");
  const [useMock, setUseMock] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [state, setState] = useState<GameMediaSessionState>("IDLE");
  const [participants, setParticipants] = useState<readonly RemoteGameMediaParticipant[]>([]);
  const [logs, setLogs] = useState<readonly string[]>([]);
  const sessionRef = useRef<MeshWebRtcMediaSession | null>(null);
  const mockFactoryRef = useRef(new MockMediaStreamFactory());
  const mockStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => { void cleanup(); }, []);

  const appendLog = (line: string) => setLogs((current) => [...current.slice(-99), `${new Date().toLocaleTimeString()} ${line}`]);
  const refresh = (session: MeshWebRtcMediaSession) => {
    setState(session.getConnectionState());
    setParticipants(session.getRemoteParticipants());
  };
  const handleEvent = (session: MeshWebRtcMediaSession, event: GameMediaEvent) => {
    appendLog(`EVENT ${event.type}`);
    refresh(session);
  };

  async function connect() {
    if (!roomId.trim() || !userId.trim()) { appendLog("Room ID and user ID are required."); return; }
    await cleanup();
    try {
      const headers = context.accessToken ? { Authorization: `Bearer ${context.accessToken}` } : createDevAuthHeaders({ userId, displayName });
      const config = await requestWebRtcClientConfig(context.config.rtcConfigApiBaseUrl ?? "/api/rtc/config", { headers });
      const stream = useMock ? mockFactoryRef.current.create(`${displayName} · ${userId}`) : await context.sharedCameraSession.start();
      if (useMock) mockStreamRef.current = stream;
      const baseTransport = new WebSocketWebRtcSignalingTransport({
        url: context.config.gameWebSocketUrl,
        localUserId: userId,
        headers,
        createClient: (url) => Stomp.client(url) as SignalingStompClient,
      });
      const transport = loggingTransport(baseTransport, appendLog);
      const session = new MeshWebRtcMediaSession();
      sessionRef.current = session;
      session.subscribe((event) => handleEvent(session, event));
      await session.connect({
        roomId, localUserId: userId, localDisplayName: displayName, localStream: stream,
        participants: [{ userId, displayName, cameraEnabled: true }], signalingTransport: transport, iceServers: config.iceServers,
      });
      refresh(session);
      appendLog("Mesh session connected to signaling.");
    } catch (cause) {
      appendLog(`ERROR ${cause instanceof Error ? cause.message : String(cause)}`);
      await cleanup();
    }
  }

  async function cleanup() {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) await session.disconnect();
    if (mockStreamRef.current) mockFactoryRef.current.stop(mockStreamRef.current);
    mockStreamRef.current = null;
    context.sharedCameraSession.stop();
    setParticipants([]);
    setState("CLOSED");
  }

  return (
    <main data-testid="game-media-dev-harness">
      <h1>Mesh WebRTC Media Dev Harness</h1>
      <section>
        <label>User ID <input value={userId} onChange={(event) => setUserId(event.target.value)} /></label>{" "}
        <label>Name <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>{" "}
        <label>Room ID <input value={roomId} onChange={(event) => setRoomId(event.target.value)} /></label>{" "}
        <label><input type="checkbox" checked={useMock} onChange={(event) => setUseMock(event.target.checked)} /> Mock stream</label>{" "}
        <button type="button" onClick={() => void connect()}>Connect</button>
      </section>
      <GameMediaDevControlPanel
        connected={sessionRef.current !== null} cameraEnabled={cameraEnabled} sessionState={state} participants={participants}
        onToggleCamera={() => {
          const enabled = !cameraEnabled;
          setCameraEnabled(enabled);
          void sessionRef.current?.setCameraEnabled(enabled);
        }}
        onDisconnect={() => void cleanup()}
        onClosePeer={(peerId) => { sessionRef.current?.closePeer(peerId); if (sessionRef.current) refresh(sessionRef.current); }}
        onReconnectPeer={(peerId) => void sessionRef.current?.reconnectPeer(peerId).then(() => { if (sessionRef.current) refresh(sessionRef.current); })}
      />
      <section>
        <h2>Video tiles</h2>
        <GameVideoTile kind="LOCAL" label={`${displayName} (local)`} stream={sessionRef.current?.getLocalStream() ?? null} cameraEnabled={cameraEnabled} connectionState={state === "CONNECTED" ? "CONNECTED" : "CONNECTING"} />
        {participants.map((participant) => <GameVideoTile key={participant.userId} kind="REMOTE" label={participant.displayName} stream={participant.stream} cameraEnabled={participant.cameraEnabled} connectionState={participant.connectionState} />)}
      </section>
      <section><h2>Signaling log</h2><pre aria-label="Signaling log">{logs.join("\n")}</pre></section>
    </main>
  );
}

function loggingTransport(transport: WebRtcSignalingTransport, log: (line: string) => void): WebRtcSignalingTransport {
  return {
    connect: () => transport.connect(),
    disconnect: () => transport.disconnect(),
    send: (message: ClientRtcSignalingMessage) => { log(`SEND ${message.type} ${message.targetUserId ?? "room"}`); transport.send(message); },
    subscribe: (listener: (message: ServerRtcSignalingMessage) => void) => transport.subscribe((message) => { log(`RECV ${message.type} ${message.senderUserId}`); listener(message); }),
  };
}
