// Record preferences (how records are pressed, needle sounds), kept in localStorage and shared
// across tabs. Client-only; read them with useRecordPrefs().

import { useSyncExternalStore } from "react";
import type { DiscStyle } from "./stage";

export interface RecordPrefs {
  disc: DiscStyle;
  /** Crackle, needle drop and run-out sounds. */
  sounds: boolean;
}

export const DISC_STYLES: readonly { id: DiscStyle; name: string }[] = [
  { id: "black", name: "Black" },
  { id: "colour", name: "Colour" },
  { id: "picture", name: "Picture" },
];

const KEY = "vinyl-player:record";
const DEFAULTS: RecordPrefs = Object.freeze({ disc: "black", sounds: true });

let prefs: RecordPrefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

/** Ignores anything unexpected, so stale or hand-edited storage can't break the page. */
function parse(raw: string | null): RecordPrefs {
  if (!raw) return DEFAULTS;
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof RecordPrefs, unknown>>;
    return {
      disc: DISC_STYLES.some((d) => d.id === data.disc) ? (data.disc as DiscStyle) : DEFAULTS.disc,
      sounds: typeof data.sounds === "boolean" ? data.sounds : DEFAULTS.sounds,
    };
  } catch {
    return DEFAULTS;
  }
}

function getSnapshot(): RecordPrefs {
  if (!loaded) {
    loaded = true;
    try {
      prefs = parse(localStorage.getItem(KEY));
    } catch {
      prefs = DEFAULTS;
    }
  }
  return prefs;
}

const getServerSnapshot = () => DEFAULTS;

function emit() {
  listeners.forEach((l) => l());
}

function onStorage(e: StorageEvent) {
  if (e.key !== null && e.key !== KEY) return;
  loaded = true;
  prefs = parse(e.newValue);
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

export function setRecordPrefs(patch: Partial<RecordPrefs>) {
  prefs = { ...getSnapshot(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or blocked: the setting still applies until the page is reloaded.
  }
  emit();
}

export function useRecordPrefs(): RecordPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
