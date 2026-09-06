import { rotatedFootprint, buildingEntry, type BuildingRotation } from "./building-rotation"
import { settlementRoute } from "./settlement-route"
import { isWoods, TERRAIN } from "./map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "./map/types"

/**
 * What the player can build, and where. Pure data — no three.js, no React —
 * so placement rules can be unit-tested and the sim can read a building's
 * jobs without knowing how it is drawn.
 *
 * A building is a change to the world that travelers react to (see sim.ts):
 * a woodcutter’s hut is a place with work in it, and a jobless traveler who hears
 * of an open place at the junction may settle and take it. The generator
 * places only the hovel; everything here is the player's doing.
 */

export type BuildingKind = "workshop"

export interface BuildingKindDef {
  id: BuildingKind
  label: string
  /** What the HUD says the place is for. */
  blurb: string
  /** Footprint in tiles. */
  w: number
  d: number
  /** Body height in world units. */
  height: number
  color: string
  roofColor: string
  /** Work slots — how many settlers the place takes on. */
  jobs: number
  /** How far from the footprint centre its workers range, in tiles. */
  workRadius: number
  /** Trades that take to the work eagerly; anyone jobless will still take it. */
  trades: readonly string[]
}

export const BUILDING_KINDS: Record<BuildingKind, BuildingKindDef> = {
  workshop: {
    id: "workshop",
    label: "Woodcutter’s hut",
    blurb: "Three jobs felling nearby woods and carrying timber to storage.",
    w: 2,
    d: 2,
    height: 0.85,
    color: "#7a5a3a",
    roofColor: "#54402c",
    jobs: 3,
    workRadius: 8,
    trades: ["woodcutting", "labour"],
  },
}

/** A building the player put down: a BuildingDef that also knows its kind. */
export interface PlacedBuilding extends BuildingDef {
  kind: BuildingKind
}

/** World-space centre of a footprint. */
export function buildingCentre(map: GameMap, b: Pick<BuildingDef, "x" | "z" | "w" | "d">): { x: number; z: number } {
  return {
    x: tileToWorldX(map, b.x) + (b.w - 1) / 2,
    z: tileToWorldZ(map, b.z) + (b.d - 1) / 2,
  }
}

function footprintsOverlap(
  a: Pick<BuildingDef, "x" | "z" | "w" | "d">,
  b: Pick<BuildingDef, "x" | "z" | "w" | "d">,
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d
}

/** Woods within the work radius that a logger can reach from the building entrance. */
export function hasWoodsInReach(
  map: GameMap, def: BuildingKindDef, x: number, z: number,
  existing: readonly BuildingDef[] = [],
  rotation: BuildingRotation = 0,
): boolean {
  const footprint = rotatedFootprint(def, rotation)
  const cx = x + (footprint.w - 1) / 2
  const cz = z + (footprint.d - 1) / 2
  const r = def.workRadius
  for (let tz = Math.floor(cz - r); tz <= Math.ceil(cz + r); tz++) {
    for (let tx = Math.floor(cx - r); tx <= Math.ceil(cx + r); tx++) {
      if (Math.hypot(tx - cx, tz - cz) > r) continue
      const terrain = tileAt(map, tx, tz)
      if (terrain && isWoods(terrain) && settlementRoute(map, [...existing, { ...def, ...footprint, rotation, x, z, id: "workshop-preview" }],
        buildingEntry({ ...footprint, rotation, x, z }), { x: tx, z: tz }, true)) return true
    }
  }
  return false
}

export type PlacementProblem = "terrain" | "occupied" | "noWoods" | "access"

export const PLACEMENT_PROBLEM_LABELS: Record<PlacementProblem, string> = {
  terrain: "Needs open, buildable ground",
  occupied: "Something already stands here",
  noWoods: "No woods within reach",
  access: "Needs a clear route from the shrine to the building entrance",
}

/**
 * Why a building of this kind can't go with its origin (minimum corner) on
 * tile (x, z), or null if it can: every footprint tile must be buildable
 * ground, nothing may already stand there, and a woodcutter’s hut needs trees to
 * fell within its reach.
 */
export function placementProblem(
  map: GameMap,
  existing: readonly BuildingDef[],
  kind: BuildingKind,
  x: number,
  z: number,
  rotation: BuildingRotation = 0,
): PlacementProblem | null {
  const def = BUILDING_KINDS[kind]
  const footprint = { x, z, ...rotatedFootprint(def, rotation) }
  for (let dz = 0; dz < footprint.d; dz++) {
    for (let dx = 0; dx < footprint.w; dx++) {
      const terrain = tileAt(map, x + dx, z + dz)
      if (!terrain || !TERRAIN[terrain].buildable) return "terrain"
    }
  }
  if (existing.some((b) => footprintsOverlap(b, footprint))) return "occupied"
  if (map.site) {
    const planned = { ...def, ...footprint, rotation, id: "workshop-preview" }
    const entrance = buildingEntry(planned)
    if (!settlementRoute(map, [...existing, planned], map.site.door, entrance)) return "access"
    // A new footprint must not cut off a building already connected to the shrine.
    if (existing.some((b) => (b.buildType === "workshop" || b.buildType === "storehouse" || b.id.startsWith("workshop-")) &&
      !settlementRoute(map, [...existing, planned], map.site!.door, buildingEntry(b)))) return "access"
  }
  if (def.workRadius > 0 && !hasWoodsInReach(map, def, x, z, existing, rotation)) return "noWoods"
  return null
}

/** The building as it would stand at (x, z), or null where it can't. `serial` keeps ids unique. */
export function planBuilding(
  map: GameMap,
  existing: readonly BuildingDef[],
  kind: BuildingKind,
  x: number,
  z: number,
  serial: number,
  rotation: BuildingRotation = 0,
): PlacedBuilding | null {
  if (placementProblem(map, existing, kind, x, z, rotation) !== null) return null
  const def = BUILDING_KINDS[kind]
  return {
    id: `${kind}-${serial}`,
    kind,
    buildType: kind,
    label: def.label,
    x,
    z,
    ...rotatedFootprint(def, rotation),
    rotation,
    height: def.height,
    color: def.color,
    roofColor: def.roofColor,
  }
}
