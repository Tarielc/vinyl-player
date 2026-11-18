import Link from "next/link";
import type { ReactNode } from "react";

/** Rounded outline button used in headers. */
export const PILL =
  "inline-flex h-9 items-center gap-2 rounded-full border border-paper/20 px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/80 backdrop-blur transition hover:border-paper/50 hover:text-paper sm:px-4";

/** Header for the pages other than home: the wordmark, plus whatever goes on the right. */
export function SiteHeader({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <header className={`flex h-16 items-center justify-between gap-4 px-5 lg:h-20 lg:px-10 ${className}`}>
      <Link href="/" className="shrink-0 text-[13px] font-medium uppercase tracking-[0.34em]">
        Vinyl <span className="text-paper/35">/</span> Player
      </Link>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
