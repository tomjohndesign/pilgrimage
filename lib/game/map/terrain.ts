/**
 * Terrain vocabulary for the map. Pure data — no three.js, no React.
 *
 * `height` is the world-space height of the tile's top surface above the base
 * slab. Varying it slightly per terrain gives the map readable relief under an
 * isometric camera without needing a real heightmap yet.
 */

export type TerrainId = "grass" | "dirt" | "path" | "forest" | "clearing" | "hills"

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
  /** Can player-controlled units walk here? Forest proper is solid trees. */
  passable: boolean
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  grass: {
    id: "grass",
    label: "Clear land",
    color: "#77864b",
    height: 0.2,
    jitter: 0.14,
    buildable: true,
    passable: true,
  },
  dirt: {
    id: "dirt",
    label: "Bare earth",
    color: "#a58658",
    height: 0.17,
    jitter: 0.1,
    buildable: true,
    passable: true,
  },
  path: {
    id: "path",
    label: "Road",
    color: "#c9ab7a",
    height: 0.13,
    jitter: 0.08,
    buildable: false,
    passable: true,
  },
  forest: {
    id: "forest",
    label: "Forest",
    color: "#4b5c33",
    height: 0.24,
    jitter: 0.16,
    buildable: false,
    passable: false,
  },
  clearing: {
    id: "clearing",
    label: "Forest clearing",
    color: "#69763f",
    height: 0.21,
    jitter: 0.12,
    buildable: false,
    passable: true,
  },
  hills: {
    id: "hills",
    label: "Hills",
    color: "#8d8460",
    height: 0.62,
    jitter: 0.12,
    buildable: true,
    passable: true,
  },
}

/** Characters used in the ASCII map source. */
export const TERRAIN_CHARS: Record<string, TerrainId> = {
  ".": "grass",
  ",": "dirt",
  "=": "path",
  F: "forest",
  o: "clearing",
  "^": "hills",
}
