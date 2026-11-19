import type { Playlist, ProviderId, Track } from "./types";

/** OAuth tokens as stored in the encrypted session cookie. */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/**
 * Server-side contract every music source implements. Adding a new source
 * (e.g. Apple Music) means implementing this and registering it in registry.ts.
 */
export interface MusicProvider {
  id: ProviderId;
  name: string;
  notes: string[];

  /** Credentials for catalog search are present. */
  isSearchConfigured(): boolean;
  /** Credentials for user OAuth are present. */
  isAuthConfigured(): boolean;
  /** Search needs a signed-in user (no app-level credentials available). */
  searchRequiresAuth(): boolean;

  getAuthUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;

  search(query: string, limit: number, session: TokenSet | null): Promise<Track[]>;
  /** One track by id, without a user session (shared links). Null when it doesn't exist or can't play here. */
  getTrack(id: string): Promise<Track | null>;
  getPlaylists(session: TokenSet): Promise<Playlist[]>;
  /** `id` may be SAVED_PLAYLIST_ID for saved / liked tracks. */
  getPlaylistTracks(id: string, session: TokenSet): Promise<Track[]>;

  /** If true, the access token may be handed to the browser (needed by client SDKs). */
  exposesClientToken: boolean;
  /** Server-assisted playback start (Spotify Connect). Optional. */
  play?(session: TokenSet, body: { deviceId: string; uri: string }): Promise<void>;
}
