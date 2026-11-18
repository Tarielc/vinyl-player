import type { Track } from "@/lib/music/types";
import { createEmitter, loadScript, type PlayerAdapter } from "./types";

const API_URL = "https://www.youtube.com/iframe_api";

let apiReady: Promise<void> | null = null;

function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  apiReady ??= new Promise<void>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    loadScript(API_URL).catch((err) => {
      apiReady = null;
      reject(err);
    });
  });
  return apiReady;
}

const ERRORS: Record<number, string> = {
  2: "Invalid YouTube video id.",
  5: "This video can't be played in the HTML5 player.",
  100: "This video was removed or is private.",
  101: "The owner does not allow this video to be embedded.",
  150: "The owner does not allow this video to be embedded.",
};

/** Errors tied to the video itself; playing a different video may still work. */
const UNPLAYABLE = new Set([2, 100, 101, 150]);

/**
 * Wraps the YouTube IFrame Player API. YouTube's terms require the player to
 * stay visible (≥200×200), so it renders into a container the UI provides.
 */
export function createYouTubeAdapter(getContainer: () => HTMLElement | null): PlayerAdapter {
  const { emit, subscribe } = createEmitter();
  let player: YT.Player | null = null;
  let ready: Promise<YT.Player> | null = null;
  let isReady = false; // player methods only exist after onReady

  const snapshot = (p: YT.Player) => ({
    playing: p.getPlayerState() === 1,
    positionMs: Math.round(p.getCurrentTime() * 1000),
    durationMs: Math.round(p.getDuration() * 1000),
  });

  function init(videoId: string): Promise<YT.Player> {
    ready ??= (async () => {
      await loadApi();
      const container = getContainer();
      if (!container) throw new Error("YouTube player container is not mounted.");
      // YT replaces the target element with an iframe, so give it a child to replace.
      const mount = document.createElement("div");
      container.replaceChildren(mount);
      return new Promise<YT.Player>((resolve) => {
        player = new window.YT!.Player(mount, {
          width: 356,
          height: 200,
          videoId,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: (e) => {
              isReady = true;
              resolve(e.target);
            },
            onStateChange: (e) => {
              if (e.data === 0) emit({ type: "ended" });
              emit({ type: "state", ...snapshot(e.target) });
            },
            onError: (e) =>
              emit({
                type: "error",
                message: ERRORS[e.data] ?? `YouTube error ${e.data}.`,
                unplayable: UNPLAYABLE.has(e.data),
              }),
          },
        });
      });
    })();
    ready.catch(() => {
      ready = null;
    });
    return ready;
  }

  return {
    provider: "youtube",
    async play(track: Track) {
      if (ready) {
        (await ready).loadVideoById(track.id);
      } else {
        // First play: the player is created with this video and autoplays it.
        await init(track.id);
      }
    },
    pause: async () => void (isReady && player?.pauseVideo()),
    resume: async () => void (isReady && player?.playVideo()),
    seek: async (ms) => void (isReady && player?.seekTo(ms / 1000, true)),
    setVolume: async (v) => void (isReady && player?.setVolume(Math.round(v * 100))),
    getSnapshot: async () => (player && isReady ? snapshot(player) : null),
    subscribe,
    destroy() {
      player?.destroy();
      player = null;
      ready = null;
      isReady = false;
    },
  };
}
