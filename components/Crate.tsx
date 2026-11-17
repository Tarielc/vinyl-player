"use client";

import type { ProviderId, Track } from "@/lib/music/types";
import { formatTime } from "./TrackList";

/** Card stock for the dividers, cycled per slot. */
const STOCK = [
  "bg-olive text-ink",
  "bg-sand text-ink",
  "bg-slate text-ink",
  "bg-tan text-ink",
  "bg-char text-paper",
  "bg-moss text-paper",
] as const;
/** Where each divider's tab sits (0 = left edge, 1 = right edge), so neighbouring tabs don't line up. */
const TAB_X = [0.08, 0.5, 0.88, 0.28, 0.68, 0.98];

/** Places a tab along the top edge without letting it hang past either side. */
const tabAt = (slot: number) => {
  const f = TAB_X[slot % TAB_X.length];
  return { left: `${f * 100}%`, transform: `translateX(-${f * 100}%)` };
};
/** Dividers shown at once; long playlists show a window around the current track. */
const WINDOW = 10;

const pad = (n: number) => String(n).padStart(2, "0");
const same = (a: Track, b: Track) => a.provider === b.provider && a.id === b.id;

// Collapsed, only the top of each divider peeks out of the bottom edge (desktop).
const card =
  "stock group relative block h-[118px] w-full rounded-t-[3px] text-left shadow-[0_-10px_28px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out " +
  "lg:h-[150px] lg:translate-y-[92px] lg:hover:translate-y-[6px] lg:focus-visible:translate-y-[6px] lg:data-[active=true]:translate-y-[62px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cue";
const tab =
  "stock absolute -top-[18px] h-[18px] max-w-full truncate rounded-t-[4px] px-2.5 font-mono text-[9px] uppercase leading-[18px] tracking-[0.16em] whitespace-nowrap";

export function Crate({
  queue,
  current,
  onPick,
  onBrowse,
  className = "",
}: {
  queue: Track[];
  current: Track | null;
  onPick: (track: Track) => void;
  onBrowse: (provider?: ProviderId, mode?: "search" | "library") => void;
  className?: string;
}) {
  const list = "flex snap-x gap-0 overflow-x-auto px-5 pt-6 lg:grid lg:overflow-visible lg:px-0 lg:pt-0";

  if (!queue.length) {
    const entries: { code: string; title: string; note: string; go: () => void }[] = [
      { code: "Spotify //", title: "Search Spotify", note: "Premium plays in full", go: () => onBrowse("spotify", "search") },
      { code: "YouTube //", title: "Search YouTube", note: "Video plays alongside", go: () => onBrowse("youtube", "search") },
      { code: "Library //", title: "Your playlists", note: "Sign in to browse", go: () => onBrowse(undefined, "library") },
    ];
    const blanks = 4;
    return (
      <nav aria-label="Start a record" className={className}>
        <ol className={list} style={{ gridTemplateColumns: `repeat(${entries.length + blanks}, minmax(0, 1fr))` }}>
          {entries.map((e, i) => (
            <li key={e.code} className="w-[150px] shrink-0 snap-start lg:-ml-2 lg:w-auto lg:first:ml-0">
              <button type="button" onClick={e.go} className={`${card} ${STOCK[i % STOCK.length]}`}>
                <span className={`${tab} ${STOCK[i % STOCK.length]}`} style={tabAt(i)}>
                  {e.code}
                </span>
                <span className="block px-3 pt-3 text-[13px] font-bold uppercase leading-tight tracking-tight">
                  {e.title}
                </span>
                <span className="block px-3 pt-1 font-mono text-[9px] uppercase tracking-[0.14em] opacity-60">
                  {e.note}
                </span>
                <span className="absolute bottom-3 left-3 font-mono text-[18px] leading-none opacity-70">+</span>
              </button>
            </li>
          ))}
          {Array.from({ length: blanks }, (_, i) => {
            const n = entries.length + i;
            return (
              <li key={n} aria-hidden="true" className="hidden lg:-ml-2 lg:block">
                <div className={`${card} ${STOCK[n % STOCK.length]} opacity-90`}>
                  <span className={`${tab} ${STOCK[n % STOCK.length]}`} style={tabAt(n)}>
                    Empty_{pad(n + 1)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  const idx = current ? queue.findIndex((t) => same(t, current)) : -1;
  const start = queue.length <= WINDOW ? 0 : Math.min(Math.max(0, idx - 2), queue.length - WINDOW);
  const items = queue.slice(start, start + WINDOW);

  return (
    <nav aria-label="Crate: tracks in this list" className={className}>
      <ol className={list} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((t, i) => {
          const n = start + i;
          const active = current ? same(t, current) : false;
          const stock = STOCK[n % STOCK.length];
          return (
            <li key={`${t.provider}:${t.id}`} className="w-[150px] shrink-0 snap-start lg:-ml-2 lg:w-auto lg:first:ml-0">
              <button
                type="button"
                onClick={() => onPick(t)}
                data-active={active}
                aria-current={active ? "true" : undefined}
                title={`${t.title} — ${t.artists.join(", ")}`}
                className={`${card} ${stock}`}
              >
                <span className={`${tab} ${stock}`} style={tabAt(n)}>
                  {active ? "● On deck" : `No_${pad(n + 1)} //`}
                </span>
                <span className="block truncate px-3 pt-2.5 font-mono text-[9px] uppercase tracking-[0.14em] opacity-60">
                  {t.artists.join(", ")}
                </span>
                <span className="line-clamp-2 px-3 pt-1 text-[13px] font-bold uppercase leading-tight tracking-tight">
                  {t.title}
                </span>
                <span className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
                  {t.artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote artwork from several CDNs
                    <img src={t.artworkUrl} alt="" loading="lazy" className="size-10 rounded-[2px] object-cover shadow-md" />
                  ) : (
                    <span className="size-10 rounded-full bg-ink/80" />
                  )}
                  <span className="font-mono text-[10px] tabular-nums opacity-60">{formatTime(t.durationMs)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {queue.length > WINDOW && (
        <p className="px-5 pt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/45 lg:hidden">
          {queue.length} tracks · showing {start + 1}–{start + items.length}
        </p>
      )}
    </nav>
  );
}
