// The shopping cart: turntable id → quantity, kept in localStorage so it survives
// reloads and is shared by the shop on the home page and the /cart page.
// Client-only; read it with useCart().

import { useSyncExternalStore } from "react";
import { CATALOG, type Turntable } from "./catalog";

export type Cart = Readonly<Record<string, number>>;

export interface CartLine {
  item: Turntable;
  qty: number;
}

export const MAX_QTY = 9;

const KEY = "vinyl-player:cart";
const EMPTY: Cart = Object.freeze({});
const BY_ID = new Map(CATALOG.map((t) => [t.id, t]));

let cart: Cart = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

/** Drops unknown ids and bad quantities, so stale or hand-edited storage can't break the page. */
function parse(raw: string | null): Cart {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return EMPTY;
    const next: Record<string, number> = {};
    for (const [id, qty] of Object.entries(data)) {
      if (BY_ID.has(id) && Number.isInteger(qty) && qty > 0) next[id] = Math.min(qty, MAX_QTY);
    }
    return Object.keys(next).length ? next : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): Cart {
  if (!loaded) {
    loaded = true;
    try {
      cart = parse(localStorage.getItem(KEY));
    } catch {
      cart = EMPTY;
    }
  }
  return cart;
}

const getServerSnapshot = () => EMPTY;

function emit() {
  listeners.forEach((l) => l());
}

// Another tab changed the cart.
function onStorage(e: StorageEvent) {
  if (e.key !== null && e.key !== KEY) return;
  loaded = true;
  cart = parse(e.newValue);
  emit();
}

function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

function write(next: Cart) {
  cart = Object.keys(next).length ? next : EMPTY;
  try {
    if (cart === EMPTY) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(cart));
  } catch {
    // Private mode or storage full: the cart still works until the tab closes.
  }
  emit();
}

/** The cart. Empty during server rendering and hydration, then the saved one. */
export function useCart(): Cart {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Sets a line's quantity; 0 removes it. */
export function setQuantity(id: string, qty: number) {
  if (!BY_ID.has(id) || Number.isNaN(qty)) return;
  const n = Math.min(MAX_QTY, Math.max(0, Math.floor(qty)));
  const next: Record<string, number> = { ...getSnapshot() };
  if (n) next[id] = n;
  else delete next[id];
  write(next);
}

export const addToCart = (id: string) => setQuantity(id, (getSnapshot()[id] ?? 0) + 1);
export const removeFromCart = (id: string) => setQuantity(id, 0);
export const clearCart = () => write(EMPTY);

/** Lines in the order they were added. */
export const cartLines = (c: Cart): CartLine[] =>
  Object.entries(c).flatMap(([id, qty]) => {
    const item = BY_ID.get(id);
    return item ? [{ item, qty }] : [];
  });

export const cartCount = (c: Cart) => Object.values(c).reduce((n, q) => n + q, 0);

export const cartSubtotal = (c: Cart) => cartLines(c).reduce((sum, { item, qty }) => sum + item.price * qty, 0);
