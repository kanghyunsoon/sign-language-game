import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import { GameVideoTile } from "../../media/components/GameVideoTile";
import type { RemoteGameParticipant } from "../../media/core/mediaTypes";
import { HandCamera } from "../../recognition/mediapipe/HandCamera";
import styles from "../../shared/GameModule.module.css";

export function BattleGamePage() {
  const { roomId } = useParams();
  const { battleMediaSession, sharedCameraSession } = useGameModuleContext();
  const [participants, setParticipants] = useState<readonly RemoteGameParticipant[]>(
    () => battleMediaSession.getRemoteParticipants(),
  );
  const [connectionState, setConnectionState] = useState(() => battleMediaSession.getConnectionState());
  const refresh = useCallback(() => {
    setParticipants(battleMediaSession.getRemoteParticipants());
    setConnectionState(battleMediaSession.getConnectionState());
  }, [battleMediaSession]);

  useEffect(() => battleMediaSession.subscribe(refresh), [battleMediaSession, refresh]);

  const localStream = sharedCameraSession.getStream();
  const opponent = participants[0] ?? null;
  return (
    <main className={styles.battleMediaPage}>
      <header className={styles.battleMediaHeader}>
        <div><span>1:1 대전 게임</span><h1>방 {roomId ?? "-"}</h1></div>
        <span>RTC {connectionState}</span>
      </header>

      <section className={styles.battleGameGrid} aria-label="1:1 대전 영상">
        <div className={styles.localRecognitionVideo}>
          {localStream ? (
            <HandCamera sharedStream={localStream} autoStart />
          ) : (
            <GameVideoTile
              kind="LOCAL"
              label="내 영상"
              stream={null}
              cameraEnabled={false}
              connectionState="DISCONNECTED"
            />
          )}
        </div>
        <GameVideoTile
          kind="REMOTE"
          label={opponent?.displayName ?? "상대 영상"}
          stream={opponent?.stream ?? null}
          cameraEnabled={opponent?.cameraEnabled ?? false}
          connectionState={opponent?.connectionState ?? connectionState}
        />
      </section>

      {participants.length > 1 ? <p className={styles.mediaNotice}>현재 1:1 화면은 첫 번째 상대 영상만 표시합니다.</p> : null}
      {!localStream ? <p className={styles.mediaError}>대기실에서 카메라와 RTC를 먼저 연결하세요.</p> : null}
      <div className={styles.mediaActions}><Link to="..">대기실로 돌아가기</Link></div>
    </main>
  );
}
