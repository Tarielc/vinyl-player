import { NextResponse } from "next/server";
import { MusicError } from "@/lib/music/errors";
import { appUrl, getProvider, redirectUri } from "@/lib/music/registry";
import { consumeOAuthState, setSession } from "@/lib/music/session";

/**
 * GET /api/music/:provider/callback: OAuth redirect target.
 * Always redirects back to the app with `?music_connected=` or `?music_error=`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const url = new URL(request.url);
  const back = (query: Record<string, string>) =>
    NextResponse.redirect(`${appUrl(request)}/?${new URLSearchParams(query)}`);

  try {
    const provider = getProvider((await params).provider);
    const validState = await consumeOAuthState(provider.id, url.searchParams.get("state"));

    const denied = url.searchParams.get("error");
    if (denied) return back({ music_error: `${provider.name} sign-in was cancelled (${denied}).` });
    if (!validState) return back({ music_error: "Sign-in expired or was tampered with. Please try again." });

    const code = url.searchParams.get("code");
    if (!code) return back({ music_error: `${provider.name} did not return an authorization code.` });

    const tokens = await provider.exchangeCode(code, redirectUri(request, provider));
    await setSession(provider.id, tokens);
    return back({ music_connected: provider.id });
  } catch (err) {
    const message = err instanceof MusicError ? err.message : "Sign-in failed.";
    if (!(err instanceof MusicError)) console.error("[music] oauth callback failed", err);
    return back({ music_error: message });
  }
}
