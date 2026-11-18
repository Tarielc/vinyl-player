import { connection } from "next/server";
import { errorResponse } from "@/lib/music/errors";
import { listProviders } from "@/lib/music/registry";
import { peekSession } from "@/lib/music/session";
import type { ProviderStatus } from "@/lib/music/types";

/** GET /api/music/providers: which providers are configured and connected. */
export async function GET() {
  // Status depends on runtime env + cookies; never prerender it.
  await connection();
  try {
    const statuses: ProviderStatus[] = await Promise.all(
      listProviders().map(async (p) => ({
        id: p.id,
        name: p.name,
        searchAvailable: p.isSearchConfigured(),
        authAvailable: p.isAuthConfigured(),
        connected: p.isAuthConfigured() && Boolean(await peekSession(p.id)),
        searchRequiresAuth: p.searchRequiresAuth(),
        notes: p.notes,
      })),
    );
    return Response.json(statuses);
  } catch (err) {
    return errorResponse(err);
  }
}
