// Minimal typings for the Spotify Web Playback SDK (https://sdk.scdn.co/spotify-player.js).

declare namespace Spotify {
  interface PlaybackState {
    paused: boolean;
    position: number;
    duration: number;
    track_window: { current_track: { uri: string; id: string | null } };
  }

  interface ErrorPayload {
    message: string;
  }

  interface PlayerInit {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }

  class Player {
    constructor(options: PlayerInit);
    connect(): Promise<boolean>;
    disconnect(): void;
    addListener(event: "ready" | "not_ready", cb: (payload: { device_id: string }) => void): boolean;
    addListener(event: "player_state_changed", cb: (state: PlaybackState | null) => void): boolean;
    addListener(
      event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
      cb: (payload: ErrorPayload) => void,
    ): boolean;
    getCurrentState(): Promise<PlaybackState | null>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    setVolume(volume: number): Promise<void>;
    activateElement(): Promise<void>;
  }
}

interface Window {
  Spotify?: typeof Spotify;
  onSpotifyWebPlaybackSDKReady?: () => void;
}
