"use client";

import type { Track } from "@/lib/music/types";

export function formatTime(ms?: number): string {
  if (!ms || ms < 0 || !Number.isFinite(ms)) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function TrackList({ tracks, onPick }: { tracks: Track[]; onPick: (t: Track) => void }) {
  if (!tracks.length) return <p className="py-4 text-sm text-ink/55">No tracks found.</p>;
  return (
    <ol className="divide-y divide-ink/10">
      {tracks.map((t, i) => (
        <li key={`${t.provider}:${t.id}`}>
          <button
            type="button"
            onClick={() => onPick(t)}
            className="group flex w-full items-center gap-3 px-1 py-2 text-left transition hover:bg-ink/5"
          >
            <span className="w-6 font-mono text-[10px] tabular-nums text-ink/40">{String(i + 1).padStart(2, "0")}</span>
            {t.artworkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote artwork from many CDNs
              <img src={t.artworkUrl} alt="" className="h-10 w-10 shrink-0 rounded-[2px] object-cover" />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded-full bg-ink/80" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{t.title}</span>
              <span className="block truncate text-xs text-ink/55">
                {t.artists.join(", ")}
                {t.album ? ` · ${t.album}` : ""}
              </span>
            </span>
            <span className="font-mono text-[10px] tabular-nums text-ink/50 group-hover:hidden">
              {formatTime(t.durationMs)}
            </span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-cue group-hover:inline">
              Play →
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
