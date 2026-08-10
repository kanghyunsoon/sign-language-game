import { CameraOff, LoaderCircle, WifiOff } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import type { GameMediaPeerConnectionState } from "../core/GameMediaParticipant";
import type { MediaConnectionState } from "../core/mediaTypes";
import styles from "./GameVideoTile.module.css";

export interface GameVideoTileProps {
  readonly kind: "LOCAL" | "REMOTE";
  readonly label: string;
  readonly stream: MediaStream | null;
  readonly cameraEnabled: boolean;
  readonly connectionState: MediaConnectionState | GameMediaPeerConnectionState;
  readonly overlay?: ReactNode;
}

export function GameVideoTile({ kind, label, stream, cameraEnabled, connectionState, overlay }: GameVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [stream]);

  const status = videoStatus(kind, connectionState, cameraEnabled, stream);
  return (
    <section className={styles.tile} aria-label={`${label} 영상`}>
      <video
        ref={videoRef}
        className={`${styles.video} ${kind === "LOCAL" ? styles.mirrored : ""}`}
        autoPlay
        playsInline
        muted={kind === "LOCAL"}
      />
      <span className={styles.label}>{label}</span>
      {kind === "LOCAL" && overlay ? <div className={styles.overlay}>{overlay}</div> : null}
      {status ? (
        <div className={styles.status} role="status">
          {status.icon}
          <span>{status.label}</span>
        </div>
      ) : null}
    </section>
  );
}

function videoStatus(
  kind: "LOCAL" | "REMOTE",
  connectionState: MediaConnectionState | GameMediaPeerConnectionState,
  cameraEnabled: boolean,
  stream: MediaStream | null,
): { readonly label: string; readonly icon: ReactNode } | null {
  if (connectionState === "RECONNECTING" || connectionState === "DISCONNECTED") {
    return { label: "재연결 중", icon: <LoaderCircle aria-hidden="true" size={26} /> };
  }
  if (connectionState === "CONNECTING") {
    return { label: "연결 중", icon: <LoaderCircle aria-hidden="true" size={26} /> };
  }
  if ((connectionState === "FAILED" || connectionState === "CLOSED") && !stream) {
    return { label: "영상 연결 실패", icon: <WifiOff aria-hidden="true" size={26} /> };
  }
  if (!cameraEnabled || !stream) {
    return { label: kind === "LOCAL" ? "카메라 꺼짐" : stream ? "상대 카메라 꺼짐" : "카메라 없음", icon: <CameraOff aria-hidden="true" size={26} /> };
  }
  return null;
}
