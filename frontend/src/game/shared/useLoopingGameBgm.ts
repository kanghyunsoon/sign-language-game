import { useEffect } from "react";

// Tune the common in-game BGM here. Both solo and 1:1 screens use these
// values, so the mix stays consistent when a player moves between modes.
export const GAME_BGM_VOLUME = 0.23;
export const GAME_BGM_PLAYBACK_RATE = 1;

interface LoopingGameBgmOptions {
  readonly enabled: boolean;
  readonly volume?: number;
  readonly playbackRate?: number;
}

/**
 * Plays one looping soundtrack for the lifetime of an active game page.
 * A retry on the next interaction handles browsers that reject navigation
 * initiated autoplay, without leaving audio running after the page ends.
 */
export function useLoopingGameBgm(
  source: string,
  {
    enabled,
    volume = GAME_BGM_VOLUME,
    playbackRate = GAME_BGM_PLAYBACK_RATE,
  }: LoopingGameBgmOptions,
): void {
  useEffect(() => {
    if (!enabled || typeof Audio === "undefined") return undefined;

    const audio = new Audio(source);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.playbackRate = playbackRate;

    const start = () => {
      try {
        const playback = audio.play();
        void playback?.catch(() => {
          // Browsers can require an interaction after route navigation. The
          // one-shot listeners below retry at the next player action.
        });
      } catch {
        // Audio playback can be unavailable in non-browser test environments.
      }
    };
    const retryAfterInteraction = () => start();

    start();
    window.addEventListener("pointerdown", retryAfterInteraction, { capture: true, once: true });
    window.addEventListener("keydown", retryAfterInteraction, { capture: true, once: true });

    return () => {
      window.removeEventListener("pointerdown", retryAfterInteraction, true);
      window.removeEventListener("keydown", retryAfterInteraction, true);
      audio.pause();
      audio.currentTime = 0;
    };
  }, [enabled, playbackRate, source, volume]);
}
