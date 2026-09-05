import { OUTLINE_THICKNESS_PX } from "../render/outline"
import type { TerrainId } from "./terrain"
import { tileAt, type GameMap } from "./types"

/**
 * Road development tiers. The road is one terrain id ("path") on the map; how
 * built-up it looks is a separate, world-wide tier — early game it's a trodden
 * trail, and as the pilgrimage grows it gets surfaced with gravel, cobbles,
 * and finally cut flagstone. Pure data plus colour maths — no three.js.
 *
 * `weathering` is how strongly the surroundings show on the surface: a dirt
 * trail takes moss and dust readily, dressed stone barely at all. The
 * renderer multiplies `roadTint` into the tier texture per tile. Grass is
 * never a tint: the road is laid over the real grass and the grass shows
 * through wherever the surface is thin or worn away.
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
   * trail wanders and frays, gravel less so; laid stone is cut straight (0).
   */
  edgeWear: number
  /**
   * A paved road is built, not worn: it is laid edge to edge across its tiles
   * with straight sides, whatever the traffic, instead of wearing into ruts.
   */
  paved: boolean
}

export const ROAD_TIERS: RoadTierDef[] = [
  {
    tier: 0,
    id: "trail",
    label: "Trodden trail",
    textureUrl: "/textures/road-trail.png",
    weathering: 1,
    edgeWear: 1,
    paved: false,
  },
  {
    tier: 1,
    id: "gravel",
    label: "Gravel road",
    textureUrl: "/textures/road-gravel.png",
    weathering: 0.65,
    edgeWear: 0.75,
    paved: false,
  },
  {
    tier: 2,
    id: "cobble",
    label: "Cobbled road",
    textureUrl: "/textures/road-cobble.png",
    weathering: 0.4,
    edgeWear: 0,
    paved: true,
  },
  {
    tier: 3,
    id: "flagstone",
    label: "Flagstone way",
    textureUrl: "/textures/road-flagstone.png",
    weathering: 0.2,
    edgeWear: 0,
    paved: true,
  },
]

export const DEFAULT_ROAD_TIER = 0
export const MAX_ROAD_TIER = ROAD_TIERS.length - 1

/**
 * Which terrain wears the road surface. The main road ("path") and the branch
 * to the relic ("track") are separate ids so the road stays identifiable on
 * its own, but they are one continuous way to look at: the track wears the
 * same tier surface, and where the two meet no verge is eroded between them.
 */
type RoadTerrainId = Extract<TerrainId, "path" | "track">
type RoadContinuationId = RoadTerrainId | "bridge" | null

export function isRoadTerrain(terrain: TerrainId | null): terrain is RoadTerrainId {
  return terrain === "path" || terrain === "track"
}

/**
 * How traffic wears an unpaved road. It is a cart track: two bare wheel ruts
 * a little way in from either side, grass between them down the middle and
 * grass along the verges outside. Feet and wheels widen the ruts — outward
 * into the verge, inward into the middle strip — until at this many
 * travelers and up the surface is bare from side to side of its tiles.
 * The renderer adds small curved shoulders where junctions meet grassy land.
 */
export const TRAFFIC_FOR_BARE_ROAD = 30

/**
 * Both edges of a rut, as distances in tile units from the road tiles' outer
 * boundary (the middle of a straight road is 0.5 in). `edge` is the rut's
 * outer edge: how deep a grass verge remains inside the road tile, 0 when
 * the surface reaches the tile's side. `inner` is where the middle strip of
 * grass begins; past 0.5 there is none left.
 */
export interface RoadWear {
  edge: number
  inner: number
}

export const WEAR_UNTRODDEN: RoadWear = { edge: 0.2, inner: 0.36 }
export const WEAR_TRODDEN: RoadWear = { edge: 0, inner: 0.62 }
/** A paved road: laid to the tile's sides, with no grass down the middle. */
export const WEAR_PAVED: RoadWear = { edge: 0, inner: 1 }

/**
 * The rut edges for a stretch of road carrying `traffic` travelers. The main
 * road and the track to the relic carry different crowds, so each is worn by
 * its own count. Paved tiers ignore traffic (see RoadTierDef.paved).
 */
export function roadWear(traffic: number, tier: number = DEFAULT_ROAD_TIER): RoadWear {
  if (ROAD_TIERS[clampRoadTier(tier)].paved) return WEAR_PAVED
  const t = Math.min(1, Math.max(0, (Number.isFinite(traffic) ? traffic : 0) / TRAFFIC_FOR_BARE_ROAD))
  const k = t * t * (3 - 2 * t)
  return {
    edge: WEAR_UNTRODDEN.edge + (WEAR_TRODDEN.edge - WEAR_UNTRODDEN.edge) * k,
    inner: WEAR_UNTRODDEN.inner + (WEAR_TRODDEN.inner - WEAR_UNTRODDEN.inner) * k,
  }
}

/** Tunable look of the road surface, exposed to the HUD to explore. */
export interface RoadLook {
  /** 0–1: how solidly the surface covers the grass beneath. */
  opacity: number
  /** Brightness multiplier on the surface texture. */
  shade: number
  /** 0–1: how dark the line drawn along the surface's edge is; 0 for none. */
  edgeLine: number
  /**
   * Width of that line in CSS pixels — sized on screen like the outlines the
   * trees and buildings wear, so it stays the same at every zoom.
   */
  edgeWidth: number
}

export const DEFAULT_ROAD_LOOK: RoadLook = {
  opacity: 1,
  shade: 1,
  edgeLine: 0.45,
  edgeWidth: OUTLINE_THICKNESS_PX,
}

/** Settings and URL params may carry junk; snap to a real tier. */
export function clampRoadTier(tier: number): number {
  if (!Number.isFinite(tier)) return DEFAULT_ROAD_TIER
  return Math.min(MAX_ROAD_TIER, Math.max(0, Math.round(tier)))
}

/** What each kind of neighbour does to the road surface. */
const MOSS: Tint = [0.62, 0.74, 0.52] // damp and shaded under the trees
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
 * bare earth dusts it lighter — both scaled by the tier's `weathering`, so a
 * trail soaks up its surroundings and flagstone shrugs them off. White
 * ([1,1,1]) means untouched; open grass leaves it so, since the grass itself
 * shows through the surface rather than tinting it.
 */
export function roadTint(map: GameMap, x: number, z: number, tier: number): Tint {
  const { weathering } = ROAD_TIERS[clampRoadTier(tier)]

  let forest = 0
  let dirt = 0
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue
      const t = tileAt(map, x + dx, z + dz)
      if (t === "forest") forest++
      else if (t === "dirt") dirt++
    }
  }

  const tint: Tint = [1, 1, 1]
  mixInto(tint, MOSS, Math.min(1, forest / 4) * 0.55 * weathering)
  mixInto(tint, DUST, Math.min(1, dirt / 6) * 0.5 * weathering)
  return tint
}

/** Four flags in +x, -x, +z, -z order. */
export type SideFlags = [number, number, number, number]

export interface RoadEdge {
  /**
   * Which sides of this road tile face open land — 1 where the road stops and
   * terrain begins, 0 where it continues into more road. The renderer keeps a
   * verge along open sides only, so the surface stays seamless from road tile
   * to road tile. Off-map counts as road, so the road runs squarely off the
   * edge of the world.
   */
  open: SideFlags
  /** Solid 2x2 road patches at corners, in ++, +-, -+, -- order. */
  filledCorners: SideFlags
}


const EDGE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * True where the road carries on past this tile: more road, a bridge deck
 * (the way runs straight over it), or the edge of the world.
 */
export function roadContinues(terrain: TerrainId | null): terrain is RoadContinuationId {
  return terrain === null || isRoadTerrain(terrain) || terrain === "bridge"
}

/**
 * Edge data for the road tile at (x, z). See RoadEdge. What colour the land
 * behind each open side is belongs to the renderer, which knows how it would
 * have painted that land tile itself.
 */
export function roadEdge(map: GameMap, x: number, z: number): RoadEdge {
  const open: SideFlags = [0, 0, 0, 0]
  for (let side = 0; side < 4; side++) {
    const [dx, dz] = EDGE_DIRS[side]
    if (!roadContinues(tileAt(map, x + dx, z + dz))) open[side] = 1
  }
  const filledCorners: SideFlags = [0, 0, 0, 0]
  for (let corner = 0; corner < 4; corner++) {
    const xSide = corner < 2 ? 0 : 1
    const zSide = corner % 2 === 0 ? 2 : 3
    const dx = xSide === 0 ? 1 : -1
    const dz = zSide === 2 ? 1 : -1
    // Off-map and bridges continue a lane but do not create a paved plaza.
    if (
      isRoadTerrain(tileAt(map, x + dx, z)) &&
      isRoadTerrain(tileAt(map, x, z + dz)) &&
      isRoadTerrain(tileAt(map, x + dx, z + dz))
    ) {
      filledCorners[corner] = 1
    }
  }
  return { open, filledCorners }
}

/**
 * Rounded inside shoulders at T/cross junctions. Each shared corner records
 * which quadrant faces grass (1: ++, 2: +-, 3: -+, 4: --). All four tiles
 * receive the same shape so its surface and outline cross their seams.
 */
export function junctionShoulders(map: GameMap, excluded: ReadonlySet<number> = new Set()): Map<number, SideFlags> {
  const shoulders = new Map<number, SideFlags>()
  const road = (x: number, z: number) => isRoadTerrain(tileAt(map, x, z)) && !excluded.has(z * map.width + x)
  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      if (!road(x, z)) continue
      if (EDGE_DIRS.filter(([dx, dz]) => road(x + dx, z + dz)).length < 3) continue
      for (const dx of [-1, 1]) {
        for (const dz of [-1, 1]) {
          if (!road(x + dx, z) || !road(x, z + dz)) continue
          // Shoulders may use a grassy verge, never water or occupied land.
          if (tileAt(map, x + dx, z + dz) !== "grass" || excluded.has((z + dz) * map.width + x + dx)) continue
          if (map.buildings.some(b => x + dx >= b.x && x + dx < b.x + b.w && z + dz >= b.z && z + dz < b.z + b.d)) continue
          const code = (dx > 0 ? 1 : 3) + (dz > 0 ? 0 : 1)
          const cornerX = x + (dx > 0 ? 1 : 0)
          const cornerZ = z + (dz > 0 ? 1 : 0)
          for (const tx of [x, x + dx]) {
            for (const tz of [z, z + dz]) {
              const index = tz * map.width + tx
              const flags = shoulders.get(index) ?? [0, 0, 0, 0]
              const corner = (cornerX - tx === 1 ? 0 : 2) + (cornerZ - tz === 1 ? 0 : 1)
              flags[corner] = code
              shoulders.set(index, flags)
            }
          }
        }
      }
    }
  }
  return shoulders
}
