import { tavernExteriorBenches } from "./building-art/furnishings"
import { sheepPenLayout } from "./workshop-layout"
import type { BuildingDef, GameMap, TilePos } from "./map/types"

/** Clockwise quarter turns viewed from above; absent on older structures. */
export type BuildingRotation = 0 | 1 | 2 | 3

export function normalizeBuildingRotation(turns: number): BuildingRotation {
  return ((turns % 4 + 4) % 4) as BuildingRotation
}

export function rotatedFootprint(footprint: { w: number; d: number }, rotation = 0) {
  return rotation % 2 ? { w: footprint.d, d: footprint.w } : { w: footprint.w, d: footprint.d }
}

export function buildingYaw(rotation = 0): number {
  return -rotation * Math.PI / 2
}

/** Turn a point in the authored model's X/Z plane into its placed orientation. */
export function rotateBuildingPoint(x: number, z: number, rotation = 0): TilePos {
  switch (normalizeBuildingRotation(rotation)) {
    case 1: return { x: -z, z: x }
    case 2: return { x: -x, z: -z }
    case 3: return { x: z, z: -x }
    default: return { x, z }
  }
}

/** Centre a doorway on a whole tile, including even-width building fronts. */
export function buildingDoorOffset(width: number, type?: string): number {
  // The woodcutter opens onto its left-hand court; the sheep pen onto its hut door.
  return (type === "workshop" || type === "sheep-pen" ? 0 : Math.floor((width-1)/2))-(width-1)/2
}

/** Keep an integer arrival tile aligned with the door or the workshop's open court. */
export function buildingEntry(building: Pick<BuildingDef, "x" | "z" | "w" | "d" | "rotation" | "buildType">, inside = false, end: 1 | -1 = 1): TilePos {
  const local = rotatedFootprint(building, building.rotation)
  const doorX = building.buildType ? buildingDoorOffset(local.w,building.buildType) : -(local.w-1)/2
  const offset = rotateBuildingPoint(doorX, end * ((local.d - 1) / 2 + (inside ? 0 : 1)), building.rotation)
  return { x: building.x + (building.w - 1) / 2 + offset.x, z: building.z + (building.d - 1) / 2 + offset.z }
}

/** The open fold has its own gate beside the hut's separate doorway. */
export function buildingFoldEntry(building: BuildingDef, inside = false): TilePos {
  const { w, d } = rotatedFootprint(building, building.rotation)
  const gateX = sheepPenLayout(w).penLeft + Math.min(.62, d * .42) / 2
  const tileX = Math.round(gateX + (w - 1) / 2) - (w - 1) / 2
  const offset = rotateBuildingPoint(tileX, (d - 1) / 2 + (inside ? 0 : 1), building.rotation)
  return { x: building.x + (building.w - 1) / 2 + offset.x, z: building.z + (building.d - 1) / 2 + offset.z }
}

/** Reserved, walkable frontage; decorative scenery has no doorway to protect. */
export function buildingApproach(map: Pick<GameMap,"site">,building: BuildingDef): TilePos | null {
  if(building.id === map.site?.hovelId) return map.site.door
  if(["garden","cross","lumberCamp"].includes(building.buildType ?? "")) return null
  return buildingEntry(building)
}

/** Every doorway owns a clear approach; taverns also reserve their outdoor bench tiles. */
export function buildingApproaches(map: Pick<GameMap,"site">, building: BuildingDef): TilePos[] {
  const front=buildingApproach(map,building)
  if(!front) return []
  if (building.buildType === "tavern" && building.id !== map.site?.hovelId) {
    const { w, d } = rotatedFootprint(building, building.rotation)
    const benches = tavernExteriorBenches(w, d).map(bench => {
      const offset = rotateBuildingPoint(bench.x, bench.z, building.rotation)
      return { x: Math.round(building.x + (building.w - 1) / 2 + offset.x),
        z: Math.round(building.z + (building.d - 1) / 2 + offset.z) }
    })
    return [front, buildingEntry(building, false, -1), ...benches]
  }
  return building.buildType === "sheep-pen" ? [front, buildingFoldEntry(building)] : [front]
}
