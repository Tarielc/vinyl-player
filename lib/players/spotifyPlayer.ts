import type { Track } from "@/lib/music/types";
import { apiFetch } from "@/lib/music/client";
import { createEmitter, loadScript, type PlayerAdapter } from "./types";

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const READY_TIMEOUT_MS = 15_000;

let sdkReady: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  sdkReady ??= new Promise<void>((resolve, reject) => {
    // The SDK calls this global once it has loaded.
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    loadScript(SDK_URL).catch((err) => {
      sdkReady = null;
      reject(err);
    });
  });
  return sdkReady;
}

/**
 * Wraps the Spotify Web Playback SDK: the browser becomes a Spotify Connect
 * device and the server tells Spotify to start the chosen track on it.
 * Requires the signed-in user to have Spotify Premium.
 */
export function createSpotifyAdapter(): PlayerAdapter {
  const { emit, subscribe } = createEmitter();
  let player: Spotify.Player | null = null;
  let device: Promise<string> | null = null;
  let lastPaused = true;

  function connect(): Promise<string> {
    device ??= (async () => {
      await loadSdk();
      const p = new window.Spotify!.Player({
        name: "Vinyl Player (web)",
        volume: 0.8,
        getOAuthToken: (cb) => {
          apiFetch<{ accessToken: string }>("/api/music/spotify/token")
            .then((r) => cb(r.accessToken))
            .catch((err: Error) => emit({ type: "error", message: err.message }));
        },
      });
      player = p;

      p.addListener("player_state_changed", (state) => {
        if (!state) return;
        // The SDK reports the end of a track as paused at position 0.
        if (state.paused && !lastPaused && state.position === 0) emit({ type: "ended" });
        lastPaused = state.paused;
        emit({ type: "state", playing: !state.paused, positionMs: state.position, durationMs: state.duration });
      });
      p.addListener("playback_error", ({ message }) => emit({ type: "error", message }));

      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Spotify player did not become ready.")), READY_TIMEOUT_MS);
        const fail = (message: string) => {
          clearTimeout(timer);
          reject(new Error(message));
        };
        p.addListener("ready", ({ device_id }) => {
          clearTimeout(timer);
          resolve(device_id);
        });
        p.addListener("not_ready", () => {
          device = null; // device went offline; reconnect on next play
        });
        p.addListener("initialization_error", ({ message }) => fail(`Spotify player unsupported: ${message}`));
        p.addListener("authentication_error", () => fail("Spotify session expired. Please reconnect."));
        p.addListener("account_error", () => fail("Spotify Premium is required for playback."));
        p.connect().then((ok) => !ok && fail("Could not connect the Spotify player."));
      });
    })();

    device.catch(() => {
      player?.disconnect();
      player = null;
      device = null;
    });
    return device;
  }

  return {
    provider: "spotify",
    async play(track: Track) {
      // Unlocks audio on browsers with strict autoplay rules; must run in the click handler.
      void player?.activateElement();
      const deviceId = await connect();
      await apiFetch("/api/music/spotify/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, uri: track.uri }),
      });
    },
    pause: async () => void (await player?.pause()),
    resume: async () => void (await player?.resume()),
    seek: async (ms) => void (await player?.seek(ms)),
    setVolume: async (v) => void (await player?.setVolume(v)),
    async getSnapshot() {
      const s = await player?.getCurrentState();
      return s ? { playing: !s.paused, positionMs: s.position, durationMs: s.duration } : null;
    },
    subscribe,
    destroy() {
      player?.disconnect();
      player = null;
      device = null;
    },
  };
}
