import { errorResponse, MusicError } from "@/lib/music/errors";
import { getProvider } from "@/lib/music/registry";
import { requireSession } from "@/lib/music/session";

/** POST /api/music/:provider/play { deviceId, uri }: start playback on a client SDK device. */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = getProvider((await params).provider);
    if (!provider.play) {
      throw new MusicError(404, "unsupported", `${provider.name} playback is handled in the browser.`);
    }
    const body = (await request.json().catch(() => null)) as { deviceId?: unknown; uri?: unknown } | null;
    if (typeof body?.deviceId !== "string" || typeof body?.uri !== "string") {
      throw new MusicError(400, "bad_request", "Body must be { deviceId: string, uri: string }.");
    }
    await provider.play(await requireSession(provider), { deviceId: body.deviceId, uri: body.uri });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
