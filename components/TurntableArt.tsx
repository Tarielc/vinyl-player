import type { TurntableArt as Art } from "@/lib/shop/catalog";

/** Top-down drawing of a turntable in the listing's colours. The record spins when a parent `.group` is hovered. */
export function TurntableArt({ art, className = "" }: { art: Art; className?: string }) {
  const rx = art.shape === "rounded" ? 26 : art.shape === "case" ? 18 : 6;
  return (
    <svg viewBox="0 0 400 300" className={className} aria-hidden="true">
      {art.shape === "case" && (
        <rect x="168" y="20" width="64" height="26" rx="9" fill="none" stroke={art.plinth} strokeWidth="7" />
      )}
      <rect x="24" y="46" width="352" height="232" rx={rx} fill="#000" opacity="0.35" />
      <rect x="24" y="38" width="352" height="232" rx={rx} fill={art.plinth} />
      <rect x="24.5" y="38.5" width="351" height="231" rx={rx} fill="none" stroke="#fff" strokeOpacity="0.1" />

      <circle cx="160" cy="154" r="108" fill={art.platter} />
      <g className="origin-center [transform-box:fill-box] motion-safe:group-hover:animate-[spin_1.8s_linear_infinite]">
        <circle cx="160" cy="154" r="100" fill="#121110" />
        {[92, 82, 72, 62, 52].map((r) => (
          <circle key={r} cx="160" cy="154" r={r} fill="none" stroke="#fff" strokeOpacity="0.07" />
        ))}
        <circle cx="160" cy="154" r="34" fill={art.label} />
        <rect x="154" y="128" width="12" height="3" rx="1" fill="#000" opacity="0.35" />
      </g>
      <circle cx="160" cy="154" r="3.5" fill="#d9d9d9" />

      {/* Tonearm */}
      <rect x="326" y="200" width="12" height="12" rx="2" fill="#000" opacity="0.3" />
      <circle cx="324" cy="80" r="21" fill="#000" fillOpacity="0.25" stroke={art.arm} strokeOpacity="0.5" strokeWidth="2" />
      <circle cx="338" cy="60" r="9" fill={art.arm} />
      <path d="M324 80 L308 200 L264 236" fill="none" stroke={art.arm} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M264 236 L248 246" stroke={art.arm} strokeWidth="11" strokeLinecap="square" />
      <circle cx="324" cy="80" r="7" fill={art.arm} />

      <circle cx="58" cy="244" r="9" fill="#000" fillOpacity="0.2" stroke="#fff" strokeOpacity="0.25" />
      <circle cx="84" cy="244" r="9" fill="#000" fillOpacity="0.2" stroke="#fff" strokeOpacity="0.25" />
    </svg>
  );
}
