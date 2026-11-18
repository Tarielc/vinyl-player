import { errorResponse, notConfigured } from "@/lib/music/errors";
import { getProvider } from "@/lib/music/registry";
import { requireSession } from "@/lib/music/session";

/** GET /api/music/:provider/playlists/:id: tracks in a playlist (`saved` = liked/saved tracks). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string; id: string }> },
) {
  try {
    const { provider: providerId, id } = await params;
    const provider = getProvider(providerId);
    if (!provider.isAuthConfigured()) throw notConfigured(provider.name, "OAuth credentials");
    return Response.json(await provider.getPlaylistTracks(id, await requireSession(provider)));
  } catch (err) {
    return errorResponse(err);
  }
}
