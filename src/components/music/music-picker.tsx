"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/music/client";
import type { Playlist, ProviderId, ProviderStatus, Track } from "@/lib/music/types";
import { CloseIcon } from "@/components/icons";
import { TrackList } from "./track-list";

const chip =
  "rounded-full border border-ink/25 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition hover:border-ink hover:bg-ink hover:text-paper";

type Mode = "search" | "library";

/** Result of an async load, tagged with the request key it belongs to. */
interface Loaded<T> {
  key: string;
  data?: T;
  error?: string;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Request failed.");

/**
 * Loads `url` whenever `key` changes (empty key = don't load). Results are tagged
 * with their key, so stale responses are ignored and "loading" is derived.
 */
function useKeyedFetch<T>(key: string, url: string, delayMs = 0) {
  const [state, setState] = useState<Loaded<T>>({ key: "" });
  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<T>(url, { signal: ctrl.signal })
        .then((data) => setState({ key, data }))
        .catch((e) => !ctrl.signal.aborted && setState({ key, error: errMsg(e) }));
    }, delayMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, url, delayMs]);
  const current = state.key === key ? state : undefined;
  return { data: current?.data, error: current?.error, loading: Boolean(key) && !current };
}

export function MusicPicker({
  open,
  onClose,
  onPick,
  initialProvider = "spotify",
}: {
  open: boolean;
  onClose: () => void;
  /** `list` is the search result / playlist the track was picked from. */
  onPick: (track: Track, list: Track[]) => void;
  initialProvider?: ProviderId;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [active, setActive] = useState<ProviderId>(initialProvider);
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [playlist, setPlaylist] = useState<Playlist | null>(null);

  // Sync the native <dialog> with the `open` prop.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Refresh provider status every time the window opens (or after connect/disconnect).
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    apiFetch<ProviderStatus[]>("/api/music/providers", { signal: ctrl.signal })
      .then((p) => {
        setProviders(p);
        setProvidersError(null);
      })
      .catch((e) => !ctrl.signal.aborted && setProvidersError(errMsg(e)));
    return () => ctrl.abort();
  }, [open, reload]);

  const status = providers?.find((p) => p.id === active);
  const canSearch = Boolean(status?.searchAvailable && (!status.searchRequiresAuth || status.connected));
  const q = query.trim();

  const search = useKeyedFetch<Track[]>(
    open && canSearch && mode === "search" && q ? `${active}|${q}` : "",
    `/api/music/${active}/search?${new URLSearchParams({ q, limit: "10" })}`,
    350,
  );
  const playlists = useKeyedFetch<Playlist[]>(
    open && mode === "library" && status?.connected ? `${active}|playlists|${reload}` : "",
    `/api/music/${active}/playlists`,
  );
  const playlistTracks = useKeyedFetch<Track[]>(
    open && mode === "library" && status?.connected && playlist?.provider === active
      ? `${active}|${playlist.id}|${reload}`
      : "",
    `/api/music/${active}/playlists/${encodeURIComponent(playlist?.id ?? "")}`,
  );

  function selectProvider(id: ProviderId) {
    setActive(id);
    setPlaylist(null);
  }

  async function disconnect() {
    await apiFetch(`/api/music/${active}/logout`, { method: "POST" }).catch(() => {});
    setPlaylist(null);
    setReload((n) => n + 1);
  }

  function pick(track: Track, list: Track[]) {
    onPick(track, list);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="stock m-auto w-[calc(100%-2rem)] [color-scheme:light] max-w-2xl rounded-[3px] bg-sand p-0 text-ink shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop:bg-ink/70 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[82vh] flex-col">
        <header className="flex items-end justify-between px-6 pb-4 pt-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">The crate</p>
            <h2 className="mt-1 font-serif text-4xl leading-none">Choose a record</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/60 hover:text-ink"
            aria-label="Close"
          >
            Close <CloseIcon size={14} />
          </button>
        </header>

        {/* Provider tabs */}
        <nav className="flex gap-1 border-b border-ink/15 px-6">
          {(providers ?? []).map((p) => {
            const unavailable = !p.searchAvailable && !p.authAvailable;
            return (
              <button
                key={p.id}
                type="button"
                disabled={unavailable}
                onClick={() => selectProvider(p.id)}
                title={unavailable ? "Missing credentials on the server" : undefined}
                className={`-mb-px rounded-t-[4px] border border-b-0 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] ${
                  p.id === active ? "border-ink/15 bg-paper text-ink" : "border-transparent text-ink/55 hover:text-ink"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {p.name}
                {p.connected && <span className="ml-1.5 text-cue">●</span>}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 overflow-y-auto bg-paper px-6 py-4">
          {providersError && <p className="text-sm text-red-700">{providersError}</p>}
          {!providers && !providersError && <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/50">Loading…</p>}

          {status && (
            <>
              {/* Account row */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-ink/60">
                  {status.connected
                    ? `Connected to ${status.name}`
                    : status.authAvailable
                      ? `Not connected to ${status.name}`
                      : `${status.name} sign-in is not configured`}
                </span>
                {status.authAvailable &&
                  (status.connected ? (
                    <button type="button" onClick={disconnect} className={chip}>
                      Disconnect
                    </button>
                  ) : (
                    // Full navigation: the OAuth flow redirects back to the app.
                    <a href={`/api/music/${status.id}/login`} className={chip}>
                      Connect {status.name}
                    </a>
                  ))}
              </div>
              {status.notes.length > 0 && (
                <ul className="mb-4 list-disc pl-5 text-xs text-ink/55">
                  {status.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}

              {/* Mode tabs */}
              <div className="mb-3 flex gap-5 border-b border-ink/10">
                {(["search", "library"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`-mb-px border-b-2 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] ${
                      m === mode ? "border-ink text-ink" : "border-transparent text-ink/50 hover:text-ink"
                    }`}
                  >
                    {m === "search" ? "Search" : "Your library"}
                  </button>
                ))}
              </div>

              {mode === "search" && (
                <section>
                  {canSearch ? (
                    <input
                      type="search"
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search ${status.name}…`}
                      className="mb-2 w-full border-0 border-b border-ink/25 bg-transparent px-0 py-2 font-serif text-2xl placeholder:text-ink/35 focus:border-ink focus:outline-none"
                    />
                  ) : (
                    <p className="text-sm text-ink/55">
                      {status.searchAvailable
                        ? `Connect ${status.name} to search.`
                        : `${status.name} search is not configured on the server.`}
                    </p>
                  )}
                  {search.loading && <p className="text-sm text-ink/55">Searching…</p>}
                  {search.error && <p className="text-sm text-red-700">{search.error}</p>}
                  {search.data && <TrackList tracks={search.data} onPick={(t) => pick(t, search.data!)} />}
                </section>
              )}

              {mode === "library" && (
                <section>
                  {!status.connected ? (
                    <p className="text-sm text-ink/55">
                      {status.authAvailable
                        ? `Connect ${status.name} to browse your library.`
                        : `${status.name} sign-in is not configured on the server.`}
                    </p>
                  ) : playlist ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setPlaylist(null)}
                        className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-cue hover:underline"
                      >
                        ← Playlists
                      </button>
                      <h3 className="mb-2 font-serif text-2xl">{playlist.name}</h3>
                      {playlistTracks.loading && <p className="text-sm text-ink/55">Loading tracks…</p>}
                      {playlistTracks.error && <p className="text-sm text-red-700">{playlistTracks.error}</p>}
                      {playlistTracks.data && (
                        <TrackList tracks={playlistTracks.data} onPick={(t) => pick(t, playlistTracks.data!)} />
                      )}
                    </>
                  ) : (
                    <>
                      {playlists.loading && <p className="text-sm text-ink/55">Loading playlists…</p>}
                      {playlists.error && <p className="text-sm text-red-700">{playlists.error}</p>}
                      <ul className="divide-y divide-ink/10">
                        {playlists.data?.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => setPlaylist(p)}
                              className="flex w-full items-center gap-3 px-1 py-2 text-left transition hover:bg-ink/5"
                            >
                              {p.artworkUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- remote artwork
                                <img src={p.artworkUrl} alt="" className="h-10 w-10 rounded-[2px] object-cover" />
                              ) : (
                                <div className="h-10 w-10 rounded-[2px] bg-ink/10" />
                              )}
                              <span className="flex-1 truncate text-sm">{p.name}</span>
                              {p.trackCount !== undefined && (
                                <span className="font-mono text-[10px] text-ink/50">{p.trackCount}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
