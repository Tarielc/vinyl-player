"use client";

import Link from "next/link";
import { cartCount, useCart } from "@/lib/shop/cart";
import { BagIcon } from "@/components/icons";

/** Header link to /cart with the number of turntables in it. */
export function CartLink({ className = "" }: { className?: string }) {
  const count = cartCount(useCart());
  return (
    <Link
      href="/cart"
      aria-label={count ? `Cart, ${count} ${count === 1 ? "turntable" : "turntables"}` : "Cart"}
      className={`inline-flex h-9 items-center gap-2 rounded-full border border-paper/20 px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/80 backdrop-blur transition hover:border-paper/50 hover:text-paper sm:px-4 ${className}`}
    >
      <BagIcon size={14} />
      <span className="hidden sm:inline">Cart</span>
      {count > 0 && (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-paper px-1 text-[9px] tracking-normal text-ink tabular-nums">
          {count}
        </span>
      )}
    </Link>
  );
}
