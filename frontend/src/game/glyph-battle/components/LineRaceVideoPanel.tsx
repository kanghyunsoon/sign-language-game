import { GameVideoTile } from "../../media/components/GameVideoTile";
import type {
  MediaConnectionState,
  RemoteGameParticipant,
} from "../../media/core/mediaTypes";
export function LineRaceVideoPanel({
  local,
  remote,
  rtc,
  botName,
}: {
  local: MediaStream | null;
  remote: RemoteGameParticipant | null;
  rtc: MediaConnectionState;
  botName?: string;
}) {
  return (
    <section>
      <h2>상대 영상</h2>
      <GameVideoTile
        kind="REMOTE"
        label={botName ?? remote?.displayName ?? "상대방"}
        stream={remote?.stream ?? null}
        cameraEnabled={remote?.cameraEnabled ?? false}
        connectionState={
          botName ? "CONNECTED" : (remote?.connectionState ?? rtc)
        }
      />
      {botName ? <p>연습 봇 · 카메라 없음</p> : null}
    </section>
  );
}
