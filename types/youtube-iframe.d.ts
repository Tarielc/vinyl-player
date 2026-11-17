// Minimal typings for the YouTube IFrame Player API (https://www.youtube.com/iframe_api).

declare namespace YT {
  // Player states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued.

  interface PlayerEvent {
    target: Player;
  }
  interface OnStateChangeEvent extends PlayerEvent {
    data: number;
  }
  interface OnErrorEvent extends PlayerEvent {
    data: number;
  }

  interface PlayerOptions {
    width?: number | string;
    height?: number | string;
    videoId?: string;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: PlayerEvent) => void;
      onStateChange?: (e: OnStateChangeEvent) => void;
      onError?: (e: OnErrorEvent) => void;
    };
  }

  class Player {
    constructor(element: HTMLElement | string, options: PlayerOptions);
    loadVideoById(videoId: string, startSeconds?: number): void;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    setVolume(volume: number): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    destroy(): void;
  }
}

interface Window {
  YT?: typeof YT;
  onYouTubeIframeAPIReady?: () => void;
}
