import { TERRAIN } from "./terrain"
import { tileAt, type GameMap } from "./types"

/**
 * Road development tiers. The road is one terrain id ("path") on the map; how
 * built-up it looks is a separate, world-wide tier — early game it's a trodden
 * trail, and as the pilgrimage grows it gets surfaced with gravel, cobbles,
 * and finally cut flagstone. Pure data plus colour maths — no three.js.
 *
 * `weathering` is how strongly the surroundings show on the surface: a dirt
 * trail takes moss and grass readily, dressed stone barely at all. The
 * renderer multiplies `roadTint` into the tier texture per tile.
 */

export interface RoadTierDef {
  /** Index into ROAD_TIERS; tiers are ordered from least to most developed. */
  tier: number
  id: string
  label: string
  /** Path under public/. Seamless both axes; mapped by world position. */
  textureUrl: string
  /** 0–1: how much the surroundings tint this surface. */
  weathering: number
  /**
   * 0–1: how ragged the road's edges are where it meets open land. A trodden
   * trail wanders and frays; laid stone is cut much straighter — but no road
   * is ever perfectly square, so even flagstone keeps a little bite.
   */
  edgeWear: number
  /**
   * 0–1: roughly what share of the surface the grass has reclaimed. On a
   * trodden trail whole stretches are greener than brown; gravel keeps a
   * few tufts between the stones; dressed stone barely any. The renderer
   * blends the grass texture over the surface by world-space noise, and
   * more of it beside open grass (see RoadEdge.grass).
   */
  sward: number
}

export const ROAD_TIERS: RoadTierDef[] = [
  {
    tier: 0,
    id: "trail",
    label: "Trodden trail",
    textureUrl: "/textures/road-trail.png",
    weathering: 1,
    edgeWear: 1,
    sward: 0.25,
  },
  {
    tier: 1,
    id: "gravel",
    label: "Gravel road",
    textureUrl: "/textures/road-gravel.png",
    weathering: 0.65,
    edgeWear: 0.75,
    sward: 0.1,
  },
  {
    tier: 2,
    id: "cobble",
    label: "Cobbled road",
    textureUrl: "/textures/road-cobble.png",
    weathering: 0.4,
    edgeWear: 0.5,
    sward: 0.04,
  },
  {
    tier: 3,
    id: "flagstone",
    label: "Flagstone way",
    textureUrl: "/textures/road-flagstone.png",
    weathering: 0.2,
    edgeWear: 0.3,
    sward: 0.015,
  },
]

export const DEFAULT_ROAD_TIER = 0
export const MAX_ROAD_TIER = ROAD_TIERS.length - 1

/** Settings and URL params may carry junk; snap to a real tier. */
export function clampRoadTier(tier: number): number {
  if (!Number.isFinite(tier)) return DEFAULT_ROAD_TIER
  return Math.min(MAX_ROAD_TIER, Math.max(0, Math.round(tier)))
}

/** What each kind of neighbour does to the road surface. */
const MOSS: Tint = [0.62, 0.74, 0.52] // damp and shaded under the trees
const FRINGE: Tint = [0.85, 0.94, 0.74] // grass creeping in from the verges
const DUST: Tint = [1.07, 1.03, 0.94] // dry dirt blowing across

type Tint = [number, number, number]

function mixInto(tint: Tint, target: Tint, amount: number): void {
  tint[0] += (target[0] - tint[0]) * amount
  tint[1] += (target[1] - tint[1]) * amount
  tint[2] += (target[2] - tint[2]) * amount
}

/**
 * Per-tile weathering: an RGB multiplier for the road surface at (x, z),
 * derived from the 8 surrounding tiles. Forest darkens the road with moss,
 * grass fringes it green, bare earth dusts it lighter — all scaled by the
 * tier's `weathering`, so a trail soaks up its surroundings and flagstone
 * shrugs them off. White ([1,1,1]) means untouched.
 */
export function roadTint(map: GameMap, x: number, z: number, tier: number): Tint {
  const { weathering } = ROAD_TIERS[clampRoadTier(tier)]

  let forest = 0
  let grass = 0
  let dirt = 0
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue
      const t = tileAt(map, x + dx, z + dz)
      if (t === "forest") forest++
      else if (t === "grass") grass++
      else if (t === "dirt") dirt++
    }
  }

  const tint: Tint = [1, 1, 1]
  mixInto(tint, MOSS, Math.min(1, forest / 4) * 0.55 * weathering)
  mixInto(tint, FRINGE, Math.min(1, grass / 6) * 0.4 * weathering)
  mixInto(tint, DUST, Math.min(1, dirt / 6) * 0.5 * weathering)
  return tint
}

export interface RoadEdge {
  /**
   * Which sides of this road tile face open land, in +x, -x, +z, -z order —
   * 1 where the road stops and terrain begins, 0 where it continues into more
   * road. The renderer erodes a ragged margin along open sides only, so the
   * surface stays seamless from road tile to road tile. Off-map counts as
   * road, so the road runs squarely off the edge of the world.
   */
  open: [number, number, number, number]
  /** sRGB 0–1 colour of the land the eroded margin reveals: the average base
   * colour of the neighbours behind the open sides ([1,1,1] if none). */
  verge: Tint
  /** 0–1: share of the open sides that face grass, so the eroded margin
   * shows the grass texture rather than a flat colour where it should. */
  vergeGrass: number
  /** 0–1: share of the 8 surrounding tiles that are grass. The renderer
   * lets the sward reclaim more of a road tile the more grass hems it in,
   * so a trail through a meadow greens over and one through bare earth
   * stays dusty. */
  grass: number
}

const EDGE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

function hexToRgb01(hex: string): Tint {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ]
}

/** Edge data for the road tile at (x, z). See RoadEdge. */
export function roadEdge(map: GameMap, x: number, z: number): RoadEdge {
  const open: RoadEdge["open"] = [0, 0, 0, 0]
  const verge: Tint = [0, 0, 0]
  let openCount = 0
  let openGrass = 0

  let around = 0
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx !== 0 || dz !== 0) && tileAt(map, x + dx, z + dz) === "grass") around++
    }
  }
  const grass = around / 8

  for (let side = 0; side < 4; side++) {
    const [dx, dz] = EDGE_DIRS[side]
    const neighbour = tileAt(map, x + dx, z + dz)
    if (neighbour === null || neighbour === "path") continue
    open[side] = 1
    openCount++
    if (neighbour === "grass") openGrass++
    const [r, g, b] = hexToRgb01(TERRAIN[neighbour].color)
    verge[0] += r
    verge[1] += g
    verge[2] += b
  }

  if (openCount === 0) return { open, verge: [1, 1, 1], vergeGrass: 0, grass }
  return {
    open,
    verge: [verge[0] / openCount, verge[1] / openCount, verge[2] / openCount],
    vergeGrass: openGrass / openCount,
    grass,
  }
}
