import { sheepPenLayout } from "./workshop-layout"
import { layoutHand } from "./building-layout"
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
export function buildingDoorOffset(width: number, type?: string, layoutSeed?: number, end: 1 | -1 = 1): number {
  // Three-tile homes can open centrally or opposite their hearth. Reflecting the
  // layout supplies both side doors, keeping the tavern's rear service door clear.
  const doorSeed = end === -1 ? Math.floor((layoutSeed ?? 0) / 3) : layoutSeed ?? 0
  if (width === 3 && ["house","tavern","hall","shelter","monk-shelter","storehouse"].includes(type ?? "")) return (doorSeed % 3 === 0 ? 0 : -1) * layoutHand(type, layoutSeed)
  // The woodcutter opens onto its left-hand court; the sheep pen onto its hut door.
  return ((type === "workshop" || type === "sheep-pen" ? 0 : Math.floor((width-1)/2))-(width-1)/2) * layoutHand(type, layoutSeed)
}

/** Keep an integer arrival tile aligned with the door or the workshop's open court. */
export function buildingEntry(building: Pick<BuildingDef, "x" | "z" | "w" | "d" | "rotation" | "buildType" | "layoutSeed">, inside = false, end: 1 | -1 = 1): TilePos {
  const local = rotatedFootprint(building, building.rotation)
  const doorX = building.buildType ? buildingDoorOffset(local.w,building.buildType,building.layoutSeed,end) : -(local.w-1)/2
  const offset = rotateBuildingPoint(doorX, end * ((local.d - 1) / 2 + (inside ? 0 : 1)), building.rotation)
  return { x: building.x + (building.w - 1) / 2 + offset.x, z: building.z + (building.d - 1) / 2 + offset.z }
}

/** The open fold has its own gate beside the hut's separate doorway. */
export function buildingFoldEntry(building: BuildingDef, inside = false): TilePos {
  const { w, d } = rotatedFootprint(building, building.rotation)
  const gateX = sheepPenLayout(w).penLeft + Math.min(.62, d * .42) / 2
  const tileX = Math.round(gateX + (w - 1) / 2) - (w - 1) / 2
  const offset = rotateBuildingPoint(tileX*layoutHand(building.buildType,building.layoutSeed), (d - 1) / 2 + (inside ? 0 : 1), building.rotation)
  return { x: building.x + (building.w - 1) / 2 + offset.x, z: building.z + (building.d - 1) / 2 + offset.z }
}

/** Reserved, walkable frontage; decorative scenery has no doorway to protect. */
export function buildingApproach(map: Pick<GameMap,"site">,building: BuildingDef): TilePos | null {
  if(building.id === map.site?.hovelId) return map.site.door
  if(["garden","cross","lumberCamp"].includes(building.buildType ?? "")) return null
  return buildingEntry(building)
}

/** Every doorway owns a clear approach; taverns also open onto a rear service path. */
export function buildingApproaches(map: Pick<GameMap,"site">, building: BuildingDef): TilePos[] {
  const front=buildingApproach(map,building)
  if(!front) return []
  return building.buildType === "tavern" && building.id !== map.site?.hovelId
    ? [front,buildingEntry(building,false,-1)] : building.buildType === "sheep-pen" ? [front, buildingFoldEntry(building)] : [front]
}
