/**
 * Terrain vocabulary for the map. Pure data — no three.js, no React.
 *
 * `height` is the world-space height of the tile's top surface above the base
 * slab. Varying it slightly per terrain gives the map readable relief under an
 * isometric camera without needing a real heightmap yet.
 */

export type TerrainId = "grass" | "dirt" | "path" | "forest" | "hills"

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
}

/** Characters used in the ASCII map source. */
export const TERRAIN_CHARS: Record<string, TerrainId> = {
  ".": "grass",
  ",": "dirt",
  "=": "path",
  F: "forest",
  "^": "hills",
}
