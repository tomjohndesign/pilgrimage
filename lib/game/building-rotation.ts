import type { BuildingDef, TilePos } from "./map/types"

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

/** Keep the yard's original front-left arrival tile attached to its open side. */
export function lumberCampEntry(building: Pick<BuildingDef, "x" | "z" | "w" | "d" | "rotation">, inside = false): TilePos {
  const local = rotatedFootprint(building, building.rotation)
  const offset = rotateBuildingPoint(-(local.w - 1) / 2, (local.d - 1) / 2 + (inside ? 0 : 1), building.rotation)
  return { x: building.x + (building.w - 1) / 2 + offset.x, z: building.z + (building.d - 1) / 2 + offset.z }
}
