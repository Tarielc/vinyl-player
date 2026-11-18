"use client";

import { use, type ReactNode } from "react";
import { browser } from "react-dom";
import Link from "next/link";
import {
  cartCount,
  cartLines,
  cartSubtotal,
  MAX_QTY,
  removeFromCart,
  setQuantity,
  useCart,
  type CartLine,
} from "@/lib/shop/cart";
import { driveLabel, formatPrice, turntableHref } from "@/lib/shop/catalog";
import { ArrowRightIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { TurntableArt } from "./turntable-art";

const GRID = "mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16";
const ROW = "grid grid-cols-[96px_minmax(0,1fr)] gap-x-5 py-6 sm:grid-cols-[168px_minmax(0,1fr)] sm:gap-x-8";
const KICKER = "font-mono text-[10px] uppercase tracking-[0.22em] text-paper/50";

const plural = (n: number) => `${n} ${n === 1 ? "turntable" : "turntables"}`;

/** The cart's lines and order summary. Browser-only: the cart lives in localStorage. */
export function CartView() {
  // Server rendering shows <CartSkeleton>; the browser renders the saved cart straight away.
  use(browser("The cart is saved in this browser's localStorage."));
  const cart = useCart();
  const lines = cartLines(cart);
  if (!lines.length) return <EmptyCart />;

  const count = cartCount(cart);
  return (
    <div className={GRID}>
      <section aria-labelledby="cart-lines">
        <h2 id="cart-lines" className={`border-b border-paper/15 pb-3 ${KICKER}`}>
          {plural(count)}
        </h2>
        <ul className="divide-y divide-paper/10">
          {lines.map((line) => (
            <Line key={line.item.id} {...line} />
          ))}
        </ul>
      </section>
      <Summary count={count} subtotal={cartSubtotal(cart)} />
    </div>
  );
}

function Line({ item, qty }: CartLine) {
  return (
    <li className={`group ${ROW}`}>
      <Link
        href={turntableHref(item.id)}
        prefetch
        tabIndex={-1}
        aria-hidden="true"
        className="relative block aspect-[4/3] self-start overflow-hidden rounded-[3px] bg-ink-2 ring-1 ring-paper/10 transition hover:ring-paper/30"
      >
        <TurntableArt art={item.art} className="absolute inset-0 size-full p-[8%]" />
      </Link>

      <div className="flex min-w-0 flex-col">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-serif text-[26px] leading-none sm:text-[32px]">
            <Link href={turntableHref(item.id)} prefetch className="underline-offset-4 hover:underline">
              {item.name}
            </Link>
          </h3>
          <p className="shrink-0 font-mono text-sm tabular-nums sm:text-base">{formatPrice(item.price * qty)}</p>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/45">
          {item.maker} · {driveLabel(item.drive)}
        </p>
        <p className="mt-2 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-paper/45 sm:block">
          {item.specs.join(" · ")}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mt-auto sm:pt-4">
          <div role="group" aria-label={`Quantity of ${item.name}`} className="flex h-9 items-center rounded-full border border-paper/20">
            <StepButton label={`One fewer ${item.name}`} disabled={qty <= 1} onClick={() => setQuantity(item.id, qty - 1)}>
              <MinusIcon size={14} />
            </StepButton>
            <output aria-live="polite" className="w-5 text-center font-mono text-sm tabular-nums">
              {qty}
            </output>
            <StepButton label={`One more ${item.name}`} disabled={qty >= MAX_QTY} onClick={() => setQuantity(item.id, qty + 1)}>
              <PlusIcon size={14} />
            </StepButton>
          </div>
          <button
            type="button"
            onClick={() => removeFromCart(item.id)}
            aria-label={`Remove ${item.name} from the cart`}
            className="h-9 px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-paper/55 underline-offset-4 transition hover:text-paper hover:underline"
          >
            Remove
          </button>
          {qty > 1 && <span className="font-mono text-[11px] tabular-nums text-paper/45">{formatPrice(item.price)} each</span>}
        </div>
      </div>
    </li>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full text-paper/70 transition hover:text-paper disabled:text-paper/20"
    >
      {children}
    </button>
  );
}

function Summary({ count, subtotal }: { count: number; subtotal: number }) {
  return (
    <aside aria-labelledby="cart-summary" className="lg:sticky lg:top-8 lg:self-start">
      <div className="rounded-[3px] bg-ink-2 p-6 ring-1 ring-paper/10 sm:p-8">
        <h2 id="cart-summary" className={KICKER}>
          Order summary
        </h2>
        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-paper/65">Subtotal · {plural(count)}</dt>
            <dd className="font-mono tabular-nums">{formatPrice(subtotal)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-paper/65">Shipping</dt>
            <dd className="text-paper/65">At checkout</dd>
          </div>
        </dl>
        <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-paper/15 pt-5">
          <span className="font-serif text-[28px] leading-none">Estimated total</span>
          <span className="font-mono text-lg tabular-nums">{formatPrice(subtotal)}</span>
        </div>
        <button
          type="button"
          disabled
          aria-describedby="checkout-note"
          className="mt-7 h-12 w-full bg-paper font-mono text-[11px] uppercase tracking-[0.2em] text-ink disabled:cursor-not-allowed disabled:bg-paper/15 disabled:text-paper/45"
        >
          Checkout
        </button>
        <p id="checkout-note" className="mt-3 text-xs leading-relaxed text-paper/50">
          Checkout isn&rsquo;t connected yet: these are sample listings.
        </p>
      </div>
    </aside>
  );
}

function EmptyCart() {
  return (
    <div className="mt-10 max-w-[46ch]">
      <p className="text-[17px] leading-relaxed text-paper/70">
        Nothing in here yet. Pick a deck from the catalogue, or put one on the 3D turntable and hear your record on it first.
      </p>
      <Link
        href="/#turntables"
        className="mt-9 inline-flex h-12 items-center gap-3 bg-cue px-6 font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-white transition hover:bg-cue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
      >
        Browse turntables
        <ArrowRightIcon size={16} />
      </Link>
    </div>
  );
}

/** Server-rendered stand-in until the browser has read the saved cart. */
export function CartSkeleton() {
  return (
    <div aria-busy="true" className={GRID}>
      <div>
        <p className={`border-b border-paper/15 pb-3 ${KICKER}`}>Loading the cart…</p>
        {[0, 1].map((i) => (
          <div key={i} className={ROW}>
            <div className="aspect-[4/3] rounded-[3px] bg-ink-2 ring-1 ring-paper/10" />
            <div className="space-y-3 pt-1">
              <div className="h-6 w-1/2 bg-paper/10" />
              <div className="h-2.5 w-1/3 bg-paper/5" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-72 rounded-[3px] bg-ink-2 ring-1 ring-paper/10" />
    </div>
  );
}
