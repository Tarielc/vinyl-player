import { cacheLife } from "next/cache";
import { getProvider } from "./registry";
import { isShareable } from "./share";
import type { Track } from "./types";

/** Cached per track: link previews and repeat visits don't spend API quota. Throws on upstream failure. */
async function lookup(provider: string, id: string): Promise<Track | null> {
  "use cache";
  cacheLife("days");
  return getProvider(provider).getTrack(id);
}

/** The track a share link points at, or null when the link is malformed, the track is gone, or the lookup failed. */
export async function getSharedTrack(provider: string, id: string): Promise<Track | null> {
  if (!isShareable(provider, id)) return null;
  try {
    return await lookup(provider, id);
  } catch (err) {
    // Not cached, so the next visit tries again.
    console.warn(`[share] ${provider}:${id} lookup failed`, err);
    return null;
  }
}
