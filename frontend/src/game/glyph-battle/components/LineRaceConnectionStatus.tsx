import type { LineRaceConnectionState } from "../transport";
import type {
  MediaConnectionState,
  RemoteGameParticipant,
} from "../../media/core/mediaTypes";
export function LineRaceConnectionStatus({
  game,
  rtc,
  peer,
  camera,
  ai,
  bot = false,
}: {
  game: LineRaceConnectionState;
  rtc: MediaConnectionState;
  peer: RemoteGameParticipant | null;
  camera: boolean;
  ai: string;
  bot?: boolean;
}) {
  return (
    <section aria-label="연결 상태">
      <strong>연결 상태</strong>
      <span>Game WS {game}</span>
      <span> · RTC {bot ? "미사용" : rtc}</span>
      <span> · Peer {bot ? "BOT" : (peer?.connectionState ?? "없음")}</span>
      <span> · 카메라 {camera ? "켜짐" : "꺼짐"}</span>
      <span> · MediaPipe/AI {ai}</span>
    </section>
  );
}
