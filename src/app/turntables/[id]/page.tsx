import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AddToCart } from "@/components/shop/add-to-cart";
import { CartLink } from "@/components/shop/cart-link";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/icons";
import { PILL, SiteHeader } from "@/components/site-header";
import { TurntableArt } from "@/components/shop/turntable-art";
import { TurntableViewer } from "@/components/vinyl/turntable-viewer";
import {
  CATALOG,
  catalogueNo,
  driveLabel,
  formatPrice,
  getTurntable,
  turntableHref,
  type Turntable,
} from "@/lib/shop/catalog";

// Every listing is prerendered; an unknown id renders the not-found page.
export function generateStaticParams() {
  return CATALOG.map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: PageProps<"/turntables/[id]">): Promise<Metadata> {
  const item = getTurntable((await params).id);
  if (!item) return { title: "Turntable not found · Vinyl Player" };
  return {
    title: `${item.name} · Vinyl Player`,
    description: `${item.name} by ${item.maker}, ${formatPrice(item.price)}. ${item.blurb}`,
  };
}

// The header and a skeleton are the instant shell; the listing streams in, or comes with
// the prefetch when the link was rendered with `prefetch`.
export default function TurntablePage({ params }: PageProps<"/turntables/[id]">) {
  return (
    <main className="relative isolate min-h-svh bg-ink">
      <SiteHeader className="absolute inset-x-0 top-0 z-20">
        <Link href="/#turntables" className={PILL}>
          <ArrowLeftIcon size={14} />
          <span className="hidden sm:inline">All turntables</span>
          <span className="sm:hidden">All</span>
        </Link>
        <CartLink />
      </SiteHeader>

      <Suspense fallback={<DetailSkeleton />}>
        <TurntableDetail params={params} />
      </Suspense>

      <div aria-hidden="true" className="grain pointer-events-none fixed inset-0 z-40 opacity-[0.08]" />
    </main>
  );
}

const COLUMNS = "lg:grid lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]";
const STAGE = "relative h-[62svh] min-h-[360px] lg:sticky lg:top-0 lg:h-svh lg:min-h-[640px]";
const ARTICLE = "relative z-10 px-5 pb-24 pt-10 lg:pb-16 lg:pl-6 lg:pr-10 lg:pt-32";

function Glow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_50%,rgb(201_140_78/0.2),transparent_70%)]"
    />
  );
}

async function TurntableDetail({ params }: { params: PageProps<"/turntables/[id]">["params"] }) {
  const item = getTurntable((await params).id);
  if (!item) notFound();

  const i = CATALOG.indexOf(item);
  const prev = CATALOG[(i - 1 + CATALOG.length) % CATALOG.length];
  const next = CATALOG[(i + 1) % CATALOG.length];

  return (
    <div className={COLUMNS}>
      {/* The deck: 3D when there's a model, otherwise the listing's drawing. Stays put on wide screens. */}
      <div className={STAGE}>
        <Glow />
        {item.skin ? (
          <TurntableViewer skin={item.skin} className="size-full" />
        ) : (
          <Drawing item={item} />
        )}
      </div>

      <article aria-labelledby="turntable-name" className={ARTICLE}>
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-paper/55">
          {catalogueNo(item)} · {driveLabel(item.drive)}
          {item.skin && " · 3D model"}
        </p>
        <h1 id="turntable-name" className="mt-5 font-serif text-[clamp(56px,5.6vw,104px)] leading-[0.9] tracking-[-0.02em]">
          {item.name}
        </h1>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.22em] text-paper/55">by {item.maker}</p>

        <p className="mt-8 font-mono text-2xl tabular-nums">{formatPrice(item.price)}</p>
        <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-paper/70">{item.blurb}</p>

        <div className="mt-9">
          <AddToCart id={item.id} name={item.name} />
        </div>

        <dl className="mt-14 divide-y divide-paper/10 border-y border-paper/15 text-sm">
          <Spec term="Maker">{item.maker}</Spec>
          <Spec term="Drive">{item.drive}</Spec>
          <Spec term="Details">
            <ul className="space-y-1">
              {item.specs.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Spec>
          <Spec term="3D model">{item.skin ? "Yes: drag the deck to look around" : "Not yet"}</Spec>
        </dl>

        <nav aria-label="More turntables" className="mt-14 grid grid-cols-2 gap-4">
          <NeighbourLink item={prev} direction="prev" />
          <NeighbourLink item={next} direction="next" />
        </nav>

        <p className="mt-16 border-t border-paper/15 pt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/40">
          Vinyl / Player · Sample listing, not a real product · Prices in USD
        </p>
      </article>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" className={COLUMNS}>
      <div className={STAGE}>
        <Glow />
      </div>
      <div className={ARTICLE}>
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-paper/40">Loading the listing…</p>
        <div className="mt-6 h-[clamp(48px,5vw,92px)] w-3/4 bg-paper/10" />
        <div className="mt-5 h-3 w-1/3 bg-paper/5" />
        <div className="mt-9 h-7 w-24 bg-paper/10" />
        <div className="mt-6 h-16 max-w-[46ch] bg-paper/5" />
        <div className="mt-9 h-12 w-44 bg-paper/10" />
      </div>
    </div>
  );
}

function Drawing({ item }: { item: Turntable }) {
  return (
    <div className="group relative grid size-full place-items-center px-6 pb-12 pt-20 lg:px-14">
      <TurntableArt art={item.art} className="w-full max-w-[680px] transition-transform duration-500 ease-out group-hover:scale-[1.02]" />
      <p className="absolute bottom-4 left-5 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/40 lg:left-10">
        Drawing · No 3D model for this deck yet
      </p>
    </div>
  );
}

function Spec({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-4 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/45">{term}</dt>
      <dd className="text-paper/80">{children}</dd>
    </div>
  );
}

function NeighbourLink({ item, direction }: { item: Turntable; direction: "prev" | "next" }) {
  const next = direction === "next";
  return (
    <Link
      href={turntableHref(item.id)}
      prefetch
      className={`group block border border-paper/15 p-4 transition hover:border-paper/40 ${next ? "text-right" : ""}`}
    >
      <span
        className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/45 ${next ? "justify-end" : ""}`}
      >
        {!next && <ArrowLeftIcon size={12} />}
        {next ? "Next" : "Previous"}
        {next && <ArrowRightIcon size={12} />}
      </span>
      <span className="mt-2 block font-serif text-[22px] leading-tight text-paper/85 transition group-hover:text-paper">
        {item.name}
      </span>
    </Link>
  );
}
