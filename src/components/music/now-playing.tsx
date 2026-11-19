"use client";

import type { CSSProperties, ReactNode } from "react";
import { PROVIDER_NAMES } from "@/lib/music/types";
import type { PlayerControls } from "@/lib/players/use-player";
import { ArrowUpRightIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from "@/components/icons";
import { RecordOptions } from "./record-options";
import { formatTime } from "./track-list";
import type { SkinId } from "@/lib/vinyl/skins";
import { ShareButton } from "./share-button";

/** Track title, an editorial credits table and the transport. */
export function NowPlaying({
  player,
  deck,
  onChangeRecord,
}: {
  player: PlayerControls;
  /** The deck it's on, for share links. */
  deck: SkinId;
  onChangeRecord: () => void;
}) {
  const { current, status, error, skipped, playing, positionMs, durationMs, volume, queue, index, hasNext } = player;
  if (!current) return null;

  const duration = durationMs || current.durationMs || 0;
  const pct = duration ? `${Math.min(100, (positionMs / duration) * 100)}%` : "0%";
  const len = current.title.length;
  const titleSize =
    len <= 16
      ? "text-[clamp(48px,5.6vw,92px)]"
      : len <= 32
        ? "text-[clamp(40px,4.4vw,68px)]"
        : "text-[clamp(32px,3.2vw,50px)]";

  const rows: [string, ReactNode][] = [
    ["Artist", current.artists.join(", ") || "Unknown"],
    ...(current.album ? ([["Album", current.album]] as [string, string][]) : []),
    [
      "Source",
      current.externalUrl ? (
        <a
          href={current.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
        >
          {PROVIDER_NAMES[current.provider]}
          <ArrowUpRightIcon size={12} />
        </a>
      ) : (
        PROVIDER_NAMES[current.provider]
      ),
    ],
    ["Length", duration ? formatTime(duration) : "—"],
  ];

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-paper/55">
        Now spinning · Side A{queue.length > 1 && index >= 0 ? ` · ${index + 1} of ${queue.length}` : ""}
      </p>
      <h1 className={`mt-4 line-clamp-3 font-serif leading-[0.95] tracking-[-0.01em] text-balance ${titleSize}`}>
        {current.title}
      </h1>

      <dl className="mt-7 border-b border-paper/15 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-6 border-t border-paper/15 py-2">
            <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/50">{k}</dt>
            <dd className="min-w-0 truncate text-right text-paper/90">{v}</dd>
          </div>
        ))}
      </dl>

      {/* Transport */}
      <div className="mt-6 flex items-center gap-3 font-mono text-[11px] tabular-nums text-paper/55">
        <span className="w-10">{formatTime(positionMs)}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          value={Math.min(positionMs, duration || 1)}
          onChange={(e) => player.seek(Number(e.target.value))}
          disabled={status !== "ready" || !duration}
          className="slider min-w-0 flex-1"
          style={{ "--fill": pct } as CSSProperties}
          aria-label="Seek"
        />
        <span className="w-10 text-right">{formatTime(duration)}</span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={player.prev}
          disabled={status !== "ready"}
          className="grid size-10 place-items-center rounded-full text-paper/80 transition hover:bg-paper/10 hover:text-paper disabled:opacity-30"
          aria-label="Previous track"
        >
          <PrevIcon size={18} />
        </button>
        <button
          type="button"
          onClick={player.toggle}
          disabled={status !== "ready"}
          className="relative grid size-14 place-items-center rounded-full bg-cue text-white transition hover:bg-cue-hover disabled:opacity-60"
          aria-label={playing ? "Pause" : "Play"}
        >
          {status === "loading" ? (
            <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : playing ? (
            <PauseIcon size={20} />
          ) : (
            <PlayIcon size={20} />
          )}
        </button>
        <button
          type="button"
          onClick={player.next}
          disabled={!hasNext}
          className="grid size-10 place-items-center rounded-full text-paper/80 transition hover:bg-paper/10 hover:text-paper disabled:opacity-30"
          aria-label="Next track"
        >
          <NextIcon size={18} />
        </button>

        <label className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/50">
          Vol
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            className="slider w-20"
            style={{ "--fill": `${volume * 100}%` } as CSSProperties}
          />
        </label>
      </div>

      <RecordOptions className="mt-5" />

      <div className="mt-6 flex flex-wrap items-baseline gap-x-7 gap-y-3">
        <button
          type="button"
          onClick={onChangeRecord}
          className="border-b border-paper/40 pb-0.5 font-mono text-[11px] uppercase tracking-[0.24em] text-paper/80 transition hover:border-paper hover:text-paper"
        >
          Change record
        </button>
        <ShareButton track={current} deck={deck} />
      </div>

      {(error || skipped.length > 0) && (
        <div className="mt-4 space-y-1 font-mono text-[11px] leading-relaxed text-amber">
          {skipped.map(({ track, reason }) => (
            <p key={`${track.provider}:${track.id}`}>
              Skipped “{track.title}”: {reason}
            </p>
          ))}
          {error && (
            <p>
              {error}
              {current.provider === "youtube" && current.externalUrl && (
                <>
                  {" "}
                  <a href={current.externalUrl} target="_blank" rel="noreferrer" className="underline">
                    Open on YouTube
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
