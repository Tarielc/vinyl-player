// Shared, client-safe types for the music picker. Every provider normalizes
// its API responses into these shapes so the UI never sees provider-specific data.

export type ProviderId = "spotify" | "youtube";

export const PROVIDER_IDS: readonly ProviderId[] = ["spotify", "youtube"];

export interface Track {
  provider: ProviderId;
  /** Provider-native id (Spotify track id, YouTube video id). */
  id: string;
  /** Provider-native playable URI (e.g. `spotify:track:…`, `youtube:video:…`). */
  uri: string;
  title: string;
  artists: string[];
  album?: string;
  artworkUrl?: string;
  durationMs?: number;
  externalUrl?: string;
}

export interface Playlist {
  provider: ProviderId;
  id: string;
  name: string;
  artworkUrl?: string;
  trackCount?: number;
  owner?: string;
}

/** Id of the virtual playlist that holds a user's saved / liked tracks. */
export const SAVED_PLAYLIST_ID = "saved";

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  /** Search is available (credentials present). */
  searchAvailable: boolean;
  /** OAuth sign-in is available (client id/secret present). */
  authAvailable: boolean;
  /** The current visitor has a session for this provider. */
  connected: boolean;
  /** Search only works after the user signs in. */
  searchRequiresAuth: boolean;
  /** Notes shown in the UI (e.g. Premium requirement). */
  notes: string[];
}

export interface ApiError {
  error: string;
  code: string;
}
