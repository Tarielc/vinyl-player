import { PROVIDER_IDS, PROVIDER_NAMES } from "./types";

// The OAuth callback sends only one of these codes back in `?music_error=`, and
// the page shows its own text for it. Free text in the URL would let anyone link
// to the site with a message of their choosing.

export type AuthErrorCode = "cancelled" | "expired" | "no_code" | "not_configured" | "failed";

/** Message for a `?music_error=` code; unknown codes get a generic one. */
export function authErrorMessage(code: string, providerId?: string): string {
  const provider = PROVIDER_IDS.find((id) => id === providerId);
  const name = provider ? PROVIDER_NAMES[provider] : undefined;
  switch (code as AuthErrorCode) {
    case "cancelled":
      return `${name ?? "The"} sign-in was cancelled.`;
    case "expired":
      return "Sign-in expired or was tampered with. Please try again.";
    case "no_code":
      return `${name ?? "The service"} did not return an authorization code. Please try again.`;
    case "not_configured":
      return `${name ?? "This"} sign-in is not configured on the server.`;
    default:
      return `${name ? `${name} sign-in` : "Sign-in"} failed. Please try again.`;
  }
}
