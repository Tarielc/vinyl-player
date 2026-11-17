"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePlayer } from "@/lib/players/usePlayer";
import { PROVIDER_IDS, type ProviderId, type Track } from "@/lib/music/types";
import { DEFAULT_SKIN, SKINS, type SkinId } from "@/lib/vinyl/skins";
import type { LabelInfo, LoadState } from "@/lib/vinyl/stage";
import { CoverRail } from "./CoverRail";
import { DockedPlayer } from "./DockedPlayer";
import { ArrowRightIcon, CloseIcon, MinusIcon, PlusIcon, ResetViewIcon, SearchIcon } from "./Icons";
import { MusicPicker } from "./MusicPicker";
import { NowPlaying } from "./NowPlaying";
import { Shop } from "./Shop";
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

/**
 * The page: a hero built around a 3D turntable that plays whatever is picked from
 * Spotify or YouTube, then turntables for sale while the deck keeps spinning on the left.
 */
export function MusicApp({ searchParams }: { searchParams: SearchParams }) {
  const [picker, setPicker] = useState<PickerState>({ open: false, key: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [skin, setSkin] = useState<SkinId>(DEFAULT_SKIN);
  const [load, setLoad] = useState<LoadState | null>(null);
  const [docked, setDocked] = useState(false);
  const youtubeContainer = useRef<HTMLDivElement>(null);
  const view = useRef<VinylCanvasHandle>(null);
  const page = useRef<HTMLElement>(null);
  const hero = useRef<HTMLDivElement>(null);
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

  // Scroll: on wide screens the deck slides to the left column and keeps playing there;
  // once most of the hero is gone, a compact now-playing bar takes over from its transport.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = hero.current;
      if (!el) return;
      const h = el.offsetHeight || window.innerHeight;
      const progress = Math.min(1, Math.max(0, (window.scrollY - h * 0.05) / (h * 0.6)));
      view.current?.setDock(progress);
      page.current?.style.setProperty("--dock", progress.toFixed(3));
      setDocked(el.getBoundingClientRect().bottom < window.innerHeight * 0.5);
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const backToTop = useCallback(() => window.scrollTo({ top: 0, behavior: "smooth" }), []);

  // A listing put on the deck: phones scroll back up to where the deck is.
  const previewSkin = useCallback(
    (id: SkinId) => {
      setSkin(id);
      if (window.innerWidth < 1024) backToTop();
    },
    [backToTop],
  );

  const loading = load && !load.ready && !load.error ? load : null;
  const youtube = current?.provider === "youtube";
  const viewControls = (
    <>
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
    </>
  );

  return (
    <main ref={page} className="relative bg-ink">
      <Suspense fallback={null}>
        <AuthReturn searchParams={searchParams} onReturn={onAuthReturn} />
      </Suspense>

      {/* ---------------------------------------------------------------- hero */}
      <div
        ref={hero}
        className="relative isolate flex min-h-svh flex-col overflow-clip lg:block lg:h-svh lg:min-h-[700px]"
      >
        {/* 3D turntable: part of the hero on phones; fixed behind the page on wide screens, docking left on scroll. */}
        <div className="relative h-[56svh] min-h-[340px] lg:fixed lg:inset-0 lg:h-auto">
          {/* Warm pool of light behind the deck (follows it when it docks). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_45%,rgb(201_140_78/0.22),transparent_70%)] lg:hidden"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden lg:block"
            style={{
              background:
                "radial-gradient(46% 64% at calc(64% - 39% * var(--dock, 0)) 50%, rgb(201 140 78 / 0.22), transparent 72%)",
            }}
          />
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
            frameShift={youtube && !docked ? 0.11 : 0}
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

          <div className="absolute bottom-3 right-4 z-10 flex items-center gap-1 lg:hidden">{viewControls}</div>
          <DeckSwitcher skin={skin} onChange={setSkin} className="absolute bottom-3 left-4 z-10 flex lg:hidden" />
        </div>

        {/* Wide screens: these scroll away with the hero; the deck itself stays. */}
        <div className="absolute bottom-8 right-10 z-10 hidden items-center gap-1 lg:flex">{viewControls}</div>

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
        </section>

        {/* YouTube's terms require its player to stay visible, so it gets a frame of its own. */}
        <figure
          className={
            youtube
              ? "mx-5 mb-8 lg:absolute lg:right-10 lg:top-20 lg:z-10 lg:m-0 lg:flex lg:flex-row-reverse lg:items-start lg:gap-3"
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

        {/* Sits left of the view buttons on wide screens. */}
        <CoverRail
          queue={queue}
          current={current}
          onPick={player.jump}
          className="relative z-10 px-5 pb-10 lg:absolute lg:bottom-8 lg:right-[176px] lg:w-[min(520px,40vw)] lg:border-r lg:border-paper/15 lg:px-0 lg:pb-0 lg:pr-5"
        />
      </div>

      {/* ---------------------------------------------------------------- shop */}
      <Shop
        skin={skin}
        onPreview={previewSkin}
        className="relative z-10 px-5 py-24 lg:pointer-events-none lg:grid lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)] lg:gap-16 lg:px-10 lg:py-32"
      />

      <DockedPlayer player={player} visible={docked} onBackToTop={backToTop} />

      <MusicPicker
        key={picker.key}
        open={picker.open}
        onClose={() => setPicker((p) => ({ ...p, open: false }))}
        onPick={player.play}
        initialProvider={picker.provider}
      />

      <div aria-hidden="true" className="grain pointer-events-none fixed inset-0 z-40 opacity-[0.08]" />
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
      <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
        <button
          type="button"
          onClick={onStart}
          className="inline-flex h-12 items-center gap-3 bg-cue px-6 font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-white transition hover:bg-cue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
        >
          Choose a record
          <ArrowRightIcon size={16} />
        </button>
        <a
          href="#turntables"
          className="border-b border-paper/40 pb-0.5 font-mono text-[11px] uppercase tracking-[0.22em] text-paper/75 transition hover:border-paper hover:text-paper"
        >
          Shop turntables ↓
        </a>
      </div>
      <p className="mt-6 font-mono text-[10px] uppercase leading-relaxed tracking-[0.22em] text-paper/40">
        Drag to orbit · Pinch to zoom · Click the record to play
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
