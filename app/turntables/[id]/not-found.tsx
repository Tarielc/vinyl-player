import Link from "next/link";
import { ArrowRightIcon } from "@/components/Icons";
import { SiteHeader } from "@/components/SiteHeader";

export default function TurntableNotFound() {
  return (
    <main className="relative isolate min-h-svh bg-ink">
      <SiteHeader />
      <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-16 lg:px-10 lg:pt-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-paper/55">404 · Not in the catalogue</p>
        <h1 className="mt-5 font-serif text-[clamp(56px,6vw,104px)] leading-[0.9] tracking-[-0.02em]">
          No such <em className="text-paper/85">deck.</em>
        </h1>
        <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-paper/70">
          That turntable isn&rsquo;t in the catalogue, or its link has changed.
        </p>
        <Link
          href="/#turntables"
          className="mt-9 inline-flex h-12 items-center gap-3 bg-cue px-6 font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-white transition hover:bg-cue-hover"
        >
          Browse turntables
          <ArrowRightIcon size={16} />
        </Link>
      </div>
      <div aria-hidden="true" className="grain pointer-events-none fixed inset-0 z-40 opacity-[0.08]" />
    </main>
  );
}
