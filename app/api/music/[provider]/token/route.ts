import { errorResponse, MusicError } from "@/lib/music/errors";
import { getProvider } from "@/lib/music/registry";
import { requireSession } from "@/lib/music/session";

/**
 * GET /api/music/:provider/token: short-lived access token for a client playback SDK.
 * Only providers that need it (Spotify Web Playback SDK) expose one; refresh tokens never leave the server.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = getProvider((await params).provider);
    if (!provider.exposesClientToken) {
      throw new MusicError(404, "unsupported", `${provider.name} does not use a client token.`);
    }
    const session = await requireSession(provider);
    return Response.json(
      { accessToken: session.accessToken, expiresAt: session.expiresAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
