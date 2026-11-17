"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { LabelInfo, LoadState, VinylStage } from "@/lib/vinyl/stage";
import type { SkinId } from "@/lib/vinyl/skins";

export interface VinylCanvasHandle {
  zoom(direction: 1 | -1): void;
  resetView(): void;
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
  onRecordClick?: () => void;
  onLoadState?: (state: LoadState) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<VinylStage | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const callbacks = useRef({ onRecordClick, onLoadState });
  useEffect(() => {
    callbacks.current = { onRecordClick, onLoadState };
  });

  useEffect(() => {
    let created: VinylStage | null = null;
    let cancelled = false;
    import("@/lib/vinyl/stage")
      .then(({ VinylStage }) => {
        if (cancelled || !host.current) return;
        created = new VinylStage(host.current, {
          onRecordClick: () => callbacks.current.onRecordClick?.(),
          onLoadState: (s) => callbacks.current.onLoadState?.(s),
        });
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
