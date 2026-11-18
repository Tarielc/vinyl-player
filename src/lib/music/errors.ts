import type { ApiError } from "./types";

/** Error that maps cleanly onto an HTTP response for the API routes. */
export class MusicError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MusicError";
  }
}

export const notConnected = (provider: string) =>
  new MusicError(401, "not_connected", `Connect your ${provider} account first.`);

export const notConfigured = (provider: string, what = "credentials") =>
  new MusicError(503, "not_configured", `${provider} ${what} are not configured on the server.`);

export function errorResponse(err: unknown): Response {
  if (err instanceof MusicError) {
    return Response.json({ error: err.message, code: err.code } satisfies ApiError, {
      status: err.status,
    });
  }
  console.error("[music] unexpected error", err);
  return Response.json({ error: "Unexpected server error.", code: "internal" } satisfies ApiError, {
    status: 500,
  });
}

/**
 * Translate a failed upstream (Spotify / Google) response into a MusicError.
 * 401 from upstream means our access token is bad, which we surface as not_connected.
 */
export async function upstreamError(provider: string, res: Response): Promise<MusicError> {
  let detail = "";
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text);
    detail = body?.error?.message ?? body?.error_description ?? body?.error ?? "";
    if (typeof detail !== "string") detail = JSON.stringify(detail);
  } catch {
    // Not JSON: some upstream errors (e.g. Spotify's "Premium required for the
    // owner of the app") are plain text, so surface a short excerpt of it.
    detail = text.trim().slice(0, 300);
  }
  const suffix = detail ? `: ${detail}` : "";
  switch (res.status) {
    case 401:
      return new MusicError(401, "not_connected", `${provider} session expired. Please reconnect.`);
    case 403:
      return new MusicError(403, "forbidden", `${provider} refused the request${suffix}`);
    case 404:
      return new MusicError(404, "not_found", `${provider} could not find that resource${suffix}`);
    case 429:
      return new MusicError(429, "rate_limited", `${provider} rate limit reached. Try again shortly.`);
    default:
      return new MusicError(502, "upstream_error", `${provider} request failed (${res.status})${suffix}`);
  }
}
