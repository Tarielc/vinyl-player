# Vinyl Player

A Next.js app with a "Choose music" window that searches and plays music from **Spotify** and **YouTube**, including each user's own playlists and liked tracks.

## Setup

1. `cp .env.example .env.local` and fill it in (see comments in the file).
2. **Spotify** ([dashboard](https://developer.spotify.com/dashboard)): create an app, enable *Web API* and *Web Playback SDK*, and add the redirect URI `http://127.0.0.1:3000/api/music/spotify/callback`. Under *User Management*, add the Spotify accounts that will sign in (development-mode apps allow up to 5).
3. **YouTube** ([Google Cloud console](https://console.cloud.google.com/apis/credentials)): enable *YouTube Data API v3* and create an API key for search. For library access, also create an OAuth client (type *Web application*) with the redirect URI `http://127.0.0.1:3000/api/music/youtube/callback`, and add yourself as a test user on the OAuth consent screen.
4. `npm run dev`, then open **http://127.0.0.1:3000**. Use `127.0.0.1`, not `localhost`: Spotify rejects `localhost` redirect URIs, and the session cookies are tied to the host.

A provider without credentials shows as unavailable in the picker.

## Requirements and limits

| | Search | Library | Playback |
|---|---|---|---|
| Spotify | App credentials (no sign-in needed), max 10 results | Sign in | Web Playback SDK, **Premium required** |
| YouTube | API key (~100 searches/day free quota, cached 1h) | Google sign-in | IFrame player (must stay visible) |

## API

All routes live under `/api/music`. Errors are returned as `{ error, code }`.

| Route | |
|---|---|
| `GET /providers` | Configured/connected status per provider |
| `GET /:provider/login` → `/:provider/callback` | OAuth sign-in (state-checked) |
| `POST /:provider/logout` | Clear the session |
| `GET /:provider/search?q=&limit=` | Normalized `Track[]` |
| `GET /:provider/playlists` | `Playlist[]` (first entry is the virtual `saved` playlist) |
| `GET /:provider/playlists/:id` | `Track[]` |
| `GET /spotify/token` | Short-lived access token for the Web Playback SDK |
| `POST /spotify/play` `{deviceId, uri}` | Start playback on the browser device |

Provider tokens are stored in AES-256-GCM-encrypted, httpOnly cookies (`SESSION_SECRET`). No database is needed.

## The 3D deck

The home page is a hero built around a Three.js turntable (`lib/vinyl/`, mounted by `components/VinylCanvas.tsx`). Drag to orbit, scroll or pinch to zoom, and click the record to play or pause (Space works too).

When a track loads, its cover is drawn onto the record label (with the title running round the rim), the platter spins up to 33⅓ rpm and the tonearm lifts, swings to the lead-in and lowers. While playing, the arm tracks the position across the side. Pausing lifts the arm, and switching tracks parks it, changes the label and cues the new record. At the end of a track, the next one in the list plays.

Models live in `public/models/` (copied from `E:\BLENDER`). `lib/vinyl/skins.ts` maps each file's node names onto the rig:

| Deck | File | Notes |
|---|---|---|
| Walnut (default) | `Vinyl3.glb` | Arm angles from the model's glTF extras |
| Console | `Vinyl1.glb` | Volume knob follows the volume |
| Minimal | `Vinyl2.glb` | Label is a material inside the disc mesh |

To add a deck, export a .glb whose tonearm origin sits on its pivot, copy it to `public/models/`, and add an entry with its spinning nodes, label and arm angles (degrees about the pivot, measured from the arm's pose in the file).

## Code layout

- `lib/music/`: server providers (`spotify.ts`, `youtube.ts`) behind the `MusicProvider` interface (`provider.ts`), plus the registry, the session cookies, and the shared `types.ts`.
- `lib/players/`: browser playback adapters (Spotify SDK, YouTube IFrame) behind `PlayerAdapter`, and the `usePlayer` hook.
- `lib/vinyl/`: the Three.js stage (`stage.ts`), label drawing (`label.ts`) and the deck configs (`skins.ts`).
- `components/`: `MusicApp` (the hero), `VinylCanvas`, `NowPlaying` (credits and transport), `Crate` (the queue as tabbed dividers), `MusicPicker` (the modal), `TrackList`.

To add a provider (e.g. Apple Music), implement `MusicProvider` and `PlayerAdapter`, then register it in `lib/music/registry.ts`, `lib/music/types.ts` and `lib/players/usePlayer.ts`.
