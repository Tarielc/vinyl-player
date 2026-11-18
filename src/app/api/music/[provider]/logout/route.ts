import { errorResponse } from "@/lib/music/errors";
import { getProvider } from "@/lib/music/registry";
import { clearSession } from "@/lib/music/session";

/** POST /api/music/:provider/logout: forget the provider session. */
export async function POST(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = getProvider((await params).provider);
    await clearSession(provider.id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
