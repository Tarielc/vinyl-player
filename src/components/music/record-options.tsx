"use client";

import { DISC_STYLES, setRecordPrefs, useRecordPrefs } from "@/lib/vinyl/prefs";

/** How the record is pressed (black, the cover's colour, a picture disc) and the needle sounds. */
export function RecordOptions({ className = "" }: { className?: string }) {
  const { disc, sounds } = useRecordPrefs();
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-3 ${className}`}>
      <div
        role="radiogroup"
        aria-label="Pressing"
        className="flex items-center gap-0.5 rounded-full border border-paper/15 bg-ink/40 p-1"
      >
        <span className="px-2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/40">Pressing</span>
        {DISC_STYLES.map((d) => {
          const active = d.id === disc;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setRecordPrefs({ disc: d.id })}
              className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
                active ? "bg-paper text-ink" : "text-paper/65 hover:text-paper"
              }`}
            >
              {d.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={sounds}
        onClick={() => setRecordPrefs({ sounds: !sounds })}
        title="Surface crackle, the needle landing and the run-out groove, under the music"
        className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/60 transition hover:text-paper"
      >
        <span
          aria-hidden="true"
          className={`size-2 rounded-full transition ${sounds ? "bg-amber shadow-[0_0_8px_rgb(231_180_100/0.7)]" : "bg-paper/25"}`}
        />
        Needle sounds {sounds ? "on" : "off"}
      </button>
    </div>
  );
}
