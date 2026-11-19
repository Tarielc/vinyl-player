import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { MusicError } from "./errors";
import type { MusicProvider, TokenSet } from "./provider";
import type { ProviderId } from "./types";
import { safeReturnPath } from "./share";

// Provider tokens are kept in AES-256-GCM encrypted, httpOnly cookies so no
// database is required and tokens never reach client-side JavaScript
// (except where a provider explicitly exposes one for its playback SDK).

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const STATE_COOKIE = "mp_oauth_state";
const REFRESH_SKEW_MS = 60_000;

const cookieName = (id: ProviderId) => `mp_${id}`;

function secureCookies(): boolean {
  const appUrl = process.env.APP_URL;
  return appUrl ? appUrl.startsWith("https://") : process.env.NODE_ENV === "production";
}

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new MusicError(
      500,
      "session_secret_missing",
      "SESSION_SECRET must be set to a random string of at least 32 characters.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function unseal<T>(sealed: string): T | null {
  try {
    const buf = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as T;
  } catch (err) {
    if (err instanceof MusicError) throw err;
    return null; // tampered, wrong secret, or malformed
  }
}

export async function setSession(id: ProviderId, tokens: TokenSet): Promise<void> {
  (await cookies()).set(cookieName(id), seal(tokens), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSession(id: ProviderId): Promise<void> {
  (await cookies()).delete(cookieName(id));
}

/** Reads a session without refreshing it (for cheap "connected?" checks). */
export async function peekSession(id: ProviderId): Promise<TokenSet | null> {
  const raw = (await cookies()).get(cookieName(id))?.value;
  return raw ? unseal<TokenSet>(raw) : null;
}

/**
 * Returns a usable session for the provider, refreshing the access token when
 * it is about to expire. Clears the cookie and returns null if the session is
 * invalid or cannot be refreshed.
 */
export async function getSession(provider: MusicProvider): Promise<TokenSet | null> {
  const session = await peekSession(provider.id);
  if (!session) {
    if ((await cookies()).has(cookieName(provider.id))) await clearSession(provider.id);
    return null;
  }
  if (session.expiresAt - REFRESH_SKEW_MS > Date.now()) return session;
  if (!session.refreshToken) {
    await clearSession(provider.id);
    return null;
  }
  try {
    const next = await provider.refresh(session.refreshToken);
    const merged: TokenSet = {
      accessToken: next.accessToken,
      // Providers only sometimes rotate refresh tokens; keep the old one otherwise.
      refreshToken: next.refreshToken ?? session.refreshToken,
      expiresAt: next.expiresAt,
    };
    await setSession(provider.id, merged);
    return merged;
  } catch (err) {
    console.warn(`[music] ${provider.id} token refresh failed`, err);
    await clearSession(provider.id);
    return null;
  }
}

export async function requireSession(provider: MusicProvider): Promise<TokenSet> {
  const session = await getSession(provider);
  if (!session) {
    throw new MusicError(401, "not_connected", `Connect your ${provider.name} account first.`);
  }
  return session;
}

// ---- OAuth state (CSRF protection) ----

/** `returnTo`: a path to come back to after sign-in (already checked with safeReturnPath). */
export async function createOAuthState(id: ProviderId, returnTo?: string): Promise<string> {
  const state = randomBytes(16).toString("hex");
  const back = returnTo ? `:${encodeURIComponent(returnTo)}` : "";
  (await cookies()).set(STATE_COOKIE, `${id}:${state}${back}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/api/music",
    maxAge: 600,
  });
  return state;
}

/** Checks and clears the state cookie; `returnTo` is the path saved with it, if any. */
export async function consumeOAuthState(
  id: ProviderId,
  state: string | null,
): Promise<{ valid: boolean; returnTo?: string }> {
  const store = await cookies();
  const [cookieId, expected, back] = (store.get(STATE_COOKIE)?.value ?? "").split(":");
  store.delete({ name: STATE_COOKIE, path: "/api/music" });
  const valid = Boolean(state && expected && cookieId === id && expected === state);
  let returnTo: string | undefined;
  try {
    returnTo = back ? safeReturnPath(decodeURIComponent(back)) : undefined;
  } catch {
    // Malformed: go home.
  }
  return { valid, returnTo };
}
