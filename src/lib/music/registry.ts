import { MusicError } from "./errors";
import type { MusicProvider } from "./provider";
import { spotify } from "./spotify";
import { youtube } from "./youtube";
import { PROVIDER_IDS, type ProviderId } from "./types";

const providers: Record<ProviderId, MusicProvider> = { spotify, youtube };

export function listProviders(): MusicProvider[] {
  return PROVIDER_IDS.map((id) => providers[id]);
}

export function getProvider(id: string): MusicProvider {
  if (!(PROVIDER_IDS as readonly string[]).includes(id)) {
    throw new MusicError(404, "unknown_provider", `Unknown music provider "${id}".`);
  }
  return providers[id as ProviderId];
}

/** Base URL used to build OAuth redirect URIs. Must match what's registered with the provider. */
export function appUrl(request: Request): string {
  return (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

export function redirectUri(request: Request, provider: MusicProvider): string {
  return `${appUrl(request)}/api/music/${provider.id}/callback`;
}
