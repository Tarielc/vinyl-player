"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ProviderId, Track } from "@/lib/music/types";
import { createSpotifyAdapter } from "./spotify-player";
import { createYouTubeAdapter } from "./youtube-player";
import type { PlaybackSnapshot, PlayerAdapter } from "./types";

export type PlayerStatus = "idle" | "loading" | "ready";

export interface SkippedTrack {
  track: Track;
  reason: string;
}

/** Stop auto-skipping after this many unplayable tracks in a row. */
const MAX_AUTO_SKIPS = 5;

const sameTrack = (a: Track, b: Track) => a.provider === b.provider && a.id === b.id;

const EMPTY: PlaybackSnapshot = { playing: false, positionMs: 0, durationMs: 0 };

/**
 * One player for all providers: lazily creates each provider's adapter,
 * keeps exactly one active, and exposes unified playback state.
 */
export function usePlayer(youtubeContainer: RefObject<HTMLElement | null>) {
  const adapters = useRef<Partial<Record<ProviderId, PlayerAdapter>>>({});
  const active = useRef<PlayerAdapter | null>(null);
  const volumeRef = useRef(0.8);
  // The list the current track was picked from; unplayable tracks skip to the next one.
  const queueRef = useRef<Track[]>([]);
  const currentRef = useRef<Track | null>(null);
  const autoSkipsRef = useRef(0);
  const onUnplayableRef = useRef<(message: string) => void>(() => {});
  const onEndedRef = useRef<() => void>(() => {});

  const [current, setCurrent] = useState<Track | null>(null);
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(EMPTY);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(0.8);
  const [skipped, setSkipped] = useState<SkippedTrack[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);

  const getAdapter = useCallback(
    (id: ProviderId): PlayerAdapter => {
      const existing = adapters.current[id];
      if (existing) return existing;
      const adapter =
        id === "spotify" ? createSpotifyAdapter() : createYouTubeAdapter(() => youtubeContainer.current);
      adapter.subscribe((e) => {
        if (active.current !== adapter) return; // ignore events from inactive providers
        if (e.type === "state") {
          setSnapshot({ playing: e.playing, positionMs: e.positionMs, durationMs: e.durationMs });
        } else if (e.type === "ended") {
          setSnapshot((s) => ({ ...s, playing: false }));
          onEndedRef.current();
        } else if (e.unplayable) {
          onUnplayableRef.current(e.message);
        } else {
          setError(e.message);
        }
      });
      adapters.current[id] = adapter;
      return adapter;
    },
    [youtubeContainer],
  );

  const start = useCallback(
    async (track: Track) => {
      const next = getAdapter(track.provider);
      const prev = active.current;
      active.current = next;
      // Start `next.play` before any await so it still runs inside the click gesture.
      const started = next.play(track);
      if (prev && prev !== next) prev.pause().catch(() => {});

      setError(null);
      currentRef.current = track;
      setCurrent(track);
      setStatus("loading");
      setSnapshot({ ...EMPTY, durationMs: track.durationMs ?? 0 });
      try {
        await started;
        await next.setVolume(volumeRef.current).catch(() => {});
        if (active.current === next) setStatus("ready");
      } catch (err) {
        if (active.current !== next) return;
        setError(err instanceof Error ? err.message : "Playback failed.");
        setStatus("idle");
      }
    },
    [getAdapter],
  );

  /** Play `track`; `queue` is the list it came from, used to skip unplayable tracks. */
  const play = useCallback(
    (track: Track, list: Track[] = [track]) => {
      queueRef.current = list;
      setQueue(list);
      autoSkipsRef.current = 0;
      setSkipped([]);
      return start(track);
    },
    [start],
  );

  /** Play another track from the current queue (keeps the queue). */
  const jump = useCallback(
    (track: Track) => {
      autoSkipsRef.current = 0;
      setSkipped([]);
      return start(track);
    },
    [start],
  );

  const neighbour = useCallback((offset: number) => {
    const cur = currentRef.current;
    if (!cur) return undefined;
    const q = queueRef.current;
    const idx = q.findIndex((t) => sameTrack(t, cur));
    return idx >= 0 ? q[idx + offset] : undefined;
  }, []);

  const next = useCallback(() => {
    const t = neighbour(1);
    if (t) void jump(t);
  }, [neighbour, jump]);

  /** Back to the start of the track, or to the previous one when near the start. */
  const prev = useCallback(() => {
    const t = neighbour(-1);
    if (snapshot.positionMs > 3000 || !t) {
      setSnapshot((s) => ({ ...s, positionMs: 0 }));
      void active.current?.seek(0).catch(() => {});
    } else void jump(t);
  }, [neighbour, jump, snapshot.positionMs]);

  // At the end of a side, drop the needle on the next record in the queue.
  useEffect(() => {
    onEndedRef.current = () => {
      const t = neighbour(1);
      if (t) void start(t);
    };
  }, [neighbour, start]);

  // Current track can't play here: move on to the next one in its list, or stop with the error.
  useEffect(() => {
    onUnplayableRef.current = (message) => {
      const failed = currentRef.current;
      if (!failed) return;
      const queue = queueRef.current;
      const idx = queue.findIndex((t) => sameTrack(t, failed));
      const next = idx >= 0 ? queue[idx + 1] : undefined;
      if (next && autoSkipsRef.current < MAX_AUTO_SKIPS) {
        autoSkipsRef.current++;
        setSkipped((s) => [...s, { track: failed, reason: message }]);
        void start(next);
      } else {
        setError(message);
        setSnapshot((s) => ({ ...s, playing: false }));
      }
    };
  }, [start]);

  const toggle = useCallback(async () => {
    const a = active.current;
    if (!a) return;
    try {
      if (snapshot.playing) await a.pause();
      else await a.resume();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Playback control failed.");
    }
  }, [snapshot.playing]);

  const seek = useCallback(async (ms: number) => {
    setSnapshot((s) => ({ ...s, positionMs: ms }));
    await active.current?.seek(ms).catch(() => {});
  }, []);

  const setVolume = useCallback(async (v: number) => {
    volumeRef.current = v;
    setVolumeState(v);
    await active.current?.setVolume(v).catch(() => {});
  }, []);

  // Poll position while playing (SDK events don't fire on every tick).
  useEffect(() => {
    if (!snapshot.playing) return;
    const id = setInterval(async () => {
      const s = await active.current?.getSnapshot().catch(() => null);
      if (s) setSnapshot(s);
    }, 500);
    return () => clearInterval(id);
  }, [snapshot.playing]);

  // Tear down SDK players on unmount.
  useEffect(() => {
    const map = adapters.current;
    return () => {
      Object.values(map).forEach((a) => a?.destroy());
    };
  }, []);

  const index = current ? queue.findIndex((t) => sameTrack(t, current)) : -1;

  return {
    current,
    status,
    error,
    skipped,
    volume,
    queue,
    index,
    hasNext: index >= 0 && index < queue.length - 1,
    ...snapshot,
    play,
    jump,
    next,
    prev,
    toggle,
    seek,
    setVolume,
  };
}

export type PlayerControls = ReturnType<typeof usePlayer>;
