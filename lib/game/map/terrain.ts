/**
 * Terrain vocabulary for the map. Pure data — no three.js, no React.
 *
 * `height` is the world-space height of the tile's top surface above the base
 * slab. Varying it slightly per terrain gives the map readable relief under an
 * isometric camera without needing a real heightmap yet.
 */

export type TerrainId = "grass" | "dirt" | "path" | "forest" | "hills" | "water" | "sand" | "bridge"

export interface TerrainDef {
  id: TerrainId
  label: string
  /** Base tile colour, before per-tile jitter. */
  color: string
  /** Top surface height in world units. */
  height: number
  /** How much per-tile brightness variation to apply (0 = flat, 0.1 = subtle). */
  jitter: number
  /** Can buildings be placed here without clearing first? */
  buildable: boolean
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  grass: {
    id: "grass",
    label: "Clear land",
    color: "#77864b",
    height: 0.2,
    jitter: 0.14,
    buildable: true,
  },
  dirt: {
    id: "dirt",
    label: "Bare earth",
    color: "#a58658",
    height: 0.17,
    jitter: 0.1,
    buildable: true,
  },
  path: {
    id: "path",
    label: "Road",
    color: "#c9ab7a",
    height: 0.13,
    jitter: 0.08,
    buildable: false,
  },
  forest: {
    id: "forest",
    label: "Forest",
    color: "#4b5c33",
    height: 0.24,
    jitter: 0.16,
    buildable: false,
  },
  hills: {
    id: "hills",
    label: "Hills",
    color: "#8d8460",
    height: 0.62,
    jitter: 0.12,
    buildable: true,
  },
  water: {
    id: "water",
    label: "Water",
    color: "#4f8ab2",
    height: 0.11,
    jitter: 0.05,
    buildable: false,
  },
  sand: {
    id: "sand",
    label: "Beach",
    color: "#d3bd85",
    height: 0.16,
    jitter: 0.1,
    buildable: true,
  },
  bridge: {
    id: "bridge",
    label: "Bridge",
    color: "#9b7a4e",
    height: 0.14,
    jitter: 0.04,
    buildable: false,
  },
}

/**
 * Water renders by depth, not by its single TERRAIN entry: index 0 is shallow
 * shoreline water (depth 1), index 2 is deep water (depth 3). Deeper water also
 * sits a little lower, so banks read as banks under the isometric camera.
 */
export const WATER_DEPTH_COLORS = ["#6ba6c8", "#5893b9", "#4581aa"] as const
export const WATER_DEPTH_HEIGHTS = [0.115, 0.1, 0.088] as const
export const MAX_WATER_DEPTH = 3

/** Characters used in the ASCII map source. */
export const TERRAIN_CHARS: Record<string, TerrainId> = {
  ".": "grass",
  ",": "dirt",
  "=": "path",
  F: "forest",
  "^": "hills",
  "~": "water",
  "%": "sand",
  "#": "bridge",
}
