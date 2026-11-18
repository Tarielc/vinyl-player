import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CartSkeleton, CartView } from "@/components/CartView";
import { ArrowLeftIcon } from "@/components/Icons";
import { PILL, SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Cart · Vinyl Player",
  description: "The turntables you picked from the catalogue.",
};

export default function CartPage() {
  return (
    <main className="relative isolate min-h-svh overflow-clip bg-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70svh] bg-[radial-gradient(55%_65%_at_18%_0%,rgb(201_140_78/0.16),transparent_72%)]"
      />

      <SiteHeader>
        <Link href="/#turntables" className={PILL}>
          <ArrowLeftIcon size={14} />
          Keep shopping
        </Link>
      </SiteHeader>

      <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-10 lg:px-10 lg:pt-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-paper/55">Cart · Prices in USD</p>
        <h1 className="mt-5 font-serif text-[clamp(56px,6vw,104px)] leading-[0.9] tracking-[-0.02em]">
          Your <em className="text-paper/85">cart.</em>
        </h1>

        <Suspense fallback={<CartSkeleton />}>
          <CartView />
        </Suspense>

        <p className="mt-20 border-t border-paper/15 pt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-paper/40">
          Vinyl / Player · Sample listings, not real products · Prices in USD
        </p>
      </div>

      <div aria-hidden="true" className="grain pointer-events-none fixed inset-0 z-40 opacity-[0.08]" />
    </main>
  );
}
