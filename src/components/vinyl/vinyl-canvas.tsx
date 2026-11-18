"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { NeedleSounds } from "@/lib/vinyl/needle-sounds";
import type { DiscStyle, LabelInfo, LoadState, StageFraming, VinylStage } from "@/lib/vinyl/stage";
import type { SkinId } from "@/lib/vinyl/skins";

export interface VinylCanvasHandle {
  zoom(direction: 1 | -1): void;
  resetView(): void;
  /** 0 = hero position, 1 = docked on the left (wide layouts). Cheap to call on every scroll frame. */
  setDock(progress: number): void;
}

/**
 * Mounts the Three.js turntable (loaded on the client only) and mirrors the
 * player state into it.
 */
export function VinylCanvas({
  ref,
  skin,
  label,
  preload,
  playing,
  positionMs,
  durationMs,
  volume,
  disc = "black",
  sounds = false,
  frameShift = 0,
  framing = "hero",
  onRecordClick,
  onNeedleDrop,
  onArmRest,
  onArmScrub,
  onLoadState,
  className,
}: {
  ref?: Ref<VinylCanvasHandle>;
  skin: SkinId;
  /** Cover for the label; null keeps the model's own label. */
  label: LabelInfo | null;
  /** Next label to draw ahead of time. */
  preload?: LabelInfo | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  /** How the record is pressed. */
  disc?: DiscStyle;
  /** Needle sounds (crackle, drop, run-out), mixed under the music at `volume`. */
  sounds?: boolean;
  /** Slide the deck down by this fraction of the height (wide layouts), to clear overlays. */
  frameShift?: number;
  /** Read once, when the stage is created. */
  framing?: StageFraming;
  /** Makes the record clickable. Whether it is clickable is read once, when the stage is created. */
  onRecordClick?: () => void;
  /** Makes the tonearm draggable: lowered at `fraction` of the side. Read once, like onRecordClick. */
  onNeedleDrop?: (fraction: number) => void;
  /** The tonearm was put back on its rest by hand. */
  onArmRest?: () => void;
  /** While the arm is in hand: where it would land (0..1), "rest", or null once let go. */
  onArmScrub?: (at: number | "rest" | null) => void;
  onLoadState?: (state: LoadState) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<VinylStage | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const callbacks = useRef({ onRecordClick, onLoadState, onNeedleDrop, onArmRest, onArmScrub });
  const needleSounds = useRef<NeedleSounds | null>(null);
  /** Stylus in the groove, as last reported by the stage (for sounds turned on mid-record). */
  const inGroove = useRef(false);
  // Kept here too, so a stage created after the page was scrolled starts docked.
  const dock = useRef(0);
  useEffect(() => {
    callbacks.current = { onRecordClick, onLoadState, onNeedleDrop, onArmRest, onArmScrub };
  });

  const initial = useRef({ framing, clickable: Boolean(onRecordClick), arm: Boolean(onNeedleDrop) });

  useEffect(() => {
    let created: VinylStage | null = null;
    let cancelled = false;
    import("@/lib/vinyl/stage")
      .then(({ VinylStage }) => {
        if (cancelled || !host.current) return;
        const { framing, clickable, arm } = initial.current;
        created = new VinylStage(
          host.current,
          {
            onRecordClick: clickable ? () => callbacks.current.onRecordClick?.() : undefined,
            onLoadState: (s) => callbacks.current.onLoadState?.(s),
            onNeedleDrop: arm ? (f) => callbacks.current.onNeedleDrop?.(f) : undefined,
            onArmRest: () => callbacks.current.onArmRest?.(),
            onArmScrub: (at) => callbacks.current.onArmScrub?.(at),
            onNeedle: (e) => {
              if (e !== "runout") inGroove.current = e === "down";
              needleSounds.current?.needle(e);
            },
          },
          framing,
        );
        created.setDock(dock.current);        setStage(created);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailed(err instanceof Error ? err.message : "WebGL is not available.");
      });
    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, []);

  useEffect(() => void stage?.setSkin(skin), [stage, skin]);
  useEffect(() => stage?.setTrack(label), [stage, label]);
  useEffect(() => stage?.preload(preload ?? null), [stage, preload]);
  useEffect(
    () => stage?.setPlayback({ playing, positionMs, durationMs }),
    [stage, playing, positionMs, durationMs],
  );
  useEffect(() => stage?.setVolume(volume), [stage, volume]);
  useEffect(() => stage?.setDisc(disc), [stage, disc]);
  useEffect(() => stage?.setFrameShift(frameShift), [stage, frameShift]);

  // Needle sounds: loaded the first time they're wanted, then kept (muted when off) so the
  // groove state stays in step with the arm.
  useEffect(() => {
    if (!sounds && !needleSounds.current) return;
    let cancelled = false;
    void (needleSounds.current
      ? Promise.resolve(needleSounds.current)
      : import("@/lib/vinyl/needle-sounds").then(({ NeedleSounds }) => {
          if (cancelled) return null;
          return (needleSounds.current ??= new NeedleSounds());
        })
    ).then((n) => {
      if (cancelled || !n) return;
      n.setGroove(inGroove.current);
      n.setVolume(volume);
      n.setEnabled(sounds);
    });
    return () => {
      cancelled = true;
    };
  }, [sounds, volume]);
  useEffect(
    () => () => {
      needleSounds.current?.dispose();
      needleSounds.current = null;
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      zoom: (d) => stage?.zoom(d),
      resetView: () => stage?.resetView(),
      setDock: (p) => {
        dock.current = p;
        stage?.setDock(p);
      },
    }),
    [stage],
  );

  return (
    <div ref={host} className={className}>
      {failed && (
        <p className="absolute inset-0 grid place-items-center p-8 text-center font-mono text-xs uppercase tracking-[0.2em] text-paper/60">
          3D view unavailable: {failed}
        </p>
      )}
    </div>
  );
}
