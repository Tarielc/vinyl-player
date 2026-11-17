import { cacheLife } from "next/cache";
import { MusicError, notConfigured, upstreamError } from "./errors";
import type { MusicProvider, TokenSet } from "./provider";
import { SAVED_PLAYLIST_ID, type Playlist, type Track } from "./types";

// YouTube Data API v3.
//  - Search works with just YOUTUBE_API_KEY (search.list costs 100 of the
//    10,000 daily quota units, so keyed searches are cached for an hour).
//  - Library access (playlists, liked videos) needs Google OAuth with the
//    youtube.readonly scope.
// Videos the IFrame player would refuse to play are filtered out: not
// embeddable, not syndicated (youtube.com only), age-restricted, or blocked in
// YOUTUBE_REGION (optional). Labels can still block embeds at play time, which
// the API doesn't report; the client player skips those (error 101/150).

const API = "https://www.googleapis.com/youtube/v3";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const NAME = "YouTube";
const MUSIC_CATEGORY = "10";
const MAX_RESULTS = 25;
// search.list costs 100 units regardless of maxResults, so over-fetch to
// leave enough results after filtering out unplayable videos.
const SEARCH_FETCH_MAX = 50;

/** Optional ISO 3166-1 alpha-2 code (e.g. "US") used to drop region-blocked videos. */
function region(): string | undefined {
  const r = process.env.YOUTUBE_REGION?.trim().toUpperCase();
  return r && /^[A-Z]{2}$/.test(r) ? r : undefined;
}

type Auth = { token: string } | { key: string };

function oauthCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw notConfigured(NAME, "Google OAuth credentials");
  return { clientId, clientSecret };
}

async function api<T>(path: string, params: Record<string, string>, auth: Auth): Promise<T> {
  const qs = new URLSearchParams(params);
  if ("key" in auth) qs.set("key", auth.key);
  const res = await fetch(`${API}${path}?${qs}`, {
    headers: "token" in auth ? { Authorization: `Bearer ${auth.token}` } : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await upstreamError(NAME, res);
    if (res.status === 403 && /quota/i.test(err.message)) {
      throw new MusicError(429, "quota_exceeded", "YouTube API daily quota exceeded.");
    }
    throw err;
  }
  return (await res.json()) as T;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const { clientId, clientSecret } = oauthCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await upstreamError(NAME, res);
    throw new MusicError(res.status >= 500 ? 502 : 400, "auth_failed", err.message);
  }
  const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

// ---- Response shapes (only fields we use) ----

interface YtThumbs {
  default?: { url: string };
  medium?: { url: string };
  high?: { url: string };
}
interface YtVideo {
  id: string;
  snippet: { title: string; channelTitle: string; thumbnails?: YtThumbs };
  contentDetails?: {
    duration?: string;
    contentRating?: { ytRating?: string };
    regionRestriction?: { allowed?: string[]; blocked?: string[] };
  };
  status?: { embeddable?: boolean; privacyStatus?: string };
}
interface YtList<T> {
  items: T[];
  nextPageToken?: string;
}

/** ISO-8601 duration (PT#H#M#S) → milliseconds. */
function parseDuration(iso?: string): number | undefined {
  const m = iso?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return undefined;
  const [, d = "0", h = "0", min = "0", s = "0"] = m;
  return (((+d * 24 + +h) * 60 + +min) * 60 + +s) * 1000;
}

function thumb(t?: YtThumbs) {
  return t?.medium?.url ?? t?.high?.url ?? t?.default?.url;
}

/** False for videos the embedded player is known to refuse. */
function isPlayable(v: YtVideo): boolean {
  if (v.status && v.status.embeddable === false) return false;
  if (v.status?.privacyStatus === "private") return false;
  // Age-restricted videos require sign-in on youtube.com and fail when embedded.
  if (v.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") return false;
  const r = region();
  const rr = v.contentDetails?.regionRestriction;
  if (r && rr) {
    if (rr.allowed && !rr.allowed.includes(r)) return false;
    if (rr.blocked?.includes(r)) return false;
  }
  return true;
}

function toTrack(v: YtVideo): Track | null {
  if (!isPlayable(v)) return null;
  return {
    provider: "youtube",
    id: v.id,
    uri: `youtube:video:${v.id}`,
    title: v.snippet.title,
    // "Artist - Topic" channels are YouTube's auto-generated artist channels.
    artists: [v.snippet.channelTitle.replace(/ - Topic$/, "")],
    artworkUrl: thumb(v.snippet.thumbnails),
    durationMs: parseDuration(v.contentDetails?.duration),
    externalUrl: `https://www.youtube.com/watch?v=${v.id}`,
  };
}

/** Hydrate video ids with snippet/duration/embeddable (videos.list costs 1 unit). */
async function videosById(ids: string[], auth: Auth): Promise<Track[]> {
  const tracks: Track[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    if (!chunk.length) continue;
    const data = await api<YtList<YtVideo>>(
      "/videos",
      { part: "snippet,contentDetails,status", id: chunk.join(","), maxResults: "50" },
      auth,
    );
    const byId = new Map(data.items.map((v) => [v.id, v]));
    for (const id of chunk) {
      const v = byId.get(id);
      const t = v && toTrack(v);
      if (t) tracks.push(t);
    }
  }
  return tracks;
}

async function searchVideos(query: string, limit: number, auth: Auth): Promise<Track[]> {
  const r = region();
  const data = await api<YtList<{ id: { videoId?: string } }>>(
    "/search",
    {
      part: "id",
      type: "video",
      videoCategoryId: MUSIC_CATEGORY,
      videoEmbeddable: "true",
      videoSyndicated: "true", // playable outside youtube.com
      maxResults: String(Math.min(limit * 2, SEARCH_FETCH_MAX)),
      q: query,
      ...(r ? { regionCode: r } : {}),
    },
    auth,
  );
  const ids = data.items.map((i) => i.id.videoId).filter((id): id is string => Boolean(id));
  return (await videosById(ids, auth)).slice(0, limit);
}

/** API-key searches are identical for every user, so cache them to save quota. */
async function cachedKeySearch(query: string, limit: number): Promise<Track[]> {
  "use cache";
  cacheLife("hours");
  return searchVideos(query, limit, { key: process.env.YOUTUBE_API_KEY! });
}

export const youtube: MusicProvider = {
  id: "youtube",
  name: NAME,
  notes: [
    "Search uses the YouTube Data API key (about 100 searches per day on the free quota).",
    "Sign in with Google to browse your playlists and liked videos.",
  ],
  exposesClientToken: false,

  isSearchConfigured: () =>
    Boolean(process.env.YOUTUBE_API_KEY) || youtube.isAuthConfigured(),
  isAuthConfigured: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  searchRequiresAuth: () => !process.env.YOUTUBE_API_KEY,

  getAuthUrl(state, redirectUri) {
    const { clientId } = oauthCredentials();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline", // get a refresh token
      prompt: "consent", // always return a refresh token, even on re-consent
      include_granted_scopes: "true",
      state,
    });
    return `${AUTH_URL}?${params}`;
  },

  exchangeCode: (code, redirectUri) =>
    tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),

  refresh: (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),

  async search(query, limit, session) {
    const n = Math.min(Math.max(limit, 1), MAX_RESULTS);
    if (process.env.YOUTUBE_API_KEY) return cachedKeySearch(query, n);
    if (session) return searchVideos(query, n, { token: session.accessToken });
    throw new MusicError(401, "not_connected", "Sign in with Google to search YouTube.");
  },

  async getPlaylists(session) {
    const data = await api<
      YtList<{
        id: string;
        snippet: { title: string; channelTitle?: string; thumbnails?: YtThumbs };
        contentDetails?: { itemCount?: number };
      }>
    >("/playlists", { part: "snippet,contentDetails", mine: "true", maxResults: "50" }, {
      token: session.accessToken,
    });
    const playlists: Playlist[] = data.items.map((p) => ({
      provider: "youtube",
      id: p.id,
      name: p.snippet.title,
      artworkUrl: thumb(p.snippet.thumbnails),
      trackCount: p.contentDetails?.itemCount,
      owner: p.snippet.channelTitle,
    }));
    return [{ provider: "youtube", id: SAVED_PLAYLIST_ID, name: "Liked videos" }, ...playlists];
  },

  async getPlaylistTracks(id, session) {
    const auth: Auth = { token: session.accessToken };
    if (id === SAVED_PLAYLIST_ID) {
      const data = await api<YtList<YtVideo>>(
        "/videos",
        { part: "snippet,contentDetails,status", myRating: "like", maxResults: "50" },
        auth,
      );
      return data.items.map(toTrack).filter((t): t is Track => t !== null);
    }
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new MusicError(400, "bad_request", "Invalid playlist id.");

    const ids: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 4; page++) {
      const data: YtList<{ contentDetails: { videoId: string } }> = await api(
        "/playlistItems",
        {
          part: "contentDetails",
          playlistId: id,
          maxResults: "50",
          ...(pageToken ? { pageToken } : {}),
        },
        auth,
      );
      ids.push(...data.items.map((i) => i.contentDetails.videoId));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return videosById(ids, auth);
  },
};
