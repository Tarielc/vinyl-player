import type { ApiError } from "./types";

/** Error thrown by apiFetch, carrying the API's error code. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** fetch() wrapper for the /api/music routes: parses JSON and throws on error responses. */
export async function apiFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body as Partial<ApiError> | null;
    throw new ApiRequestError(res.status, err?.code ?? "http_error", err?.error ?? `Request failed (${res.status}).`);
  }
  return body as T;
}
