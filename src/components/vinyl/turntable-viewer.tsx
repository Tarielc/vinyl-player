"use client";

import { useRef, useState, type ReactNode } from "react";
import type { LoadState } from "@/lib/vinyl/stage";
import type { SkinId } from "@/lib/vinyl/skins";
import { MinusIcon, PlusIcon, ResetViewIcon } from "@/components/icons";
import { VinylCanvas, type VinylCanvasHandle } from "./vinyl-canvas";

/** A turntable's 3D model on its own: orbit, zoom, reset. No record playing. */
export function TurntableViewer({ skin, className = "" }: { skin: SkinId; className?: string }) {
  const view = useRef<VinylCanvasHandle>(null);
  const [load, setLoad] = useState<LoadState | null>(null);
  const loading = load && !load.ready && !load.error ? load : null;
  const progress = Math.round((loading?.progress ?? 0) * 100);

  return (
    <div className={`relative ${className}`}>
      <VinylCanvas
        ref={view}
        framing="centered"
        className="absolute inset-0"
        skin={skin}
        label={null}
        playing={false}
        positionMs={0}
        durationMs={0}
        volume={0.8}
        onLoadState={setLoad}
      />

      {(loading || load?.error) && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="w-56 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-paper/60">
            {load?.error ? (
              <p className="text-amber">{load.error}</p>
            ) : (
              <>
                <p>Pressing the deck · {progress}%</p>
                <div className="mt-3 h-px w-full bg-paper/15">
                  <div className="h-px bg-paper transition-[width] duration-200" style={{ width: `${progress}%` }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <p className="pointer-events-none absolute bottom-4 left-5 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/40 lg:left-10">
        Drag to orbit · Pinch to zoom
      </p>
      <div className="absolute bottom-3 right-4 flex items-center gap-1 lg:right-8">
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
