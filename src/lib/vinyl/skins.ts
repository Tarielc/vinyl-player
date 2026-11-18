// Turntable models ("decks") the hero can show. Each .glb lives in public/models
// (exported from E:\BLENDER) and names its moving parts differently, so this
// maps them onto one rig: spinning parts, the label, the tonearm and knobs.

export type SkinId = "walnut" | "console" | "minimal" | "stave";

export interface ArmConfig {
  /** The tonearm node; its origin must sit on the pivot bearing. */
  node: string;
  /**
   * Swing angles in degrees about the vertical axis through the pivot, measured
   * from the pose the arm has in the file (positive = away from the spindle).
   * The model's own `userData` (glTF extras) overrides these when present.
   */
  restDeg: number;
  leadInDeg: number;
  leadOutDeg: number;
  /** How far the cue lift raises the headshell. */
  liftDeg: number;
}

export interface KnobConfig {
  node: string;
  axis: "x" | "y" | "z";
  /** `motor` turns with the platter on/off, `volume` follows the volume. */
  bind: "motor" | "volume";
  fromDeg: number;
  toDeg: number;
}

export interface SkinConfig {
  id: SkinId;
  name: string;
  /** One line for the deck switcher. */
  blurb: string;
  url: string;
  /** Approximate download size, for the loading readout. */
  bytes: number;
  /** Nodes the motor spins about their local Y axis. */
  spin: string[];
  /** The record label: a node, or a material inside one of the spinning meshes. */
  label: { node: string } | { material: string };
  /** Meshes (by material name) hidden while a cover is on the label. */
  hideWithCover?: string[];
  arm: ArmConfig;
  knobs?: KnobConfig[];
  /** Nodes left out when framing the camera (open lids make the box too tall). */
  frameExclude?: string[];
  /** Animation clips applied at their last frame on load, e.g. one that opens the lid. Clips never play. */
  holdLastFrame?: string[];
}

export const SKINS: readonly SkinConfig[] = [
  {
    id: "walnut",
    name: "Walnut",
    blurb: "Walnut plinth, aluminium arm",
    url: "/models/Vinyl3.glb",
    bytes: 998_040,
    spin: ["Turntable_Disc"],
    label: { node: "Record_Label" },
    arm: { node: "Tonearm", restDeg: 18, leadInDeg: 0, leadOutDeg: -24.03, liftDeg: 6 },
    knobs: [{ node: "Knob_Start", axis: "y", bind: "motor", fromDeg: 0, toDeg: -45 }],
    frameExclude: ["DustCover"],
  },
  {
    id: "console",
    name: "Console",
    blurb: "Radiogram with a smoked lid",
    url: "/models/Vinyl1.glb",
    bytes: 3_420_832,
    spin: ["Platter_Spin", "Record_Spin"],
    label: { node: "Record_Label" },
    arm: { node: "Tonearm", restDeg: 18, leadInDeg: -0.3, leadOutDeg: -24.5, liftDeg: 6 },
    knobs: [{ node: "Knob_Volume", axis: "z", bind: "volume", fromDeg: 135, toDeg: -135 }],
    frameExclude: ["Lid_Hinge"],
  },
  {
    id: "minimal",
    name: "Minimal",
    blurb: "Low-poly, no lid",
    url: "/models/Vinyl2.glb",
    bytes: 95_524,
    spin: ["Turntable_Disc"],
    label: { material: "VP_Label" },
    hideWithCover: ["VP_LabelMark"],
    arm: { node: "Tonearm", restDeg: 28, leadInDeg: 12.6, leadOutDeg: -8, liftDeg: 5 },
  },
  {
    id: "stave",
    name: "Stave",
    blurb: "Walnut cabinet with speakers, smoked lid",
    // E:\BLENDER\export\Crosley_Stave.glb
    url: "/models/Crosley_Stave.glb",
    bytes: 3_571_780,
    // Record and Record_Label are children of Platter, so they turn with it.
    spin: ["Platter"],
    label: { node: "Record_Label" },
    // The file has the stylus mid-record: lead-in and lead-out put it at 146 mm and 60 mm
    // from the spindle (a 12" LP), and rest lays the arm tube over the rest post.
    arm: { node: "Tonearm", restDeg: 37, leadInDeg: 12.6, leadOutDeg: -10.8, liftDeg: 6 },
    knobs: [{ node: "Knob_Volume", axis: "y", bind: "volume", fromDeg: 135, toDeg: -135 }],
    frameExclude: ["Lid_Hinge"],
    // The lid is closed in the file; Lid_Open's last frame has it up.
    holdLastFrame: ["Lid_Open"],
  },
];

export const DEFAULT_SKIN: SkinId = "walnut";

export function getSkin(id: SkinId): SkinConfig {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
