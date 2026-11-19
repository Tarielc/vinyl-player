import { MusicError, notConfigured, upstreamError } from "./errors";
import type { MusicProvider, TokenSet } from "./provider";
import { SAVED_PLAYLIST_ID, type Playlist, type Track } from "./types";

// Spotify Web API. Note the Feb 2026 Development Mode changes:
//  - playlist contents moved from /playlists/{id}/tracks to /playlists/{id}/items
//    and each entry's `track` field is now `item` (we accept both);
//  - playlist objects expose `items.total` instead of `tracks.total`;
//  - search `limit` is capped at 10;
//  - playlist contents are only returned for playlists the user owns or collaborates on.

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const NAME = "Spotify";
const SEARCH_LIMIT_MAX = 10;
const PAGE_SIZE = 50;
const MAX_PAGES = 4; // cap library reads at 200 tracks per request

const SCOPES = [
  "streaming", // Web Playback SDK
  "user-read-email", // required by the Web Playback SDK
  "user-read-private", // required by the Web Playback SDK
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
];

function credentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw notConfigured(NAME);
  return { clientId, clientSecret };
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await upstreamError(NAME, res);
    // A failed token exchange is never "upstream down"; it's a bad/expired grant.
    throw new MusicError(res.status >= 500 ? 502 : 400, "auth_failed", err.message);
  }
  const body = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

// App-level token (Client Credentials) so catalog search works without sign-in.
let appToken: TokenSet | null = null;
let appTokenPromise: Promise<TokenSet> | null = null;

async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt - 60_000 > Date.now()) return appToken.accessToken;
  appTokenPromise ??= tokenRequest({ grant_type: "client_credentials" }).finally(() => {
    appTokenPromise = null;
  });
  appToken = await appTokenPromise;
  return appToken.accessToken;
}

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) throw await upstreamError(NAME, res);
  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---- Response shapes (only fields we use) ----

interface SpImage {
  url: string;
  width?: number | null;
}
interface SpTrack {
  id: string | null;
  uri: string;
  type?: string;
  name: string;
  duration_ms: number;
  is_local?: boolean;
  artists: { name: string }[];
  album?: { name: string; images?: SpImage[] };
  external_urls?: { spotify?: string };
}
interface SpPaging<T> {
  items: T[];
  next: string | null;
  total?: number;
}
interface SpPlaylist {
  id: string;
  name: string;
  images?: SpImage[] | null;
  owner?: { display_name?: string };
  items?: { total?: number };
  tracks?: { total?: number };
}
interface SpPlaylistEntry {
  item?: SpTrack | null;
  track?: SpTrack | null;
}

/** Pick the image closest to ~300px wide (good for lists and the now-playing bar). */
function pickImage(images?: SpImage[] | null): string | undefined {
  if (!images?.length) return undefined;
  return [...images].sort(
    (a, b) => Math.abs((a.width ?? 300) - 300) - Math.abs((b.width ?? 300) - 300),
  )[0].url;
}

/** The largest image (share cards). */
function largestImage(images?: SpImage[] | null): string | undefined {
  return images?.length ? [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url : undefined;
}

function toTrack(t: SpTrack | null | undefined): Track | null {
  if (!t || !t.id || t.is_local || (t.type && t.type !== "track")) return null;
  return {
    provider: "spotify",
    id: t.id,
    uri: t.uri,
    title: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album?.name,
    artworkUrl: pickImage(t.album?.images),
    durationMs: t.duration_ms,
    externalUrl: t.external_urls?.spotify,
  };
}

async function collect<T>(firstPath: string, token: string, map: (item: T) => Track | null) {
  const tracks: Track[] = [];
  let next: string | null = firstPath;
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const data: SpPaging<T> = await api<SpPaging<T>>(next, token);
    for (const item of data.items) {
      const track = map(item);
      if (track) tracks.push(track);
    }
    next = data.next;
  }
  return tracks;
}

export const spotify: MusicProvider = {
  id: "spotify",
  name: NAME,
  notes: [
    "Playback in the browser requires a Spotify Premium account.",
    "Development-mode Spotify apps only allow users you add in the Spotify dashboard (max 5).",
  ],
  exposesClientToken: true,

  isSearchConfigured: () => Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
  isAuthConfigured: () => Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
  searchRequiresAuth: () => false,

  getAuthUrl(state, redirectUri) {
    const { clientId } = credentials();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
      state,
    });
    return `${ACCOUNTS}/authorize?${params}`;
  },

  exchangeCode: (code, redirectUri) =>
    tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),

  refresh: (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),

  async search(query, limit, session) {
    const token = session?.accessToken ?? (await getAppToken());
    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(Math.min(Math.max(limit, 1), SEARCH_LIMIT_MAX)),
    });
    const data = await api<{ tracks: SpPaging<SpTrack> }>(`/search?${params}`, token);
    return data.tracks.items.map(toTrack).filter((t): t is Track => t !== null);
  },

  async getTrack(id) {
    let t: SpTrack;
    try {
      t = await api<SpTrack>(`/tracks/${encodeURIComponent(id)}`, await getAppToken());
    } catch (err) {
      if (err instanceof MusicError && (err.status === 404 || err.status === 400)) return null;
      throw err;
    }
    const track = toTrack(t);
    return track && { ...track, coverUrl: largestImage(t.album?.images) };
  },

  async getPlaylists(session) {
    const data = await api<SpPaging<SpPlaylist>>(`/me/playlists?limit=${PAGE_SIZE}`, session.accessToken);
    const playlists: Playlist[] = data.items
      .filter(Boolean)
      .map((p) => ({
        provider: "spotify",
        id: p.id,
        name: p.name,
        artworkUrl: pickImage(p.images),
        trackCount: p.items?.total ?? p.tracks?.total,
        owner: p.owner?.display_name,
      }));
    return [{ provider: "spotify", id: SAVED_PLAYLIST_ID, name: "Liked Songs" }, ...playlists];
  },

  async getPlaylistTracks(id, session) {
    if (id === SAVED_PLAYLIST_ID) {
      return collect<{ track: SpTrack }>(`/me/tracks?limit=${PAGE_SIZE}`, session.accessToken, (e) =>
        toTrack(e.track),
      );
    }
    if (!/^[A-Za-z0-9]+$/.test(id)) throw new MusicError(400, "bad_request", "Invalid playlist id.");
    try {
      return await collect<SpPlaylistEntry>(
        `/playlists/${id}/items?limit=${PAGE_SIZE}&additional_types=track`,
        session.accessToken,
        (e) => toTrack(e.item ?? e.track),
      );
    } catch (err) {
      if (err instanceof MusicError && err.status === 403) {
        throw new MusicError(
          403,
          "playlist_restricted",
          "Spotify only exposes tracks of playlists you own or collaborate on.",
        );
      }
      throw err;
    }
  },

  async play(session, { deviceId, uri }) {
    if (!/^spotify:track:[A-Za-z0-9]+$/.test(uri)) {
      throw new MusicError(400, "bad_request", "Invalid Spotify track URI.");
    }
    const start = () =>
      api<void>(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, session.accessToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uris: [uri] }),
      });
    try {
      await start();
    } catch (err) {
      // A freshly created SDK device can take a moment to register with Spotify Connect.
      if (err instanceof MusicError && err.status === 404) {
        await new Promise((r) => setTimeout(r, 1000));
        await start();
        return;
      }
      if (err instanceof MusicError && err.status === 403) {
        throw new MusicError(403, "premium_required", "Spotify Premium is required for playback.");
      }
      throw err;
    }
  },
};
