import type { RemoteGameMediaParticipant } from "../core/GameMediaParticipant";
import type { GameMediaSessionState } from "../core/GameMediaSession";

export interface GameMediaDevControlPanelProps {
  readonly connected: boolean;
  readonly cameraEnabled: boolean;
  readonly sessionState: GameMediaSessionState;
  readonly participants: readonly RemoteGameMediaParticipant[];
  readonly onToggleCamera: () => void;
  readonly onDisconnect: () => void;
  readonly onClosePeer: (userId: string) => void;
  readonly onReconnectPeer: (userId: string) => void;
}

export function GameMediaDevControlPanel(props: GameMediaDevControlPanelProps) {
  return (
    <section>
      <h2>Media controls</h2>
      <p>Session: <strong>{props.sessionState}</strong> · Peers: <strong>{props.participants.length}</strong></p>
      <button type="button" disabled={!props.connected} onClick={props.onToggleCamera}>Camera {props.cameraEnabled ? "OFF" : "ON"}</button>{" "}
      <button type="button" disabled={!props.connected} onClick={props.onDisconnect}>Disconnect all</button>
      <ul>
        {props.participants.map((participant) => (
          <li key={participant.userId}>
            {participant.displayName} ({participant.userId}) — {participant.connectionState}{" "}
            <button type="button" onClick={() => props.onClosePeer(participant.userId)}>Force close</button>{" "}
            <button type="button" onClick={() => props.onReconnectPeer(participant.userId)}>Reconnect</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
