import { errorResponse, MusicError, notConfigured } from "@/lib/music/errors";
import { getProvider } from "@/lib/music/registry";
import { getSession } from "@/lib/music/session";

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

    const session = provider.isAuthConfigured() ? await getSession(provider) : null;
    return Response.json(await provider.search(q, limit, session));
  } catch (err) {
    return errorResponse(err);
  }
}
