import { errorResponse, MusicError, notConfigured } from "@/lib/music/errors";
import { getProvider } from "@/lib/music/registry";
import { getSession } from "@/lib/music/session";
import type { ProviderId } from "@/lib/music/types";
import { clientIp, rateLimit, type RateLimit } from "@/lib/rate-limit";

// Search is open to anyone, so cap it per visitor IP. The picker searches as you
// type (350 ms debounce), so one query can take a few requests.
const SEARCH_LIMITS: Record<ProviderId, RateLimit> = {
  // Runs on the app's shared Spotify token, so floods would rate-limit every visitor.
  spotify: { burst: 20, refillMs: 3_000 },
  // Each uncached search spends ~1% of the YouTube API's daily quota.
  youtube: { burst: 10, refillMs: 20_000 },
};

/** GET /api/music/:provider/search?q=…&limit=…: normalized Track[]. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = getProvider((await params).provider);
    if (!provider.isSearchConfigured()) throw notConfigured(provider.name);

    const sp = new URL(request.url).searchParams;
    const q = sp.get("q")?.trim() ?? "";
    if (!q) throw new MusicError(400, "bad_request", "Query parameter `q` is required.");
    if (q.length > 200) throw new MusicError(400, "bad_request", "Query is too long.");
    const limit = Number.parseInt(sp.get("limit") ?? "10", 10) || 10;

    const wait = rateLimit(`search:${provider.id}:${clientIp(request)}`, SEARCH_LIMITS[provider.id]);    if (wait) {
      throw new MusicError(429, "rate_limited", `Too many searches. Try again in ${wait} s.`, wait);
    }

    const session = provider.isAuthConfigured() ? await getSession(provider) : null;
    return Response.json(await provider.search(q, limit, session));
  } catch (err) {
    return errorResponse(err);
  }
}
