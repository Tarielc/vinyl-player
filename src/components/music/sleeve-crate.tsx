"use client";

import { useState, type CSSProperties } from "react";
import type { Track } from "@/lib/music/types";
import { formatTime } from "./track-list";

/** Sleeves shown at once; long lists show a window starting just before the current track. */
const WINDOW = 14;

const same = (a: Track, b: Track) => a.provider === b.provider && a.id === b.id;
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (t: Track) => `${t.provider}:${t.id}`;

function SleeveArt({ track }: { track: Track }) {
  if (track.artworkUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- remote artwork from several CDNs
    return <img src={track.artworkUrl} alt="" loading="lazy" draggable={false} className="size-full object-cover" />;
  }
  // No artwork: a plain card sleeve with a die-cut centre hole.
  return (
    <span className="stock grid size-full place-items-center bg-ink-2">
      <span className="size-[38%] rounded-full bg-ink ring-1 ring-paper/15" />
    </span>
  );
}

/** The record sliding up out of its sleeve, on its way to the deck. Replays when `track` changes. */
function OutgoingRecord({ track }: { track: Track }) {
  return (
    <span
      aria-hidden="true"
      className="record-out pointer-events-none absolute inset-x-[5%] top-[5%] aspect-square rounded-full shadow-[0_6px_14px_rgb(0_0_0/0.5)]"
      style={{
        background:
          "radial-gradient(circle, #0b0a09 0 4%, transparent 4.5%), repeating-radial-gradient(circle, #141210 0 1.2px, #1d1a17 1.2px 2.4px)",
      }}
    >
      <span
        className="absolute inset-[33%] rounded-full bg-paper/70 bg-cover bg-center"
        style={track.artworkUrl ? { backgroundImage: `url(${JSON.stringify(track.artworkUrl)})` } : undefined}
      />
      <span className="absolute inset-[47%] rounded-full bg-ink" />
    </span>
  );
}

/**
 * The list the current track came from, as sleeves standing in a crate. Sleeves lean back until
 * you hover or focus one; picking one pulls it up and its record slides out toward the deck.
 * The current record's sleeve stands up, empty.
 */
export function SleeveCrate({
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
  const start = Math.min(Math.max(0, idx - 2), Math.max(0, queue.length - WINDOW));
  const items = queue.slice(start, start + WINDOW);
  const more = queue.length - (start + items.length);

  const shown = peek ?? Math.max(idx, 0);
  const track = queue[shown];
  const role =
    shown === idx ? "On the deck" : shown === idx + 1 ? "Up next" : shown < idx ? "Played" : `In ${shown - idx}`;

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

      <div className="relative mt-1">
        <ol className="flex h-[104px] items-end overflow-x-auto px-2 pb-1 [scrollbar-width:none] lg:justify-end lg:overflow-visible lg:px-0">
          {items.map((t, i) => {
            const n = start + i;
            const active = n === idx;
            const open = active || peek === n;
            const sleeve: CSSProperties = {
              transform: open
                ? `translateY(${active ? -22 : -16}px)`
                : `rotateY(56deg) translateY(${n < idx ? 0 : -2}px)`,
            };
            const face = `absolute inset-0 origin-left overflow-hidden rounded-[2px] transition-[transform,opacity,filter] duration-300 ease-out`;
            const peekProps = {
              onPointerEnter: () => setPeek(n),
              onPointerLeave: () => setPeek(null),
              onFocus: () => setPeek(n),
              onBlur: () => setPeek(null),
            };
            return (
              <li
                key={keyOf(t)}
                className={`relative h-16 shrink-0 transition-[width] duration-300 ease-out ${open ? "w-[76px]" : "w-[22px]"}`}
              >
                <div className="absolute bottom-0 left-0 size-16 [perspective:420px]">
                  {active && <OutgoingRecord key={keyOf(t)} track={t} />}
                  {active ? (
                    <span
                      aria-current="true"
                      tabIndex={0}
                      aria-label={`On the deck: ${t.title} by ${t.artists.join(", ")}`}
                      {...peekProps}
                      style={sleeve}
                      className={`${face} outline-none ring-1 ring-paper ring-offset-[3px] ring-offset-ink`}
                    >
                      <SleeveArt track={t} />
                      {/* Empty sleeve: a shadowed opening along the top. */}
                      <span className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-b from-black/60 to-transparent" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPick(t)}
                      {...peekProps}
                      aria-label={`Play ${t.title} by ${t.artists.join(", ")}`}
                      style={sleeve}
                      className={`${face} block cursor-pointer shadow-[-6px_0_10px_rgb(0_0_0/0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cue ${
                        n < idx && !open ? "brightness-[0.45]" : open ? "" : "brightness-[0.8]"
                      }`}
                    >
                      <SleeveArt track={t} />
                      {/* Leaning back: darker toward the far edge, a lit spine at the front. */}
                      <span
                        className={`pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-black/60 transition-opacity duration-300 ${
                          open ? "opacity-0" : "opacity-100"
                        }`}
                      />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {more > 0 && (
            <li className="mb-7 shrink-0 self-end pl-4 font-mono text-[10px] tabular-nums text-paper/40">+{more}</li>
          )}
        </ol>
        {/* The crate's front board, hiding the bottom of the sleeves. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-6 items-center justify-between border-t border-paper/20 bg-[linear-gradient(180deg,#221d18,#14110e)] px-3 font-mono text-[9px] uppercase tracking-[0.28em] text-paper/35 shadow-[0_-8px_16px_rgb(0_0_0/0.45)]"
        >
          <span>Crate</span>
          <span className="tabular-nums">{pad(queue.length)} records</span>
        </div>
      </div>
    </nav>
  );
}
