// The surface of a record, drawn procedurally for the coloured and picture pressings (the
// models' own vinyl maps only read on black). Everything is laid out in the disc's planar UVs
// (uv2): the centre at (0.5, 0.5), the record's edge at radius 0.5.
//
// From the centre out: the label, the run-out (smooth, with the locked groove), the grooved
// side with a few smooth gaps between tracks, the lead-in, then the rounded edge.

/** Radii as fractions of the record's radius. */
export const GROOVES = {
  label: 0.34,
  runout: 0.4,
  leadIn: 0.955,
  edge: 0.985,
  /** Gaps between tracks: smooth bands that catch the light differently. */
  gaps: [0.5, 0.585, 0.665, 0.745, 0.81, 0.875] as readonly number[],
  gapWidth: 0.007,
};

export type Zone = "label" | "runout" | "groove" | "gap" | "leadIn" | "edge";

export function zoneAt(r: number): Zone {
  if (r < GROOVES.label) return "label";
  if (r < GROOVES.runout) return "runout";
  if (r >= GROOVES.edge) return "edge";
  if (r >= GROOVES.leadIn) return "leadIn";
  return GROOVES.gaps.some((g) => Math.abs(r - g) < GROOVES.gapWidth / 2) ? "gap" : "groove";
}

/** How loud the music is cut at r (0.55..1): louder passages are cut wider and look rougher. */
function loudness(r: number): number {
  return 0.775 + 0.225 * Math.sin(r * 71 + Math.sin(r * 23) * 2.1);
}

/** Groove spacing per unit radius; a little wider in loud passages, as on a real cut. */
const GROOVES_PER_RADIUS = 330;

export interface GrooveMaps {
  /** Tangent-space normals of the grooves. */
  normal: HTMLCanvasElement;
  /** Roughness in the green channel: grooves satin, the gaps and edges glossy. */
  roughness: HTMLCanvasElement;
  /** Anisotropy: direction along the grooves (RG) and strength (B), for the circular streaks of light. */
  anisotropy: HTMLCanvasElement;
  /** A multiplier for coloured vinyl: grooves a shade darker than the gaps, and a faint marbling. */
  tint: HTMLCanvasElement;
}

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  return { c, ctx, img: ctx.createImageData(size, size) };
}

/** Draws the four maps (a few hundred ms, once per page). */
export function drawGrooveMaps(normalSize = 2048, size = 1024): GrooveMaps {
  // Normals: concentric ridges, their spacing breathing with the music.
  const n = canvas(normalSize);
  {
    const d = n.img.data;
    const half = normalSize / 2;
    for (let y = 0; y < normalSize; y++) {
      for (let x = 0; x < normalSize; x++) {
        const dx = (x + 0.5 - half) / half;
        const dy = (y + 0.5 - half) / half;
        const r = Math.hypot(dx, dy);
        const zone = zoneAt(r);
        let slope = 0;
        if (zone === "groove") {
          const s = r * GROOVES_PER_RADIUS + Math.sin(r * 71) * 0.9;
          slope = Math.cos(s * Math.PI * 2) * 0.55 * loudness(r);
        } else if (zone === "leadIn" || zone === "runout") {
          // A few wide, shallow turns.
          slope = Math.cos(r * 60 * Math.PI * 2) * 0.18;
        } else if (zone === "edge") {
          // The rounded rim falls away outward.
          slope = -((r - GROOVES.edge) / (1 - GROOVES.edge)) * 0.8;
        }
        const ux = r > 0 ? dx / r : 0;
        const uy = r > 0 ? dy / r : 0;
        let nx = -slope * ux;
        let ny = -slope * uy;
        const len = Math.hypot(nx, ny, 1);
        nx /= len;
        ny /= len;
        const i = (y * normalSize + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
        d[i + 3] = 255;
      }
    }
    n.ctx.putImageData(n.img, 0, 0);
  }

  const rough = canvas(size);
  const aniso = canvas(size);
  const tint = canvas(size);
  {
    const half = size / 2;
    const rd = rough.img.data;
    const ad = aniso.img.data;
    const td = tint.img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - half) / half;
        const dy = (y + 0.5 - half) / half;
        const r = Math.hypot(dx, dy);
        const theta = Math.atan2(dy, dx);
        const zone = zoneAt(r);
        const loud = loudness(r);
        const i = (y * size + x) * 4;

        const roughness =
          zone === "groove" ? 0.3 + 0.18 * loud : zone === "gap" ? 0.14 : zone === "label" ? 0.5 : 0.2;
        rd[i] = rd[i + 2] = 0;
        rd[i + 1] = roughness * 255;
        rd[i + 3] = 255;

        // Along the grooves: (-uy, ux).
        const ux = r > 0 ? dx / r : 1;
        const uy = r > 0 ? dy / r : 0;
        const strength =
          zone === "groove" ? loud : zone === "gap" ? 0.25 : zone === "label" ? 0 : zone === "edge" ? 0.2 : 0.55;
        ad[i] = (-uy * 0.5 + 0.5) * 255;
        ad[i + 1] = (ux * 0.5 + 0.5) * 255;
        ad[i + 2] = strength * 255;
        ad[i + 3] = 255;

        // Marbling: swirls stretched round the disc, as the colour is pressed outward.
        const swirl = 0.5 + 0.5 * Math.sin(theta * 2 + r * 9 + 1.7 * Math.sin(theta * 3 - r * 5));
        const band = zone === "groove" ? 0.86 + 0.06 * (1 - loud) : 1;
        const v = band * (0.9 + 0.1 * swirl) * 255;
        td[i] = td[i + 1] = td[i + 2] = v;
        td[i + 3] = 255;
      }
    }
    rough.ctx.putImageData(rough.img, 0, 0);
    aniso.ctx.putImageData(aniso.img, 0, 0);
    tint.ctx.putImageData(tint.img, 0, 0);
  }

  return { normal: n.c, roughness: rough.c, anisotropy: aniso.c, tint: tint.c };
}

/**
 * Cuts the grooves into a picture disc's image (a square canvas, the disc filling it): faint
 * rings over the grooved side, the gaps and the run-out left clear, as the picture shows
 * through the clear vinyl.
 */
export function cutGrooves(ctx: CanvasRenderingContext2D, size: number) {
  const c = size / 2;
  const ring = (from: number, to: number, style: string) => {
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.arc(c, c, c * to, 0, Math.PI * 2);
    ctx.arc(c, c, c * from, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
  };
  // Grooved bands a shade darker, between the clear gaps.
  const edges = [GROOVES.runout, ...GROOVES.gaps.flatMap((g) => [g - GROOVES.gapWidth / 2, g + GROOVES.gapWidth / 2]), GROOVES.leadIn];
  for (let i = 0; i < edges.length; i += 2) ring(edges[i], edges[i + 1], "rgba(0,0,0,0.14)");

  // Fine rings, lighter and darker by turns.
  ctx.lineWidth = 1;
  const step = 2 / c;
  let k = 0;
  for (let r = GROOVES.runout; r < GROOVES.leadIn; r += step, k++) {
    if (zoneAt(r) !== "groove") continue;
    ctx.strokeStyle = k % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    ctx.beginPath();
    ctx.arc(c, c, c * r, 0, Math.PI * 2);
    ctx.stroke();
  }
}
