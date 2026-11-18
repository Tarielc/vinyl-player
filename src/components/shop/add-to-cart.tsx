"use client";

import Link from "next/link";
import { addToCart, removeFromCart, useCart } from "@/lib/shop/cart";
import { ArrowRightIcon } from "@/components/icons";

/** Product-page cart control: add it, or go to the cart once it's in. */
export function AddToCart({ id, name }: { id: string; name: string }) {
  const qty = useCart()[id] ?? 0;

  if (!qty) {
    return (
      <button
        type="button"
        onClick={() => addToCart(id)}
        className="inline-flex h-12 items-center gap-3 bg-paper px-6 font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-ink transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
      >
        Add to cart
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <Link
        href="/cart"
        className="inline-flex h-12 items-center gap-3 border border-paper/40 px-6 font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-paper transition hover:border-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
      >
        {qty > 1 ? `${qty} in cart` : "In cart"} · View cart
        <ArrowRightIcon size={16} />
      </Link>
      <button
        type="button"
        onClick={() => removeFromCart(id)}
        aria-label={`Remove ${name} from the cart`}
        className="h-12 font-mono text-[11px] uppercase tracking-[0.2em] text-paper/55 underline-offset-4 transition hover:text-paper hover:underline"
      >
        Remove
      </button>
    </div>
  );
}
