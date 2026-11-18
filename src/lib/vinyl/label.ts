// Draws a record label (1024² canvas) from a track's cover art. The label mesh
// maps the full square onto its circle, so the corners are cropped off.

export interface LabelInfo {
  /** Stable id of the track (provider:id). */
  key: string;
  title: string;
  artist: string;
  artworkUrl?: string;
}

const SIZE = 1024;
const C = SIZE / 2;

/** Muted card stock for labels drawn without artwork. */
const PAPER = ["#e6dfcc", "#8c8a6c", "#8e98a3", "#a4875f", "#5d5f48", "#cfc6ad"];

function cssFont(variable: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v || fallback;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // the canvas must stay untainted to become a WebGL texture
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

interface Art {
  img: HTMLImageElement;
  /** Source square to draw (letterboxed thumbnails crop to the picture). */
  sx: number;
  sy: number;
  side: number;
}

/** Best available artwork: larger sizes first, falling back to the original URL. */
async function loadArt(url: string): Promise<Art> {
  const candidates: { src: string; letterbox?: boolean; minWidth?: number }[] = [];
  const yt = url.match(/^https:\/\/i\.ytimg\.com\/vi\/([\w-]+)\//);
  if (yt) {
    // maxres is 16:9 and sometimes missing (YouTube then serves a 120px placeholder).
    candidates.push({ src: `https://i.ytimg.com/vi/${yt[1]}/maxresdefault.jpg`, minWidth: 640 });
    // hq is 4:3 with black bars around a 16:9 picture.
    candidates.push({ src: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`, letterbox: true });
  } else if (/^https:\/\/i\.scdn\.co\/image\/ab67616d00001e02/.test(url)) {
    candidates.push({ src: url.replace("ab67616d00001e02", "ab67616d0000b273") }); // 640px album art
  }
  candidates.push({ src: url });

  for (const c of candidates) {
    try {
      const img = await loadImage(c.src);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h || (c.minWidth && w < c.minWidth)) continue;
      const side = c.letterbox ? Math.min(w, h * 0.75) : Math.min(w, h);
      return { img, side, sx: (w - side) / 2, sy: (h - side) / 2 };
    } catch {
      // try the next size
    }
  }
  throw new Error("No artwork could be loaded.");
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** Writes `text` clockwise around a circle, spaced to close the loop exactly. */
function ringText(ctx: CanvasRenderingContext2D, text: string, radius: number, px: number, font: string) {
  ctx.save();
  ctx.font = `500 ${px}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const circumference = 2 * Math.PI * radius;
  const unit = [...text];
  const width = (chars: string[]) => chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0);
  let chars = unit;
  while (width([...chars, ...unit]) + (chars.length + unit.length) * px * 0.3 < circumference) {
    chars = [...chars, ...unit];
  }
  const gap = (circumference - width(chars)) / chars.length;
  let angle = -Math.PI / 2;
  for (const ch of chars) {
    const w = ctx.measureText(ch).width + gap;
    angle += w / 2 / radius;
    ctx.save();
    ctx.translate(C + Math.cos(angle) * radius, C + Math.sin(angle) * radius);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    angle += w / 2 / radius;
  }
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, "")}…`;
  }
  return lines;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Label printed on card stock: used when a track has no (loadable) artwork. */
function drawPrinted(ctx: CanvasRenderingContext2D, info: LabelInfo, serif: string, mono: string) {
  const paper = PAPER[hash(info.key) % PAPER.length];
  const ink = luminance(paper) > 0.55 ? "#1b1a17" : "#f1ece1";
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `400 92px ${serif}`;
  const lines = wrap(ctx, info.title, 620, 2);
  lines.forEach((l, i) => ctx.fillText(l, C, 360 - (lines.length - 1 - i) * 92));

  ctx.font = `500 30px ${mono}`;
  ctx.fillText(truncate(info.artist.toUpperCase(), 34), C, 720);
  ctx.textAlign = "left";
  ctx.fillText("SIDE A", 190, C + 10);
  ctx.textAlign = "right";
  ctx.fillText("33⅓", SIZE - 190, C + 10);

  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(300, 600);
  ctx.lineTo(SIZE - 300, 600);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Rim band with running text, centre hole and a soft falloff toward the edge. */
function drawFurniture(ctx: CanvasRenderingContext2D, info: LabelInfo, mono: string) {
  const vignette = ctx.createRadialGradient(C, C, C * 0.55, C, C, C);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.fillStyle = "rgba(12,11,10,0.62)";
  ctx.beginPath();
  ctx.arc(C, C, C, 0, Math.PI * 2);
  ctx.arc(C, C, C * 0.885, 0, Math.PI * 2, true);
  ctx.fill("evenodd");

  ctx.fillStyle = "rgba(241,236,225,0.92)";
  const rim = `${truncate(info.title.toUpperCase(), 40)}  —  ${truncate(info.artist.toUpperCase(), 30)}  ✦  SIDE A  ✦  33⅓ RPM  ✦  `;
  ringText(ctx, rim, C * 0.943, 26, mono);

  // Spindle hole.
  ctx.fillStyle = "#0b0a09";
  ctx.beginPath();
  ctx.arc(C, C, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(241,236,225,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(C, C, 58, 0, Math.PI * 2);
  ctx.stroke();
}

/** Renders the label for `info` onto a fresh canvas. Never throws: falls back to a printed label. */
export async function drawLabel(info: LabelInfo): Promise<HTMLCanvasElement> {
  const serif = cssFont("--font-instrument-serif", "Georgia, serif");
  const mono = cssFont("--font-geist-mono", "ui-monospace, monospace");
  await Promise.all([
    document.fonts?.load(`400 92px ${serif}`).catch(() => {}),
    document.fonts?.load(`500 30px ${mono}`).catch(() => {}),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const art = info.artworkUrl ? await loadArt(info.artworkUrl).catch(() => null) : null;
  if (art) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(art.img, art.sx, art.sy, art.side, art.side, 0, 0, SIZE, SIZE);
  } else {
    drawPrinted(ctx, info, serif, mono);
  }
  drawFurniture(ctx, info, mono);
  return canvas;
}
