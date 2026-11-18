import type { ProviderId, Track } from "@/lib/music/types";

export interface PlaybackSnapshot {
  playing: boolean;
  positionMs: number;
  durationMs: number;
}

export type PlayerEvent =
  | ({ type: "state" } & PlaybackSnapshot)
  | { type: "ended" }
  /** `unplayable`: this track can never play here (removed, embedding blocked); try another. */
  | { type: "error"; message: string; unplayable?: boolean };

/** Client-side contract each provider's playback SDK is wrapped in. */
export interface PlayerAdapter {
  provider: ProviderId;
  /** Must be called from a user gesture where possible (autoplay rules). */
  play(track: Track): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  /** 0..1 */
  setVolume(volume: number): Promise<void>;
  getSnapshot(): Promise<PlaybackSnapshot | null>;
  subscribe(listener: (event: PlayerEvent) => void): () => void;
  destroy(): void;
}

export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

export function createEmitter() {
  const listeners = new Set<(e: PlayerEvent) => void>();
  return {
    emit: (e: PlayerEvent) => listeners.forEach((l) => l(e)),
    subscribe(listener: (e: PlayerEvent) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
