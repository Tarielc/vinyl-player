import { NextResponse } from "next/server";
import { errorResponse, notConfigured } from "@/lib/music/errors";
import { getProvider, redirectUri } from "@/lib/music/registry";
import { createOAuthState } from "@/lib/music/session";

/** GET /api/music/:provider/login: start the OAuth flow. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const provider = getProvider((await params).provider);
    if (!provider.isAuthConfigured()) throw notConfigured(provider.name, "OAuth credentials");
    const state = await createOAuthState(provider.id);
    return NextResponse.redirect(provider.getAuthUrl(state, redirectUri(request, provider)));
  } catch (err) {
    return errorResponse(err);
  }
}
