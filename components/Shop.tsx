"use client";

import { useState } from "react";
import Link from "next/link";
import { addToCart, cartCount, removeFromCart, useCart } from "@/lib/shop/cart";
import { CATALOG, DRIVES, driveLabel, formatPrice, type Drive, type Turntable } from "@/lib/shop/catalog";
import type { SkinId } from "@/lib/vinyl/skins";
import { TurntableArt } from "./TurntableArt";

type Filter = "All" | Drive;

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
          {item.maker} · {driveLabel(item.drive)}
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
  const cart = useCart();
  const inCart = cartCount(cart);
  const items = filter === "All" ? CATALOG : CATALOG.filter((t) => t.drive === filter);

  const toggleCart = (id: string) => (cart[id] ? removeFromCart(id) : addToCart(id));

  return (
    <section id="turntables" aria-labelledby="shop-title" className={className}>
      {/* Wide screens: the docked 3D deck occupies the left column. */}
      <div aria-hidden="true" className="hidden lg:block" />

      <div className="lg:pointer-events-auto">
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-paper/55">
          Catalogue · {CATALOG.length} turntables
          {inCart > 0 && (
            <>
              {" · "}
              <Link href="/cart" className="text-paper underline-offset-4 hover:underline">
                {inCart} in cart →
              </Link>
            </>
          )}
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
              inCart={Boolean(cart[item.id])}
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
