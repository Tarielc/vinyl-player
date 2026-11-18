"use client";

import {
  createContext,
  use,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { usePlayer, type PlayerControls } from "@/lib/players/use-player";
import { DockedPlayer } from "./docked-player";

/** The page with the deck: it has its own transport and a place for the YouTube picture. */
interface Stage {
  slot: HTMLElement | null;
  /** That page's transport has scrolled away, so the compact bar takes over. */
  docked: boolean;
  onBackToDeck: () => void;
}

interface PlayerContextValue {
  player: PlayerControls;
  setStage: (stage: Stage | null) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

function usePlayerContext() {
  const ctx = use(PlayerContext);
  if (!ctx) throw new Error("PlayerProvider is missing from the layout.");
  return ctx;
}

/** The one player, shared by every page. */
export function usePlayerControls(): PlayerControls {
  return usePlayerContext().player;
}

/**
 * For the page with the deck: the YouTube picture is laid over `slot`, and the compact
 * bar shows only once `docked`. Pages that don't call this get a floating picture and the bar.
 */
export function usePlayerStage(slot: RefObject<HTMLElement | null>, docked: boolean, onBackToDeck: () => void) {
  const { setStage } = usePlayerContext();
  // Layout effect: its cleanup also runs when Next hides the page on navigation (Activity),
  // so the picture leaves the hidden page before the next one paints.
  useLayoutEffect(() => {
    setStage({ slot: slot.current, docked, onBackToDeck });
    return () => setStage(null);
  }, [setStage, slot, docked, onBackToDeck]);
}

/**
 * Lives in the root layout, so playback survives client-side navigation: the Spotify and
 * YouTube players are created here, never inside a page that Next may hide or unmount.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const youtubeContainer = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const player = usePlayer(youtubeContainer);
  const [stage, setStage] = useState<Stage | null>(null);
  const value = useMemo(() => ({ player, setStage }), [player]);

  // Moving an iframe in the DOM reloads it (and stops the video), so the YouTube frame stays
  // put here and is only positioned: over the stage's slot when there is one, else in a corner.
  const slot = stage?.slot ?? null;
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el || !slot) return;
    // Document coordinates, so the frame scrolls with the page without a scroll listener.
    const place = () => {
      const r = slot.getBoundingClientRect();
      el.style.top = `${r.top + window.scrollY}px`;
      el.style.left = `${r.left + window.scrollX}px`;
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(slot);
    ro.observe(document.body); // content above the slot changed height
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      el.removeAttribute("style");
    };
  }, [slot]);

  const youtube = player.current?.provider === "youtube";

  return (
    <PlayerContext value={value}>
      {children}

      {/* Floating picture: room to scroll the end of the page out from under it. */}
      {youtube && !stage && <div aria-hidden="true" className="h-54" />}

      {/* YouTube's terms require its player to stay visible, so it always has a frame. */}
      <div
        ref={frame}
        className={`overflow-hidden rounded-[2px] bg-black ring-1 ring-paper/15 ${youtube ? "" : "hidden"} ${
          slot
            ? "absolute z-10"
            : "fixed bottom-24 right-4 z-30 h-[200px] w-[min(356px,calc(100vw-32px))] shadow-[0_16px_48px_rgb(0_0_0/0.55)] lg:bottom-8 lg:right-10"
        }`}
      >
        <div ref={youtubeContainer} className="size-full [&_iframe]:block [&_iframe]:size-full" />
      </div>

      <DockedPlayer player={player} visible={stage ? stage.docked : true} onBackToDeck={stage?.onBackToDeck} />
    </PlayerContext>
  );
}
