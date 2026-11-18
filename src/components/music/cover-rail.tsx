"use client";

import { useState } from "react";
import type { Track } from "@/lib/music/types";
import { formatTime } from "./track-list";

/** Covers shown at once; long lists show a window starting just before the current track. */
const WINDOW = 8;

const same = (a: Track, b: Track) => a.provider === b.provider && a.id === b.id;
const pad = (n: number) => String(n).padStart(2, "0");

function Cover({ track }: { track: Track }) {
  if (track.artworkUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- remote artwork from several CDNs
    return <img src={track.artworkUrl} alt="" loading="lazy" className="size-full object-cover" />;
  }
  // No artwork: a tiny record instead.
  return (
    <span className="grid size-full place-items-center rounded-full bg-ink-2 ring-1 ring-paper/15">
      <span className="size-1/3 rounded-full bg-paper/70" />
    </span>
  );
}

/**
 * The list the current track came from, as a row of cover thumbnails. The
 * playing record is larger and ringed; hover or focus a cover to see what it is.
 */
export function CoverRail({
  queue,
  current,
  onPick,
  className = "",
}: {
  queue: Track[];
  current: Track | null;
  onPick: (track: Track) => void;
  className?: string;
}) {
  const [peek, setPeek] = useState<number | null>(null);
  if (queue.length < 2) return null;

  const idx = current ? queue.findIndex((t) => same(t, current)) : -1;
  const start = Math.min(Math.max(0, idx - 1), Math.max(0, queue.length - WINDOW));
  const items = queue.slice(start, start + WINDOW);
  const more = queue.length - (start + items.length);

  const shown = peek ?? Math.max(idx, 0);
  const track = queue[shown];
  const role =
    shown === idx ? "Playing" : shown === idx + 1 ? "Up next" : shown < idx ? "Played" : `In ${shown - idx}`;

  return (
    <nav aria-label="Queue" className={className}>
      <p className="flex min-w-0 items-baseline gap-3 lg:justify-end" aria-live="polite">
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/45">
          {role} · {pad(shown + 1)}/{pad(queue.length)}
        </span>
        <span className="min-w-0 truncate text-[13px] text-paper/85">
          {track.title}
          <span className="text-paper/45"> — {track.artists.join(", ")}</span>
          {track.durationMs ? (
            <span className="ml-2 font-mono text-[10px] tabular-nums text-paper/40">{formatTime(track.durationMs)}</span>
          ) : null}
        </span>
      </p>

      <ol className="mt-3 flex items-end gap-2 overflow-x-auto p-1 lg:justify-end lg:overflow-visible lg:p-0">
        {items.map((t, i) => {
          const n = start + i;
          const active = n === idx;
          const base = "relative block shrink-0 overflow-hidden rounded-[2px] transition-all duration-300 ease-out";
          return (
            <li key={`${t.provider}:${t.id}`} className="shrink-0">
              {active ? (
                <span
                  aria-current="true"
                  tabIndex={0}
                  aria-label={`Playing: ${t.title} by ${t.artists.join(", ")}`}
                  onPointerEnter={() => setPeek(n)}
                  onPointerLeave={() => setPeek(null)}
                  onFocus={() => setPeek(n)}
                  onBlur={() => setPeek(null)}
                  className={`${base} size-14 outline-none ring-1 ring-paper ring-offset-[3px] ring-offset-ink`}
                >
                  <Cover track={t} />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onPick(t)}
                  onPointerEnter={() => setPeek(n)}
                  onPointerLeave={() => setPeek(null)}
                  onFocus={() => setPeek(n)}
                  onBlur={() => setPeek(null)}
                  aria-label={`Play ${t.title} by ${t.artists.join(", ")}`}
                  className={`${base} size-10 hover:-translate-y-1 hover:opacity-100 focus-visible:-translate-y-1 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cue ${
                    n < idx ? "opacity-35" : "opacity-75"
                  }`}
                >
                  <Cover track={t} />
                </button>
              )}
            </li>
          );
        })}
        {more > 0 && (
          <li className="shrink-0 self-center pl-1 font-mono text-[10px] tabular-nums text-paper/40">+{more}</li>
        )}
      </ol>
    </nav>
  );
}
