import { errorResponse, notConfigured } from "@/lib/music/errors";
import { getProvider } from "@/lib/music/registry";
import { requireSession } from "@/lib/music/session";

/** GET /api/music/:provider/playlists: the signed-in user's playlists (incl. a virtual "saved" one). */
export async function GET(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = getProvider((await params).provider);
    if (!provider.isAuthConfigured()) throw notConfigured(provider.name, "OAuth credentials");
    return Response.json(await provider.getPlaylists(await requireSession(provider)));
  } catch (err) {
    return errorResponse(err);
  }
}
