"use client";

import { useState } from "react";
import { CheckIcon, ShareIcon } from "@/components/icons";
import { playsFor, sharePath } from "@/lib/music/share";
import type { Track } from "@/lib/music/types";
import type { SkinId } from "@/lib/vinyl/skins";

/**
 * Copies a link that opens the site with `track` on the `deck` (phones get the share sheet).
 * Says who the link plays for: Spotify needs Premium, YouTube plays for anyone.
 */
export function ShareButton({ track, deck, className = "" }: { track: Track; deck: SkinId; className?: string }) {
  /** A pop-up over the button after copying; `n` replays it on every click. */
  const [toast, setToast] = useState<{ n: number; ok: boolean } | null>(null);

  async function share() {
    const url = new URL(sharePath(track, deck), window.location.origin).toString();
    const title = `${track.title} — ${track.artists.join(", ")}`;
    if (typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setToast((t) => ({ n: (t?.n ?? 0) + 1, ok: true }));
    } catch {
      setToast((t) => ({ n: (t?.n ?? 0) + 1, ok: false }));
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className={`flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 ${className}`}>
      <span className="relative">
        <button
          type="button"
          onClick={share}
          className="inline-flex items-center gap-1.5 border-b border-paper/40 pb-0.5 font-mono text-[11px] uppercase tracking-[0.24em] text-paper/80 transition hover:border-paper hover:text-paper"
        >
          <ShareIcon size={13} />
          Share record
        </button>
        {toast && (
          <span
            key={toast.n}
            role="status"
            onAnimationEnd={() => setToast(null)}
            className={`toast-pop pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em] shadow-[0_10px_30px_rgb(0_0_0/0.5)] ${
              toast.ok ? "bg-paper text-ink" : "bg-amber text-ink"
            }`}
          >
            {toast.ok && <CheckIcon size={14} strokeWidth={2.2} />}
            {toast.ok ? "Link copied" : "Couldn't copy"}
          </span>
        )}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/40">{playsFor(track.provider)}</span>
    </div>
  );
}
