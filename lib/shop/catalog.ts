// Placeholder catalogue for the "turntables for sale" section. Makers, models
// and prices are made up; replace with real listings (or a CMS) later.

import type { SkinId } from "@/lib/vinyl/skins";

export type Drive = "Belt" | "Direct" | "Portable";

export interface TurntableArt {
  plinth: string;
  platter: string;
  label: string;
  arm: string;
  shape: "square" | "rounded" | "case";
}

export interface Turntable {
  id: string;
  name: string;
  maker: string;
  drive: Drive;
  /** USD */
  price: number;
  blurb: string;
  specs: string[];
  /** 3D model that can be put on the deck in the hero. */
  skin?: SkinId;
  art: TurntableArt;
}

export const DRIVES: readonly Drive[] = ["Belt", "Direct", "Portable"];

export const CATALOG: readonly Turntable[] = [
  {
    id: "walnut-deck",
    name: "Walnut Deck",
    maker: "Hollow Pine Audio",
    drive: "Belt",
    price: 649,
    blurb: "Hand-oiled walnut plinth, aluminium tonearm and an acrylic dust cover.",
    specs: ["33⅓ / 45 rpm", "Walnut", "Acrylic lid"],
    skin: "walnut",
    art: { plinth: "#7a4527", platter: "#2a2826", label: "#efe9dc", arm: "#cfcfcf", shape: "square" },
  },
  {
    id: "parlour-console",
    name: "Parlour Console",
    maker: "Northfield",
    drive: "Belt",
    price: 1180,
    blurb: "A radiogram with a smoked lid, a tuner dial and twin speakers behind cloth.",
    specs: ["33⅓ / 45 / 78 rpm", "FM tuner", "Smoked lid"],
    skin: "console",
    art: { plinth: "#8a4a2a", platter: "#1d1c1b", label: "#d85a30", arm: "#e2e2e2", shape: "rounded" },
  },
  {
    id: "minimal-one",
    name: "Minimal One",
    maker: "Lockgroove",
    drive: "Belt",
    price: 329,
    blurb: "Low-profile and lidless: a platter, an arm and nothing you don't need.",
    specs: ["33⅓ rpm", "Birch ply", "No lid"],
    skin: "minimal",
    art: { plinth: "#b07a45", platter: "#2f2a25", label: "#378add", arm: "#1d1d1d", shape: "square" },
  },
  {
    id: "studio-direct",
    name: "Studio Direct DD-2",
    maker: "Kiln & Co.",
    drive: "Direct",
    price: 899,
    blurb: "High-torque direct drive with pitch control, built for long sessions.",
    specs: ["33⅓ / 45 rpm", "±8% pitch", "Steel chassis"],
    art: { plinth: "#1f1f1f", platter: "#3a3a3a", label: "#2b5cff", arm: "#d0d0d0", shape: "square" },
  },
  {
    id: "bone-edition",
    name: "Bone Edition",
    maker: "Hollow Pine Audio",
    drive: "Belt",
    price: 549,
    blurb: "White lacquer plinth, carbon-fibre arm and a felt mat in warm grey.",
    specs: ["33⅓ / 45 rpm", "Lacquer", "Carbon arm"],
    art: { plinth: "#e9e4d8", platter: "#8c8a84", label: "#a4875f", arm: "#262420", shape: "rounded" },
  },
  {
    id: "weekender",
    name: "Weekender",
    maker: "Northfield",
    drive: "Portable",
    price: 199,
    blurb: "A suitcase turntable with a built-in speaker and a battery for the park.",
    specs: ["33⅓ / 45 rpm", "Speaker", "8 h battery"],
    art: { plinth: "#5d5f48", platter: "#262420", label: "#e7b464", arm: "#d8d2c2", shape: "case" },
  },
  {
    id: "carbon-reference",
    name: "Carbon Reference",
    maker: "Kiln & Co.",
    drive: "Direct",
    price: 2400,
    blurb: "Acrylic platter, carbon arm and an outboard power supply on its own shelf.",
    specs: ["33⅓ / 45 rpm", "Acrylic platter", "Outboard PSU"],
    art: { plinth: "#2c2f33", platter: "#5f6b75", label: "#e7b464", arm: "#bfc5ca", shape: "square" },
  },
  {
    id: "ember-compact",
    name: "Ember Compact",
    maker: "Lockgroove",
    drive: "Belt",
    price: 279,
    blurb: "Compact belt drive with USB out for digitising the records you love.",
    specs: ["33⅓ / 45 rpm", "USB out", "Built-in preamp"],
    art: { plinth: "#c4532d", platter: "#231f1c", label: "#efe9dc", arm: "#efe9dc", shape: "rounded" },
  },
];

export const formatPrice = (usd: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(usd);

export const driveLabel = (drive: Drive) => (drive === "Portable" ? drive : `${drive} drive`);
