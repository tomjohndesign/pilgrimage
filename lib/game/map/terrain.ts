/**
 * Terrain vocabulary for the map. Pure data — no three.js, no React.
 *
 * Every tile shares one height: the ground is a flat plane and terrain reads
 * through colour alone. Per-terrain relief was tried and dropped — a step
 * between neighbouring tiles exposes a dark side face that outlines every
 * terrain boundary, which is exactly the tiled look the map is meant to avoid.
 */

/** World-space height of every tile's top surface above the base slab. */
export const TILE_HEIGHT = 0.2

export type TerrainId =
  | "grass"
  | "dirt"
  | "path"
  | "track"
  | "forest"
  | "darkwood"
  | "clearing"
  | "hills"
  | "water"
  | "sand"
  | "bridge"

/** Woods of either kind — what the forest-shade field and the tree line count. */
export function isWoods(id: TerrainId): boolean {
  return id === "forest" || id === "darkwood"
}

export interface TerrainDef {
  id: TerrainId
  label: string
  /** Base tile colour, before per-tile jitter. */
  color: string
  /** How much per-tile brightness variation to apply (0 = flat, 0.1 = subtle). */
  jitter: number
  /**
   * How strongly the forest-shade gradient tints this tile (0 = ignore it,
   * 1 = fully repainted). The greens take it strongly so woods fade into
   * grassland; worked surfaces like the road mostly hold their own colour.
   */
  shadeBlend: number
  /** Can buildings be placed here without clearing first? */
  buildable: boolean
  /** Can player-controlled units walk here? Forest proper is solid trees. */
  passable: boolean
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  grass: {
    id: "grass",
    label: "Clear land",
    color: "#77864b",
    jitter: 0.14,
    shadeBlend: 0.55,
    buildable: true,
    passable: true,
  },
  dirt: {
    id: "dirt",
    label: "Bare earth",
    color: "#a58658",
    jitter: 0.1,
    shadeBlend: 0.3,
    buildable: true,
    passable: true,
  },
  path: {
    id: "path",
    label: "Road",
    color: "#c9ab7a",
    jitter: 0.08,
    shadeBlend: 0.15,
    buildable: false,
    passable: true,
  },
  // The branch off the road to the relic: a beaten track, not engineered road.
  // Its own terrain so the main road stays identifiable (and stable) on its own.
  track: {
    id: "track",
    label: "Track",
    color: "#ad9468",
    jitter: 0.1,
    shadeBlend: 0.2,
    buildable: false,
    passable: true,
  },
  forest: {
    id: "forest",
    label: "Forest",
    color: "#4b5c33",
    jitter: 0.16,
    shadeBlend: 0.5,
    buildable: false,
    passable: false,
  },
  // The old growth at the heart of a forest: denser, taller, darker — and
  // where the dangerous things live. Impassable like forest; the main road
  // routes around it, and only the tracks cut through.
  darkwood: {
    id: "darkwood",
    label: "Dark forest",
    color: "#2e3b22",
    jitter: 0.14,
    shadeBlend: 0.35,
    buildable: false,
    passable: false,
  },
  clearing: {
    id: "clearing",
    label: "Forest clearing",
    color: "#69763f",
    jitter: 0.12,
    shadeBlend: 0.55,
    buildable: false,
    passable: true,
  },
  hills: {
    id: "hills",
    label: "Hills",
    color: "#8d8460",
    jitter: 0.12,
    shadeBlend: 0.25,
    buildable: true,
    passable: true,
  },
  water: {
    id: "water",
    label: "Water",
    color: "#4f8ab2",
    jitter: 0.05,
    shadeBlend: 0.15,
    buildable: false,
    passable: false,
  },
  sand: {
    id: "sand",
    label: "Beach",
    color: "#d3bd85",
    jitter: 0.1,
    shadeBlend: 0.25,
    buildable: true,
    passable: true,
  },
  bridge: {
    id: "bridge",
    label: "Bridge",
    color: "#9b7a4e",
    jitter: 0.04,
    shadeBlend: 0.15,
    buildable: false,
    passable: true,
  },
}

/**
 * Water renders by depth, not by its single TERRAIN entry: index 0 is shallow
 * shoreline water (depth 1), index 2 is deep water (depth 3). Colour only —
 * the ground is a flat plane, so depth never shows as relief.
 */
export const WATER_DEPTH_COLORS = ["#6ba6c8", "#5893b9", "#4581aa"] as const
export const MAX_WATER_DEPTH = 3

/** Characters used in the ASCII map source. */
export const TERRAIN_CHARS: Record<string, TerrainId> = {
  ".": "grass",
  ",": "dirt",
  "=": "path",
  "-": "track",
  F: "forest",
  D: "darkwood",
  o: "clearing",
  "^": "hills",
  "~": "water",
  "%": "sand",
  "#": "bridge",
}
