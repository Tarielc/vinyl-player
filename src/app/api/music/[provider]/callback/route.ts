import { NextResponse } from "next/server";
import type { AuthErrorCode } from "@/lib/music/auth-errors";
import { MusicError } from "@/lib/music/errors";
import { appUrl, getProvider, redirectUri } from "@/lib/music/registry";
import { consumeOAuthState, setSession } from "@/lib/music/session";

/**
 * GET /api/music/:provider/callback: OAuth redirect target.
 * Always redirects back to the app with `?music_connected=` or with
 * `?music_error=<AuthErrorCode>&music_provider=`. Details stay in the server log.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const url = new URL(request.url);
  const back = (query: Record<string, string>) =>
    NextResponse.redirect(`${appUrl(request)}/?${new URLSearchParams(query)}`);
  const fail = (code: AuthErrorCode, providerId?: string) =>
    back(providerId ? { music_error: code, music_provider: providerId } : { music_error: code });

  let providerId: string | undefined;
  try {
    const provider = getProvider((await params).provider);
    providerId = provider.id;
    const validState = await consumeOAuthState(provider.id, url.searchParams.get("state"));

    if (url.searchParams.get("error")) return fail("cancelled", provider.id);
    if (!validState) return fail("expired", provider.id);

    const code = url.searchParams.get("code");
    if (!code) return fail("no_code", provider.id);

    const tokens = await provider.exchangeCode(code, redirectUri(request, provider));
    await setSession(provider.id, tokens);
    return back({ music_connected: provider.id });
  } catch (err) {
    console.error("[music] oauth callback failed", err);
    const notConfigured = err instanceof MusicError && err.code === "not_configured";
    return fail(notConfigured ? "not_configured" : "failed", providerId);
  }
}
