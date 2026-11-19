"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { authErrorMessage } from "@/lib/music/auth-errors";
import { apiFetch } from "@/lib/music/client";
import { playsFor } from "@/lib/music/share";
import { PROVIDER_IDS, PROVIDER_NAMES, type ProviderId, type ProviderStatus, type Track } from "@/lib/music/types";
import { useRecordPrefs } from "@/lib/vinyl/prefs";
import { DEFAULT_SKIN, SKINS, type SkinId } from "@/lib/vinyl/skins";
import type { LabelInfo, LoadState } from "@/lib/vinyl/stage";
import {
  ArrowRightIcon,
  CloseIcon,
  ListenIcon,
  MinusIcon,
  PlusIcon,
  ResetViewIcon,
  SearchIcon,
} from "@/components/icons";
import { CartLink } from "@/components/shop/cart-link";
import { Shop } from "@/components/shop/shop";
import { VinylCanvas, type VinylCanvasHandle } from "@/components/vinyl/vinyl-canvas";
import { MusicPicker } from "./music-picker";
import { NowPlaying } from "./now-playing";
import { usePlayerControls, usePlayerStage } from "./player-provider";
import { SleeveCrate } from "./sleeve-crate";
import { formatTime } from "./track-list";

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
  artworkUrl: t.coverUrl ?? t.artworkUrl,
});

const isSkin = (id: string | undefined): id is SkinId => SKINS.some((s) => s.id === id);

/**
 * The page: a hero built around a 3D turntable that plays whatever is picked from
 * Spotify or YouTube, then turntables for sale while the deck keeps spinning on the left.
 * `shared`: a share link's track (null if it couldn't be found), put on the deck in `?deck=`.
 */
export function MusicApp({ searchParams, shared }: { searchParams: SearchParams; shared?: Promise<Track | null> }) {
  const [picker, setPicker] = useState<PickerState>({ open: false, key: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [skin, setSkin] = useState<SkinId>(DEFAULT_SKIN);
  const [load, setLoad] = useState<LoadState | null>(null);
  const [docked, setDocked] = useState(false);
  /** The tonearm in hand: where it would land (0..1), or over its rest. */
  const [scrub, setScrub] = useState<number | "rest" | null>(null);
  /** The deck's lights, in the record's colours (null: the studio's own). */
  const [lights, setLights] = useState<[string, string] | null>(null);
  /** Listening mode: only the deck is left. `awake` while the pointer has moved lately. */
  const [listening, setListening] = useState(false);
  const [awake, setAwake] = useState(true);
  /** From a share link: on the deck, waiting for a click to play. */
  const [sharedTrack, setSharedTrack] = useState<Track | null>(null);
  const prefs = useRecordPrefs();
  const youtubeSlot = useRef<HTMLDivElement>(null);
  const view = useRef<VinylCanvasHandle>(null);
  const page = useRef<HTMLElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  // Owned by the root layout, so it keeps playing on other pages.
  const player = usePlayerControls();
  const { current, queue, index, hasNext, toggle } = player;

  const openPicker = useCallback(() => setPicker((p) => ({ ...p, open: true })), []);

  // Back from an OAuth sign-in: reopen the picker on that provider, or show the error.
  const onAuthReturn = useCallback((connected?: string, errorCode?: string, errorProvider?: string) => {
    const provider = PROVIDER_IDS.find((id) => id === connected);
    // Back on a share link, the shared record is what they came for: no picker.
    const onShareLink = window.location.pathname.startsWith("/listen/");
    if (provider && !onShareLink) setPicker((p) => ({ open: true, key: p.key + 1, provider }));
    if (errorCode) setNotice(authErrorMessage(errorCode, errorProvider));
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const onShared = useCallback((track: Track | null, deck?: string) => {
    if (isSkin(deck)) setSkin(deck);
    if (track) setSharedTrack(track);
    else setNotice("That shared record couldn't be found. Choose another?");
  }, []);

  // Until something plays, a shared record sits on the deck.
  const onDeck = current ?? sharedTrack;
  const label = useMemo(() => (onDeck ? toLabel(onDeck) : null), [onDeck]);
  const upcoming = hasNext ? queue[index + 1] : undefined;
  const preload = useMemo(() => (upcoming ? toLabel(upcoming) : null), [upcoming]);

  const { play } = player;
  const onRecordClick = useCallback(() => {
    if (current) void toggle();
    else if (sharedTrack) void play(sharedTrack);
    else openPicker();
  }, [current, toggle, sharedTrack, play, openPicker]);

  const duration = player.durationMs || current?.durationMs || 0;
  const { seek, playing } = player;
  // The arm lowered by hand: play from there.
  const onNeedleDrop = useCallback(
    async (fraction: number) => {
      if (!duration) return;
      await seek(Math.round(fraction * duration));
      if (!playing) await toggle();
    },
    [duration, seek, playing, toggle],
  );
  // Put back on its rest: stop.
  const onArmRest = useCallback(() => {
    if (playing) void toggle();
  }, [playing, toggle]);

  const startListening = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setAwake(true);
    setListening(true);
  }, []);

  // Listening mode: no scrolling, Esc leaves, and the way out (and the cursor) hides when idle.
  useEffect(() => {
    if (!listening) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    // The YouTube picture is laid over its slot, which just moved: have it placed again.
    window.dispatchEvent(new Event("resize"));
    let timer = window.setTimeout(() => setAwake(false), 2500);
    const wake = () => {
      setAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAwake(false), 2500);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) setListening(false);
      else wake();
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", onKey);
      root.style.overflow = overflow;
      window.dispatchEvent(new Event("resize"));
    };
  }, [listening]);

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
  usePlayerStage(youtubeSlot, docked, backToTop);

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
      <ViewButton label="Listening mode" onClick={startListening}>
        <ListenIcon />
      </ViewButton>
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
    <main
      ref={page}
      data-playing={player.playing || undefined}
      data-listening={listening || undefined}
      className={`room relative bg-ink ${listening && !awake ? "cursor-none" : ""}`}
      style={lights ? ({ "--glow": lights[0], "--glow-rim": lights[1] } as CSSProperties) : undefined}
    >
      <Suspense fallback={null}>
        <AuthReturn searchParams={searchParams} onReturn={onAuthReturn} />
      </Suspense>
      {shared && (
        <Suspense fallback={null}>
          <SharedArrival shared={shared} searchParams={searchParams} onArrive={onShared} />
        </Suspense>
      )}

      {/* ---------------------------------------------------------------- hero */}
      <div
        ref={hero}
        className="relative isolate flex min-h-svh flex-col overflow-clip lg:block lg:h-svh lg:min-h-[700px]"
      >
        {/* 3D turntable: part of the hero on phones; fixed behind the page on wide screens, docking left on scroll.
            Listening mode: the whole screen. --deck-x/y is where the deck sits and --pool the light around it. */}
        <div
          className={
            listening
              ? "fixed inset-0 z-30 [--deck-x:50%] [--deck-y:50%] [--pool:56%_70%]"
              : "relative h-[56svh] min-h-[340px] [--deck-x:50%] [--deck-y:45%] [--pool:70%_60%] lg:fixed lg:inset-0 lg:h-auto lg:[--deck-x:calc(64%_-_39%_*_var(--dock,0))] lg:[--deck-y:50%] lg:[--pool:46%_64%]"
          }
        >
          {/* A pool of light behind the deck in the record's colours, and its rim light off to the side. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(var(--pool) at var(--deck-x) var(--deck-y), color-mix(in srgb, var(--glow) 24%, transparent), transparent 72%), radial-gradient(34% 42% at calc(var(--deck-x) + 16%) calc(var(--deck-y) - 18%), color-mix(in srgb, var(--glow-rim) 12%, transparent), transparent 70%)",
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
            durationMs={duration}
            volume={player.volume}
            disc={prefs.disc}
            sounds={prefs.sounds}
            frameShift={youtube && !docked ? 0.11 : 0}
            onRecordClick={onRecordClick}
            onNeedleDrop={onNeedleDrop}
            onArmRest={onArmRest}
            onArmScrub={setScrub}
            onLights={setLights}
            onLoadState={setLoad}
            focus={listening}
          />
          {/* The room dims while a record plays: dark edges, the deck still in its light. */}
          <div
            aria-hidden="true"
            className="room-dim pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(var(--pool) at var(--deck-x) var(--deck-y), transparent 45%, rgb(0 0 0 / 0.5) 100%)",
            }}
          />

          {scrub !== null && (
            <p
              aria-live="polite"
              className="pointer-events-none absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-full border border-paper/20 bg-ink/70 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/85 tabular-nums backdrop-blur lg:left-[calc(64%-39%*var(--dock,0))] lg:top-24"
            >
              {scrub === "rest" ? "Back on the rest · stop" : `Drop at ${formatTime(scrub * duration)} / ${formatTime(duration)}`}
            </p>
          )}

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

          <div className="chrome dims absolute bottom-3 right-4 z-10 flex items-center gap-1 lg:hidden">{viewControls}</div>
          <DeckSwitcher skin={skin} onChange={setSkin} className="chrome dims absolute bottom-3 left-4 z-10 flex lg:hidden" />

          {listening && <ListeningOverlay track={current} awake={awake} onLeave={() => setListening(false)} />}
        </div>

        {/* Wide screens: these scroll away with the hero; the deck itself stays. */}
        <div className="chrome dims absolute bottom-8 right-10 z-10 hidden items-center gap-1 lg:flex">{viewControls}</div>

        <header className="chrome dims absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between gap-4 px-5 lg:h-20 lg:px-10">
          <Link href="/" className="text-[13px] font-medium uppercase tracking-[0.34em]">
            Vinyl <span className="text-paper/35">/</span> Player
          </Link>
          <DeckSwitcher skin={skin} onChange={setSkin} className="hidden lg:flex" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openPicker()}
              aria-label="Choose music"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-paper/20 px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/80 backdrop-blur transition hover:border-paper/50 hover:text-paper sm:px-4"
            >
              <SearchIcon size={14} />
              <span className="hidden sm:inline">Choose music</span>
            </button>
            <CartLink />
          </div>
        </header>

        {notice && (
          <p className="chrome absolute inset-x-5 top-18 z-30 flex items-center justify-between gap-3 border border-amber/40 bg-ink/90 px-4 py-2.5 font-mono text-[11px] text-amber backdrop-blur lg:left-1/2 lg:right-auto lg:top-22 lg:-translate-x-1/2">
            {notice}
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-amber/70 hover:text-amber">
              <CloseIcon size={14} />
            </button>
          </p>
        )}

        {/* Copy / now playing */}
        <section className="chrome relative z-10 px-5 pb-8 pt-4 lg:pointer-events-none lg:absolute lg:bottom-20 lg:left-10 lg:top-24 lg:flex lg:w-[min(460px,36vw)] lg:flex-col lg:justify-center lg:p-0 lg:*:pointer-events-auto">
          {current ? (
            <NowPlaying player={player} deck={skin} onChangeRecord={() => openPicker()} />
          ) : sharedTrack ? (
            <SharedIntro track={sharedTrack} onPlay={play} onChoose={() => openPicker()} />
          ) : (
            <Intro onStart={() => openPicker()} />
          )}
        </section>

        {/* YouTube's terms require its player to stay visible, so it gets a frame of its own. The
            player lives in the root layout (so it survives navigation) and is laid over this slot. */}
        <figure
          className={
            !youtube
              ? "hidden"
              : listening
                ? "fixed bottom-5 right-5 z-40 w-[min(300px,calc(100vw-40px))]"
                : "mx-5 mb-8 lg:absolute lg:right-10 lg:top-20 lg:z-10 lg:m-0 lg:flex lg:flex-row-reverse lg:items-start lg:gap-3"
          }
        >
          <div
            ref={youtubeSlot}
            className={listening ? "aspect-video w-full" : "h-[200px] w-full lg:w-[356px] lg:shrink-0"}
          />
          <figcaption className="chrome mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/45 lg:mt-0 lg:rotate-180 lg:[writing-mode:vertical-rl]">
            Picture · YouTube
          </figcaption>
        </figure>

        {/* Sits left of the four view buttons on wide screens. */}
        <SleeveCrate
          queue={queue}
          current={current}
          onPick={player.jump}
          className="chrome dims relative z-10 px-5 pb-10 lg:absolute lg:bottom-8 lg:right-[216px] lg:w-[min(520px,40vw)] lg:border-r lg:border-paper/15 lg:px-0 lg:pb-0 lg:pr-5"
        />
      </div>

      {/* ---------------------------------------------------------------- shop */}
      <Shop
        skin={skin}
        onPreview={previewSkin}
        className="relative z-10 px-5 py-24 lg:pointer-events-none lg:grid lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)] lg:gap-16 lg:px-10 lg:py-32"
      />

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

/** Listening mode's only chrome: the record's name and the way out, shown while the pointer moves. */
function ListeningOverlay({ track, awake, onLeave }: { track: Track | null; awake: boolean; onLeave: () => void }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-700 ${awake ? "opacity-100" : "opacity-0"}`}
    >
      <button
        type="button"
        onClick={onLeave}
        // Faded out, but still there for the keyboard.
        className="pointer-events-auto absolute right-4 top-4 inline-flex h-9 items-center gap-2 rounded-full border border-paper/20 bg-ink/50 px-4 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/80 backdrop-blur transition hover:border-paper/50 hover:text-paper lg:right-10 lg:top-8"
      >
        Leave <span className="hidden text-paper/45 sm:inline">· Esc</span>
        <CloseIcon size={14} />
      </button>
      {track && (
        <p className="absolute bottom-5 left-5 max-w-[calc(100vw-40px)] truncate font-mono text-[10px] uppercase tracking-[0.22em] text-paper/60 lg:bottom-8 lg:left-10 lg:max-w-[60ch]">
          {track.title} <span className="text-paper/35">— {track.artists.join(", ")}</span>
        </p>
      )}
    </div>
  );
}

function AuthReturn({
  searchParams,
  onReturn,
}: {
  searchParams: SearchParams;
  onReturn: (connected?: string, errorCode?: string, errorProvider?: string) => void;
}) {
  const sp = use(searchParams);
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const connected = first(sp.music_connected);
  const error = first(sp.music_error);
  const errorProvider = first(sp.music_provider);
  useEffect(() => {
    if (connected || error) onReturn(connected, error, errorProvider);
  }, [connected, error, errorProvider, onReturn]);
  return null;
}

/** Hands a share link's track and deck to the page, once both are known. */
function SharedArrival({
  shared,
  searchParams,
  onArrive,
}: {
  shared: Promise<Track | null>;
  searchParams: SearchParams;
  onArrive: (track: Track | null, deck?: string) => void;
}) {
  const track = use(shared);
  const deck = use(searchParams).deck;
  const skin = Array.isArray(deck) ? deck[0] : deck;
  useEffect(() => onArrive(track, skin), [track, skin, onArrive]);
  return null;
}

/**
 * A shared record waiting on the deck. YouTube plays for anyone; Spotify plays in the browser
 * only for signed-in Premium accounts, so without a Spotify session it offers to connect, or to
 * find the same song on YouTube.
 */
function SharedIntro({
  track,
  onPlay,
  onChoose,
}: {
  track: Track;
  onPlay: (track: Track, list?: Track[]) => Promise<void>;
  onChoose: () => void;
}) {
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [finding, setFinding] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    apiFetch<ProviderStatus[]>("/api/music/providers", { signal: ctrl.signal })
      .then(setProviders)
      .catch(() => setProviders([]));
    return () => ctrl.abort();
  }, []);

  const status = providers?.find((p) => p.id === track.provider);
  const youtube = providers?.find((p) => p.id === "youtube");
  const needsConnect = track.provider === "spotify" && providers !== null && !status?.connected;
  const canFind = track.provider === "spotify" && Boolean(youtube?.searchAvailable && !youtube.searchRequiresAuth);

  async function findOnYouTube() {
    setFinding("Looking on YouTube…");
    try {
      const q = `${track.title} ${track.artists[0] ?? ""}`.trim();
      const results = await apiFetch<Track[]>(`/api/music/youtube/search?${new URLSearchParams({ q, limit: "5" })}`);
      if (results.length) {
        setFinding(null);
        await onPlay(results[0], results);
      } else setFinding("Not on YouTube, it seems.");
    } catch (err) {
      setFinding(err instanceof Error ? err.message : "YouTube search failed.");
    }
  }

  const connectHref = `/api/music/${track.provider}/login?${new URLSearchParams({
    return: `${window.location.pathname}${window.location.search}`,
  })}`;
  const primary =
    "inline-flex h-12 items-center gap-3 bg-cue px-6 font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-white transition hover:bg-cue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper";
  const secondary =
    "border-b border-paper/40 pb-0.5 font-mono text-[11px] uppercase tracking-[0.22em] text-paper/75 transition hover:border-paper hover:text-paper";

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-paper/55">
        A record for you · {PROVIDER_NAMES[track.provider]}
      </p>
      <h1 className="mt-5 line-clamp-3 font-serif text-[clamp(48px,5.4vw,92px)] leading-[0.92] tracking-[-0.02em] text-balance">
        {track.title}
      </h1>
      <p className="mt-4 text-[17px] text-paper/70">{track.artists.join(", ")}</p>

      <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
        {needsConnect ? (
          <a href={connectHref} className={primary}>
            Connect Spotify to play
            <ArrowRightIcon size={16} />
          </a>
        ) : (
          <button type="button" onClick={() => void onPlay(track)} disabled={!providers} className={`${primary} disabled:opacity-60`}>
            Drop the needle
            <ArrowRightIcon size={16} />
          </button>
        )}
        {canFind && (
          <button type="button" onClick={findOnYouTube} className={secondary}>
            Play it from YouTube
          </button>
        )}
        <button type="button" onClick={onChoose} className={secondary}>
          Choose another
        </button>
      </div>
      <p className="mt-6 max-w-[42ch] font-mono text-[10px] uppercase leading-relaxed tracking-[0.22em] text-paper/40">
        {finding ??
          (track.provider === "spotify"
            ? `${playsFor("spotify")}: Spotify only streams to browsers for Premium accounts.${canFind ? " No Premium? Play it from YouTube." : ""}`
            : `${playsFor("youtube")}. Or click the record.`)}
      </p>
    </div>
  );
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
        Drag to orbit · Pinch to zoom · Click the record to play · Drag the arm to cue
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
            // Tighter on phones, so four decks fit beside the view button.
            className={`rounded-full px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition sm:px-3 ${
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
