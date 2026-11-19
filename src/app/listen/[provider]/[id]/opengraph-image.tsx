import { ImageResponse } from "next/og";
import { playsFor } from "@/lib/music/share";
import { getSharedTrack } from "@/lib/music/shared-track";

// The link preview for a shared record: the record, with the cover pressed onto its label.

export const alt = "A record with the cover pressed onto its label";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0c0b0a";
const PAPER = "#efe9dc";

/** A Google font as TrueType (what it serves to clients that don't ask for woff2), or null offline. */
async function googleFont(family: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}`).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    return url ? await fetch(url).then((r) => r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

// Loaded once per server, not per image.
const fontsPromise = Promise.all([googleFont("Instrument Serif"), googleFont("Geist"), googleFont("Geist Mono")]).then(
  ([serif, sans, mono]) =>
    [
      serif && { name: "Instrument Serif", data: serif, weight: 400 as const, style: "normal" as const },
      sans && { name: "Geist", data: sans, weight: 400 as const, style: "normal" as const },
      mono && { name: "Geist Mono", data: mono, weight: 400 as const, style: "normal" as const },
    ].filter((f) => f !== null),
);

/** The cover inlined, so a slow or missing image can't fail the card. JPEG and PNG only. */
async function inline(src: string | undefined): Promise<string | null> {
  if (!src) return null;
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png)$/.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 4_000_000) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export default async function Image({ params }: { params: Promise<{ provider: string; id: string }> }) {
  const { provider, id } = await params;
  const track = await getSharedTrack(provider, id);
  const [fonts, cover] = await Promise.all([fontsPromise, inline(track?.coverUrl ?? track?.artworkUrl)]);

  const title = clip(track?.title ?? "Vinyl Player", 80);
  const artist = clip(track?.artists.join(", ") ?? "", 60);
  const titleSize = title.length <= 18 ? 92 : title.length <= 36 ? 72 : 56;
  const DISC = 560;
  const LABEL = 236;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: INK,
          backgroundImage: "radial-gradient(circle at 330px 315px, rgba(201,140,78,0.28), rgba(12,11,10,0) 420px)",
          color: PAPER,
          fontFamily: "Geist",
        }}
      >
        {/* The record */}
        <div
          style={{
            position: "absolute",
            left: 50,
            top: 35,
            width: DISC,
            height: DISC,
            borderRadius: DISC,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#131110",
            backgroundImage:
              "repeating-radial-gradient(circle at center, #131110 0px, #131110 2px, #24201c 3px, #131110 4px)",
            border: "2px solid rgba(239,233,220,0.1)",
            boxShadow: "0 30px 60px rgba(0,0,0,0.6)",
          }}
        >
          {/* Light across the grooves */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: DISC,
              backgroundImage:
                "linear-gradient(130deg, rgba(255,255,255,0) 30%, rgba(255,226,190,0.16) 46%, rgba(255,255,255,0) 58%, rgba(255,255,255,0) 100%)",
            }}
          />
          {/* Label: the cover, cropped round, or plain card stock with the title printed on it */}
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img>
            <img
              src={cover}
              alt=""
              width={LABEL}
              height={LABEL}
              style={{ width: LABEL, height: LABEL, borderRadius: LABEL, objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: LABEL,
                height: LABEL,
                borderRadius: LABEL,
                background: "#e6dfcc",
                color: INK,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: 40,
                fontFamily: "Instrument Serif",
                fontSize: 26,
                lineHeight: 1,
              }}
            >
              {clip(title, 40)}
            </div>
          )}
          {/* Spindle */}
          <div
            style={{
              position: "absolute",
              width: 18,
              height: 18,
              borderRadius: 18,
              background: INK,
              border: "2px solid rgba(239,233,220,0.25)",
            }}
          />
        </div>

        {/* Words */}
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 680, width: 460, paddingRight: 20 }}>
          <div style={{ fontFamily: "Geist Mono", fontSize: 18, letterSpacing: 6, color: "rgba(239,233,220,0.55)" }}>
            {track ? "A RECORD FOR YOU" : "VINYL / PLAYER"}
          </div>
          <div
            style={{
              marginTop: 26,
              fontFamily: "Instrument Serif",
              fontSize: titleSize,
              lineHeight: 0.98,
              letterSpacing: -1,
            }}
          >
            {title}
          </div>
          {artist && <div style={{ marginTop: 22, fontSize: 30, color: "rgba(239,233,220,0.72)" }}>{artist}</div>}
          <div
            style={{
              marginTop: 44,
              display: "flex",
              alignItems: "center",
              fontFamily: "Geist Mono",
              fontSize: 16,
              letterSpacing: 3,
              color: "rgba(239,233,220,0.6)",
            }}
          >
            {track ? `${playsFor(track.provider).toUpperCase()} · VINYL / PLAYER` : "SPOTIFY · YOUTUBE · 33⅓ RPM"}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
