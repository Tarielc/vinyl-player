"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { LabelInfo, LoadState, StageFraming, VinylStage } from "@/lib/vinyl/stage";
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
  frameShift = 0,
  framing = "hero",
  onRecordClick,
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
  /** Slide the deck down by this fraction of the height (wide layouts), to clear overlays. */
  frameShift?: number;
  /** Read once, when the stage is created. */
  framing?: StageFraming;
  /** Makes the record clickable. Whether it is clickable is read once, when the stage is created. */
  onRecordClick?: () => void;
  onLoadState?: (state: LoadState) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<VinylStage | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const callbacks = useRef({ onRecordClick, onLoadState });
  // Kept here too, so a stage created after the page was scrolled starts docked.
  const dock = useRef(0);
  useEffect(() => {
    callbacks.current = { onRecordClick, onLoadState };
  });

  const initial = useRef({ framing, clickable: Boolean(onRecordClick) });

  useEffect(() => {
    let created: VinylStage | null = null;
    let cancelled = false;
    import("@/lib/vinyl/stage")
      .then(({ VinylStage }) => {
        if (cancelled || !host.current) return;
        const { framing, clickable } = initial.current;
        created = new VinylStage(
          host.current,
          {
            onRecordClick: clickable ? () => callbacks.current.onRecordClick?.() : undefined,
            onLoadState: (s) => callbacks.current.onLoadState?.(s),
          },
          framing,
        );
        created.setDock(dock.current);
        setStage(created);
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
  useEffect(() => stage?.setFrameShift(frameShift), [stage, frameShift]);

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
