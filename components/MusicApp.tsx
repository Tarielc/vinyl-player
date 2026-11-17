"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePlayer } from "@/lib/players/usePlayer";
import { PROVIDER_IDS, type ProviderId, type Track } from "@/lib/music/types";
import { DEFAULT_SKIN, SKINS, type SkinId } from "@/lib/vinyl/skins";
import type { LabelInfo, LoadState } from "@/lib/vinyl/stage";
import { CoverRail } from "./CoverRail";
import { ArrowRightIcon, CloseIcon, MinusIcon, PlusIcon, ResetViewIcon, SearchIcon } from "./Icons";
import { MusicPicker } from "./MusicPicker";
import { NowPlaying } from "./NowPlaying";
import { VinylCanvas, type VinylCanvasHandle } from "./VinylCanvas";

type SearchParams = PageProps<"/">["searchParams"];

interface PickerState {
  open: boolean;
  /** Bumped to remount the picker on a given provider. */
  key: number;
  provider?: ProviderId;
}

const toLabel = (t: Track): LabelInfo => ({
  key: `${t.provider}:${t.id}`,
  title: t.title,
  artist: t.artists.join(", "),
  artworkUrl: t.artworkUrl,
});

/** The hero: a 3D turntable that plays whatever is picked from Spotify or YouTube. */
export function MusicApp({ searchParams }: { searchParams: SearchParams }) {
  const [picker, setPicker] = useState<PickerState>({ open: false, key: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [skin, setSkin] = useState<SkinId>(DEFAULT_SKIN);
  const [load, setLoad] = useState<LoadState | null>(null);
  const youtubeContainer = useRef<HTMLDivElement>(null);
  const view = useRef<VinylCanvasHandle>(null);
  const player = usePlayer(youtubeContainer);
  const { current, queue, index, hasNext, toggle } = player;

  const openPicker = useCallback(() => setPicker((p) => ({ ...p, open: true })), []);

  // Back from an OAuth sign-in: reopen the picker on that provider, or show the error.
  const onAuthReturn = useCallback((connected?: string, authError?: string) => {
    const provider = PROVIDER_IDS.find((id) => id === connected);
    if (provider) setPicker((p) => ({ open: true, key: p.key + 1, provider }));
    if (authError) setNotice(authError);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const label = useMemo(() => (current ? toLabel(current) : null), [current]);
  const upcoming = hasNext ? queue[index + 1] : undefined;
  const preload = useMemo(() => (upcoming ? toLabel(upcoming) : null), [upcoming]);

  const onRecordClick = useCallback(() => {
    if (current) void toggle();
    else openPicker();
  }, [current, toggle, openPicker]);

  // Space bar: play / pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || !current) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, dialog, [contenteditable]")) return;
      e.preventDefault();
      void toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, toggle]);

  const loading = load && !load.ready && !load.error ? load : null;

  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-clip bg-ink lg:block lg:h-svh lg:min-h-[700px]">
      <Suspense fallback={null}>
        <AuthReturn searchParams={searchParams} onReturn={onAuthReturn} />
      </Suspense>

      {/* Warm pool of light behind the deck. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_45%_at_50%_30%,rgb(201_140_78/0.22),transparent_70%)] lg:bg-[radial-gradient(46%_64%_at_64%_50%,rgb(201_140_78/0.22),transparent_72%)]"
      />

      {/* 3D turntable */}
      <div className="relative h-[56svh] min-h-[340px] lg:absolute lg:inset-0 lg:h-auto">
        <VinylCanvas
          ref={view}
          className="absolute inset-0"
          skin={skin}
          label={label}
          preload={preload}
          playing={player.playing}
          positionMs={player.positionMs}
          durationMs={player.durationMs || current?.durationMs || 0}
          volume={player.volume}
          frameShift={current?.provider === "youtube" ? 0.11 : 0}
          onRecordClick={onRecordClick}
          onLoadState={setLoad}
        />

        {(loading || load?.error) && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center lg:pl-[32%]">
            <div className="w-56 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-paper/60">
              {load?.error ? (
                <p className="text-amber">{load.error}</p>
              ) : (
                <>
                  <p>Pressing the deck · {Math.round((loading?.progress ?? 0) * 100)}%</p>
                  <div className="mt-3 h-px w-full bg-paper/15">
                    <div
                      className="h-px bg-paper transition-[width] duration-200"
                      style={{ width: `${(loading?.progress ?? 0) * 100}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="absolute bottom-3 right-4 z-10 flex items-center gap-1 lg:bottom-8 lg:right-10">
          {/* Phones pinch to zoom; the buttons would crowd the deck switcher. */}
          <ViewButton label="Zoom out" onClick={() => view.current?.zoom(-1)} className="hidden sm:grid">
            <MinusIcon />
          </ViewButton>
          <ViewButton label="Zoom in" onClick={() => view.current?.zoom(1)} className="hidden sm:grid">
            <PlusIcon />
          </ViewButton>
          <ViewButton label="Reset view" onClick={() => view.current?.resetView()}>
            <ResetViewIcon />
          </ViewButton>
        </div>

        <DeckSwitcher skin={skin} onChange={setSkin} className="absolute bottom-3 left-4 z-10 flex lg:hidden" />
      </div>

      <div aria-hidden="true" className="grain pointer-events-none absolute inset-0 z-0 opacity-[0.08]" />

      <header className="absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between gap-4 px-5 lg:h-20 lg:px-10">
        <Link href="/" className="text-[13px] font-medium uppercase tracking-[0.34em]">
          Vinyl <span className="text-paper/35">/</span> Player
        </Link>
        <DeckSwitcher skin={skin} onChange={setSkin} className="hidden lg:flex" />
        <button
          type="button"
          onClick={() => openPicker()}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-paper/20 px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/80 backdrop-blur transition hover:border-paper/50 hover:text-paper sm:px-4"
        >
          <SearchIcon size={14} />
          <span className="hidden sm:inline">Choose music</span>
        </button>
      </header>

      {notice && (
        <p className="absolute inset-x-5 top-18 z-30 flex items-center justify-between gap-3 border border-amber/40 bg-ink/90 px-4 py-2.5 font-mono text-[11px] text-amber backdrop-blur lg:left-1/2 lg:right-auto lg:top-22 lg:-translate-x-1/2">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-amber/70 hover:text-amber">
            <CloseIcon size={14} />
          </button>
        </p>
      )}

      {/* Copy / now playing */}
      <section className="relative z-10 px-5 pb-8 pt-4 lg:pointer-events-none lg:absolute lg:bottom-20 lg:left-10 lg:top-24 lg:flex lg:w-[min(460px,36vw)] lg:flex-col lg:justify-center lg:p-0 lg:*:pointer-events-auto">
        {current ? <NowPlaying player={player} onChangeRecord={() => openPicker()} /> : <Intro onStart={() => openPicker()} />}

        {/* YouTube's terms require its player to stay visible, so it gets a frame of its own. */}
        <figure
          className={
            current?.provider === "youtube"
              ? "mt-8 lg:fixed lg:right-10 lg:top-20 lg:mt-0 lg:flex lg:flex-row-reverse lg:items-start lg:gap-3"
              : "hidden"
          }
        >
          <div
            ref={youtubeContainer}
            className="overflow-hidden rounded-[2px] bg-black ring-1 ring-paper/15 [&_iframe]:block [&_iframe]:h-[200px] [&_iframe]:w-full lg:[&_iframe]:w-[356px]"
          />
          <figcaption className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/45 lg:mt-0 lg:rotate-180 lg:[writing-mode:vertical-rl]">
            Picture · YouTube
          </figcaption>
        </figure>
      </section>

      {/* Sits left of the view buttons on wide screens. */}
      <CoverRail
        queue={queue}
        current={current}
        onPick={player.jump}
        className="relative z-10 px-5 pb-10 lg:absolute lg:bottom-8 lg:right-[176px] lg:w-[min(520px,40vw)] lg:border-r lg:border-paper/15 lg:px-0 lg:pb-0 lg:pr-5"
      />

      <MusicPicker
        key={picker.key}
        open={picker.open}
        onClose={() => setPicker((p) => ({ ...p, open: false }))}
        onPick={player.play}
        initialProvider={picker.provider}
      />
    </main>
  );
}

function AuthReturn({
  searchParams,
  onReturn,
}: {
  searchParams: SearchParams;
  onReturn: (connected?: string, error?: string) => void;
}) {
  const sp = use(searchParams);
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const connected = first(sp.music_connected);
  const error = first(sp.music_error);
  useEffect(() => {
    if (connected || error) onReturn(connected, error);
  }, [connected, error, onReturn]);
  return null;
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-paper/55">Spotify · YouTube · 33⅓ rpm</p>
      <h1 className="mt-5 font-serif text-[clamp(64px,7.2vw,124px)] leading-[0.88] tracking-[-0.02em]">
        Drop the <em className="text-paper/85">needle.</em>
      </h1>
      <p className="mt-6 max-w-[34ch] text-[17px] leading-relaxed text-paper/70">
        Pick any track from Spotify or YouTube. Its cover is pressed onto the label, the platter spins up and the arm
        finds the groove.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-9 inline-flex h-12 items-center gap-3 bg-cue px-6 font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-white transition hover:bg-cue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
      >
        Choose a record
        <ArrowRightIcon size={16} />
      </button>
      <p className="mt-6 font-mono text-[10px] uppercase leading-relaxed tracking-[0.22em] text-paper/40">
        Drag to orbit · <span className="hidden lg:inline">Scroll</span>
        <span className="lg:hidden">Pinch</span> to zoom · Click the record to play
      </p>
    </div>
  );
}

function DeckSwitcher({
  skin,
  onChange,
  className = "",
}: {
  skin: SkinId;
  onChange: (id: SkinId) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Turntable model"
      className={`items-center gap-0.5 rounded-full border border-paper/15 bg-ink/50 p-1 backdrop-blur ${className}`}
    >
      <span className="hidden px-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/40 sm:inline">Deck</span>
      {SKINS.map((s) => {
        const active = s.id === skin;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={s.blurb}
            onClick={() => onChange(s.id)}
            className={`rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
              active ? "bg-paper text-ink" : "text-paper/65 hover:text-paper"
            }`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

function ViewButton({
  label,
  onClick,
  children,
  className = "grid",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`size-9 place-items-center rounded-full border border-paper/15 bg-ink/50 text-paper/70 backdrop-blur transition hover:border-paper/40 hover:text-paper ${className}`}
    >
      {children}
    </button>
  );
}
