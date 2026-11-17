"use client";

import { useState } from "react";
import { CATALOG, DRIVES, formatPrice, type Drive, type Turntable, type TurntableArt } from "@/lib/shop/catalog";
import type { SkinId } from "@/lib/vinyl/skins";

type Filter = "All" | Drive;

/** Top-down drawing of a turntable in the listing's colours. The record spins on hover. */
function TurntableArt({ art, className = "" }: { art: TurntableArt; className?: string }) {
  const rx = art.shape === "rounded" ? 26 : art.shape === "case" ? 18 : 6;
  return (
    <svg viewBox="0 0 400 300" className={className} aria-hidden="true">
      {art.shape === "case" && (
        <rect x="168" y="20" width="64" height="26" rx="9" fill="none" stroke={art.plinth} strokeWidth="7" />
      )}
      <rect x="24" y="46" width="352" height="232" rx={rx} fill="#000" opacity="0.35" />
      <rect x="24" y="38" width="352" height="232" rx={rx} fill={art.plinth} />
      <rect x="24.5" y="38.5" width="351" height="231" rx={rx} fill="none" stroke="#fff" strokeOpacity="0.1" />

      <circle cx="160" cy="154" r="108" fill={art.platter} />
      <g className="origin-center [transform-box:fill-box] motion-safe:group-hover:animate-[spin_1.8s_linear_infinite]">
        <circle cx="160" cy="154" r="100" fill="#121110" />
        {[92, 82, 72, 62, 52].map((r) => (
          <circle key={r} cx="160" cy="154" r={r} fill="none" stroke="#fff" strokeOpacity="0.07" />
        ))}
        <circle cx="160" cy="154" r="34" fill={art.label} />
        <rect x="154" y="128" width="12" height="3" rx="1" fill="#000" opacity="0.35" />
      </g>
      <circle cx="160" cy="154" r="3.5" fill="#d9d9d9" />

      {/* Tonearm */}
      <rect x="326" y="200" width="12" height="12" rx="2" fill="#000" opacity="0.3" />
      <circle cx="324" cy="80" r="21" fill="#000" fillOpacity="0.25" stroke={art.arm} strokeOpacity="0.5" strokeWidth="2" />
      <circle cx="338" cy="60" r="9" fill={art.arm} />
      <path d="M324 80 L308 200 L264 236" fill="none" stroke={art.arm} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M264 236 L248 246" stroke={art.arm} strokeWidth="11" strokeLinecap="square" />
      <circle cx="324" cy="80" r="7" fill={art.arm} />

      <circle cx="58" cy="244" r="9" fill="#000" fillOpacity="0.2" stroke="#fff" strokeOpacity="0.25" />
      <circle cx="84" cy="244" r="9" fill="#000" fillOpacity="0.2" stroke="#fff" strokeOpacity="0.25" />
    </svg>
  );
}

function Listing({
  item,
  index,
  onDeck,
  inCart,
  onPreview,
  onToggleCart,
}: {
  item: Turntable;
  index: number;
  onDeck: boolean;
  inCart: boolean;
  onPreview: (skin: SkinId) => void;
  onToggleCart: () => void;
}) {
  return (
    <li>
      <article className="group">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[3px] bg-ink-2 ring-1 ring-paper/10">
          <TurntableArt
            art={item.art}
            className="absolute inset-0 size-full p-[8%] transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
          <span className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/45">
            No_{String(index + 1).padStart(2, "0")}
          </span>
          {item.skin && (
            <span className="absolute right-3 top-3 rounded-full border border-paper/25 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-paper/75">
              {onDeck ? "● On the deck" : "3D"}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-baseline justify-between gap-4">
          <h3 className="font-serif text-[28px] leading-none">{item.name}</h3>
          <p className="shrink-0 font-mono text-sm tabular-nums text-paper/90">{formatPrice(item.price)}</p>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/45">
          {item.maker} · {item.drive === "Portable" ? "Portable" : `${item.drive} drive`}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-paper/65">{item.blurb}</p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-paper/45">{item.specs.join(" · ")}</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleCart}
            aria-pressed={inCart}
            className={`h-10 px-4 font-mono text-[11px] uppercase tracking-[0.18em] transition ${
              inCart ? "border border-paper/40 text-paper" : "bg-paper text-ink hover:bg-white"
            }`}
          >
            {inCart ? "In cart ✓" : "Add to cart"}
          </button>
          {item.skin && (
            <button
              type="button"
              onClick={() => onPreview(item.skin!)}
              disabled={onDeck}
              className="h-10 px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-paper/75 underline-offset-4 transition hover:text-paper hover:underline disabled:text-paper/40 disabled:no-underline"
            >
              {onDeck ? "On the deck" : "Try it on the deck"}
            </button>
          )}
        </div>
      </article>
    </li>
  );
}

/** "Turntables for sale" below the hero. Placeholder listings from lib/shop/catalog.ts. */
export function Shop({
  skin,
  onPreview,
  className = "",
}: {
  skin: SkinId;
  onPreview: (skin: SkinId) => void;
  className?: string;
}) {
  const [filter, setFilter] = useState<Filter>("All");
  const [cart, setCart] = useState<ReadonlySet<string>>(new Set());
  const items = filter === "All" ? CATALOG : CATALOG.filter((t) => t.drive === filter);

  const toggleCart = (id: string) =>
    setCart((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <section id="turntables" aria-labelledby="shop-title" className={className}>
      {/* Wide screens: the docked 3D deck occupies the left column. */}
      <div aria-hidden="true" className="hidden lg:block" />

      <div className="lg:pointer-events-auto">
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-paper/55">
          Catalogue · {CATALOG.length} turntables{cart.size ? ` · ${cart.size} in cart` : ""}
        </p>
        <h2 id="shop-title" className="mt-5 font-serif text-[clamp(48px,5.6vw,96px)] leading-[0.9] tracking-[-0.02em]">
          Take one <em className="text-paper/85">home.</em>
        </h2>
        <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-paper/70">
          Placeholder listings for now. The decks marked 3D can be put on the turntable
          {" "}
          <span className="hidden lg:inline">on the left</span>
          <span className="lg:hidden">up top</span>, so you can hear your record on them first.
        </p>

        <div role="group" aria-label="Filter by drive" className="mt-8 flex flex-wrap gap-2">
          {(["All", ...DRIVES] as Filter[]).map((f) => {
            const count = f === "All" ? CATALOG.length : CATALOG.filter((t) => t.drive === f).length;
            const active = f === filter;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
                  active ? "border-paper bg-paper text-ink" : "border-paper/20 text-paper/70 hover:border-paper/50 hover:text-paper"
                }`}
              >
                {f === "All" || f === "Portable" ? f : `${f} drive`} <span className="opacity-50">{count}</span>
              </button>
            );
          })}
        </div>

        <ul className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2">
          {items.map((item) => (
            <Listing
              key={item.id}
              item={item}
              index={CATALOG.indexOf(item)}
              onDeck={item.skin === skin}
              inCart={cart.has(item.id)}
              onPreview={onPreview}
              onToggleCart={() => toggleCart(item.id)}
            />
          ))}
        </ul>

        <p className="mt-20 border-t border-paper/15 pt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/40">
          Vinyl / Player · Sample listings, not real products · Prices in USD
        </p>
      </div>
    </section>
  );
}
