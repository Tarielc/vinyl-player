// Share links: /listen/<provider>/<id>?deck=<skin> opens the site with that record on that deck.
// Client-safe; the server looks the track up in shared-track.ts.

import type { SkinId } from "@/lib/vinyl/skins";
import type { ProviderId, Track } from "./types";

/** What a track id looks like per provider, so a link can't be used to ask for anything else. */
const ID_PATTERN: Record<ProviderId, RegExp> = {
  spotify: /^[A-Za-z0-9]{22}$/,
  youtube: /^[A-Za-z0-9_-]{11}$/,
};

export function isShareable(provider: string, id: string): provider is ProviderId {
  return Object.hasOwn(ID_PATTERN, provider) && ID_PATTERN[provider as ProviderId].test(id);
}

export function sharePath(track: Pick<Track, "provider" | "id">, deck?: SkinId): string {
  const path = `/listen/${track.provider}/${encodeURIComponent(track.id)}`;
  return deck ? `${path}?deck=${deck}` : path;
}

/** `path` if it's somewhere sign-in may send people back to (a share link), else undefined. */
export function safeReturnPath(path: string | null | undefined): string | undefined {
  const m = path?.match(/^\/listen\/([a-z]+)\/([A-Za-z0-9_-]+)(?:\?deck=[a-z]{1,16})?$/);
  return m && isShareable(m[1], m[2]) ? path! : undefined;
}

/** Who can play a shared record. */
export function playsFor(provider: ProviderId): string {
  return provider === "spotify" ? "Plays in full with Spotify Premium" : "Plays for anyone, from YouTube";
}
