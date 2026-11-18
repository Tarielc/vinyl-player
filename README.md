# Vinyl Player

A Next.js app that plays music from **Spotify** and **YouTube** on a 3D turntable. A "Choose music" window searches both, including each user's own playlists and liked tracks; the cover goes on the record label, the platter spins and the arm drops. Below the deck is a small (placeholder) turntable shop with product pages and a cart.

## Setup

1. `cp .env.example .env.local` and fill it in (see comments in the file).
2. **Spotify** ([dashboard](https://developer.spotify.com/dashboard)): create an app, enable *Web API* and *Web Playback SDK*, and add the redirect URI `http://127.0.0.1:3000/api/music/spotify/callback`. Under *User Management*, add the Spotify accounts that will sign in (development-mode apps allow up to 5).
3. **YouTube** ([Google Cloud console](https://console.cloud.google.com/apis/credentials)): enable *YouTube Data API v3* and create an API key for search. For library access, also create an OAuth client (type *Web application*) with the redirect URI `http://127.0.0.1:3000/api/music/youtube/callback`, and add yourself as a test user on the OAuth consent screen.
4. `npm run dev`, then open **http://127.0.0.1:3000**. Use `127.0.0.1`, not `localhost`: Spotify rejects `localhost` redirect URIs, and the session cookies are tied to the host.

A provider without credentials shows as unavailable in the picker. Set the optional `YOUTUBE_REGION` (a 2-letter country code) to hide YouTube results that are blocked in that region.

Other scripts: `npm run build`, `npm start`, `npm run lint`.

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

## Pages

| Route | |
|---|---|
| `/` | The deck, the music picker and the turntable listings |
| `/turntables/[id]` | One listing, prerendered for each catalogue entry. Shows the deck in 3D when the listing has a model, otherwise its drawing |
| `/cart` | The cart, saved in `localStorage` and kept in sync across tabs |

Playback keeps going from page to page. The player lives in a `PlayerProvider` in the root layout rather than in the home page, because with `cacheComponents` Next hides the page on navigation and runs its effect cleanups, which would destroy the Spotify and YouTube players. The YouTube frame never moves in the DOM (moving an iframe reloads it): it is laid over a slot in the home hero, or floats in a corner on other pages, where the now-playing bar links back to the deck.

## The 3D deck

The home page is a hero built around a Three.js turntable (`src/lib/vinyl/`, mounted by `src/components/vinyl/vinyl-canvas.tsx`). Drag to orbit, pinch (or Ctrl+scroll) to zoom, and click the record to play or pause (Space works too).

When a track loads, its cover is drawn onto the record label (with the title running round the rim), the platter spins up to 33⅓ rpm and the tonearm lifts, swings to the lead-in and lowers. While playing, the arm tracks the position across the side. Pausing lifts the arm, and switching tracks parks it, lifts the record off the platter, slides it away and brings the new one back on. At the end of a track, the next one in the list plays.

- **Tonearm by hand.** Drag the arm over the record and let go to play from there (a readout shows where it will land). Let go over its rest to stop; play again and it swings back.
- **Pressing.** Under the transport: *Black*, *Colour* (the cover's main colour, or a classic shade when the cover is grey or missing) or *Picture* (the cover across the whole record). Saved in `localStorage` with the needle-sounds setting (`src/lib/vinyl/prefs.ts`).
- **Needle sounds.** Surface crackle while the stylus is in the groove, a thump when it lands, a click when it lifts and the run-out groove's tick in the last seconds of a side. They are synthesized with Web Audio (`src/lib/vinyl/needle-sounds.ts`) and follow the stage's needle events, at the player's volume. The music itself can't be mixed: the Spotify SDK and the YouTube frame don't expose their audio.
- **The crate.** The queue is a row of sleeves in a crate; hover one to stand it up, click to play it. The playing record slides up out of its sleeve as it goes to the deck.

Scrolling past the hero: on wide screens the deck slides into the left column and keeps spinning (and tracking) there while the turntable listings scroll on the right. On phones it scrolls away with the hero and a small spinning record stays in the now-playing bar. The plain mouse wheel scrolls the page; pinch (or Ctrl+wheel) zooms the deck.

The listings are placeholder data in `src/lib/shop/catalog.ts`. The four that have a 3D model can be put on the deck with "Try it on the deck".

Models live in `public/models/`. `src/lib/vinyl/skins.ts` maps each file's node names onto the rig:

| Deck | File | Notes |
|---|---|---|
| Walnut (default) | `Vinyl3.glb` | Arm angles from the model's glTF extras |
| Console | `Vinyl1.glb` | Volume knob follows the volume |
| Stave | `Crosley_Stave.glb` | Lid opened by holding the `Lid_Open` clip's last frame; volume knob follows the volume |
| Minimal | `Vinyl2.glb` | Label is a material inside the disc mesh |

To add a deck, export a .glb whose tonearm origin sits on its pivot, copy it to `public/models/`, and add an entry with its spinning nodes, label, record (the vinyl's material, and the node holding the whole record if there is one) and arm angles (degrees about the pivot, measured from the arm's pose in the file). To sell it, set `skin` on a listing in `catalog.ts`.

## Code layout

Application code lives in `src/`; config files and `public/` stay at the root. The `@/` import alias points at `src/`. Files are named in kebab-case.

```
src/
  app/                 routes only: pages, layouts, API route handlers, metadata icons, globals.css
  components/
    icons.tsx          shared SVG icons
    site-header.tsx    header for the pages other than home
    music/             the player provider, the home hero and the player UI
    shop/              listings, cart and turntable art
    vinyl/             the 3D canvas and the product-page viewer
  lib/
    music/             server-side music providers and sessions
    players/           browser playback adapters
    shop/              catalogue and the localStorage cart
    vinyl/             the Three.js stage
  types/               ambient typings for the Spotify and YouTube SDKs
```

- `src/lib/music/`: server providers (`spotify.ts`, `youtube.ts`) behind the `MusicProvider` interface (`provider.ts`), plus the registry, the session cookies, and the shared `types.ts`.
- `src/lib/players/`: browser playback adapters (Spotify SDK, YouTube IFrame) behind `PlayerAdapter`, and the `usePlayer` hook (`use-player.ts`).
- `src/lib/vinyl/`: the Three.js stage (`stage.ts`), label and picture-disc drawing (`label.ts`), the deck configs (`skins.ts`), needle sounds (`needle-sounds.ts`) and the saved pressing / sound settings (`prefs.ts`).
- `src/components/music/`: `PlayerProvider` (owns playback and the YouTube frame; mounted in the root layout), `MusicApp` (the hero), `NowPlaying` (credits and transport), `RecordOptions` (pressing and needle sounds), `SleeveCrate` (the queue as sleeves in a crate), `DockedPlayer` (the now-playing bar after the hero and on other pages), `MusicPicker` (the modal), `TrackList`.
- `src/components/shop/`: `Shop` (turntables for sale), `CartView`, `CartLink`, `AddToCart`, `TurntableArt`.
- `src/components/vinyl/`: `VinylCanvas` (mounts the stage) and `TurntableViewer` (the deck on a product page).

To add a provider (e.g. Apple Music), implement `MusicProvider` and `PlayerAdapter`, then register it in `src/lib/music/registry.ts`, `src/lib/music/types.ts` and `src/lib/players/use-player.ts`.
