import { Maximize, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import "./WordSignVideo.css";

interface WordSignVideoProps {
  readonly src: string;
  readonly label: string;
  /**
   * 영상을 불러오면 바로 재생한다. 브라우저 자동재생 정책상 소리가 있으면
   * 막히므로 음소거로 시작하고, 사용자가 소리 버튼으로 켤 수 있다.
   */
  readonly autoPlay?: boolean;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function WordSignVideo({ src, label, autoPlay = false }: WordSignVideoProps) {
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [isMuted, setIsMuted] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  /*
   * 영상이 바뀌면 처음부터 다시 재생한다. src만 바뀌고 요소는 재사용되는
   * 경우가 있어 currentTime을 직접 되돌린다.
   * 자동재생이 거부되면 재생 버튼이 그대로 남으므로 별도 처리는 하지 않는다.
   */
  useEffect(() => {
    if (!autoPlay) return;

    const video = videoRef.current;
    if (!video) return;

    video.currentTime = 0;
    setIsEnded(false);
    void video.play().catch(() => {
      // 브라우저가 막으면 사용자가 재생 버튼을 누르면 된다.
    });
  }, [autoPlay, src]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0;
      void video.play();
    } else {
      video.pause();
    }
  };

  const seek = (nextTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    setIsEnded(false);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const openFullscreen = () => {
    void playerRef.current?.requestFullscreen?.();
  };

  return (
    <div className="word-sign-video-player" ref={playerRef}>
      <video
        ref={videoRef}
        src={src}
        playsInline
        muted={isMuted}
        preload={autoPlay ? "auto" : "metadata"}
        aria-label={label}
        onClick={togglePlayback}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => {
          setIsPlaying(true);
          setIsEnded(false);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setIsEnded(true);
        }}
      />

      <div className="word-sign-video-controls">
        <button type="button" onClick={togglePlayback} aria-label={isEnded ? "영상 다시 재생" : isPlaying ? "영상 일시정지" : "영상 재생"}>
          {isEnded ? <RotateCcw aria-hidden="true" /> : isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>

        <span className="word-sign-video-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.01"
          value={Math.min(currentTime, duration || 0)}
          aria-label="영상 재생 위치"
          onChange={(event) => seek(Number(event.currentTarget.value))}
        />

        <button type="button" onClick={toggleMute} aria-label={isMuted ? "영상 소리 켜기" : "영상 음소거"}>
          {isMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </button>

        <button type="button" onClick={openFullscreen} aria-label="영상 전체화면">
          <Maximize aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
