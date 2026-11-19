import type { Metadata } from "next";
import { MusicApp } from "@/components/music/music-app";
import { playsFor } from "@/lib/music/share";
import { getSharedTrack } from "@/lib/music/shared-track";

export async function generateMetadata({ params }: PageProps<"/listen/[provider]/[id]">): Promise<Metadata> {
  const { provider, id } = await params;
  const track = await getSharedTrack(provider, id);
  if (!track) return { title: "Record not found · Vinyl Player" };
  const by = track.artists.join(", ");
  const title = by ? `${track.title} — ${by}` : track.title;
  const description = `On the deck at Vinyl Player: the cover pressed onto the label, ready to spin. ${playsFor(track.provider)}.`;
  return {
    title: `${title} · Vinyl Player`,
    description,
    // The card image is the label (opengraph-image.tsx).
    openGraph: { title, description, siteName: "Vinyl Player", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * A shared record: the same page as home, with the track already on the label of the deck in
 * `?deck=`. Browsers won't start sound without a click, so it waits for one.
 */
export default function ListenPage({ params, searchParams }: PageProps<"/listen/[provider]/[id]">) {
  const shared = params.then(({ provider, id }) => getSharedTrack(provider, id));
  return <MusicApp searchParams={searchParams} shared={shared} />;
}
