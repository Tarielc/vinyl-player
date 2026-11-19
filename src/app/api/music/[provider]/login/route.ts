import { NextResponse } from "next/server";
import { errorResponse, notConfigured } from "@/lib/music/errors";
import { getProvider, redirectUri } from "@/lib/music/registry";
import { createOAuthState } from "@/lib/music/session";
import { safeReturnPath } from "@/lib/music/share";

/** GET /api/music/:provider/login[?return=/listen/…]: start the OAuth flow, coming back to `return` (a share link) or home. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = getProvider((await params).provider);
    if (!provider.isAuthConfigured()) throw notConfigured(provider.name, "OAuth credentials");
    const returnTo = safeReturnPath(new URL(request.url).searchParams.get("return"));
    const state = await createOAuthState(provider.id, returnTo);
    return NextResponse.redirect(provider.getAuthUrl(state, redirectUri(request, provider)));
  } catch (err) {
    return errorResponse(err);
  }
}
