"use client";

import type { PlayerControls } from "@/lib/players/usePlayer";
import { PauseIcon, PlayIcon } from "./Icons";

/** Phones: a small spinning record with its arm, standing in for the 3D deck that scrolled away. */
function MiniDeck({ artworkUrl, playing }: { artworkUrl?: string; playing: boolean }) {
  return (
    <span className="relative size-12 shrink-0 lg:hidden" aria-hidden="true">
      <span
        className={`absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle,#141312_0_2px,#1f1d1b_2px_3px)] ring-1 ring-paper/15 motion-safe:animate-[spin_1.8s_linear_infinite] ${
          playing ? "" : "[animation-play-state:paused]"
        }`}
      >
        {artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote artwork from several CDNs
          <img src={artworkUrl} alt="" className="absolute inset-[30%] size-[40%] rounded-full object-cover" />
        ) : (
          <span className="absolute inset-[30%] rounded-full bg-paper/80" />
        )}
      </span>
      {/* Tonearm: on the record while playing, parked otherwise. */}
      <svg
        viewBox="0 0 24 24"
        className={`absolute -right-2 -top-1 size-7 origin-[20px_4px] text-paper/80 transition-transform duration-700 ${
          playing ? "rotate-[28deg]" : "rotate-0"
        }`}
      >
        <circle cx="20" cy="4" r="2.5" fill="currentColor" />
        <path d="M20 4 L18 16 L13 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Compact now-playing bar shown once the hero (and its transport) has scrolled away. */
export function DockedPlayer({
  player,
  visible,
  onBackToTop,
}: {
  player: PlayerControls;
  visible: boolean;
  onBackToTop: () => void;
}) {
  const { current, playing, status, positionMs, durationMs } = player;
  if (!current) return null;
  const duration = durationMs || current.durationMs || 0;
  const pct = duration ? Math.min(100, (positionMs / duration) * 100) : 0;

  return (
    <div
      inert={!visible}
      className={`fixed inset-x-4 bottom-4 z-30 transition duration-500 ease-out lg:inset-x-auto lg:bottom-8 lg:left-10 lg:w-[min(440px,34vw)] ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      }`}
    >
      <div className="relative flex items-center gap-3 overflow-hidden rounded-full border border-paper/15 bg-ink/85 py-2 pl-2 pr-4 backdrop-blur-md">
        <MiniDeck artworkUrl={current.artworkUrl} playing={playing} />
        <button
          type="button"
          onClick={player.toggle}
          disabled={status !== "ready"}
          aria-label={playing ? "Pause" : "Play"}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-cue text-white transition hover:bg-cue-hover disabled:opacity-60"
        >
          {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </button>
        <button type="button" onClick={onBackToTop} className="min-w-0 flex-1 text-left" title="Back to the deck">
          <span className="block font-mono text-[9px] uppercase tracking-[0.24em] text-paper/45">
            {playing ? "Now spinning" : "Paused"}
          </span>
          <span className="block truncate text-[13px] text-paper/90">
            {current.title}
            <span className="text-paper/45"> — {current.artists.join(", ")}</span>
          </span>
        </button>
        <span className="absolute inset-x-5 bottom-0 h-px bg-paper/10">
          <span className="block h-px bg-paper/60" style={{ width: `${pct}%` }} />
        </span>
      </div>
    </div>
  );
}
