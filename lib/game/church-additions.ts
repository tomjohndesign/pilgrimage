import { buildingEntry, normalizeBuildingRotation, rotateBuildingPoint, type BuildingRotation } from "./building-rotation"
import { isComplete } from "./construction"
import { isChapel, shrineLayout } from "./shrine-layout"
import type { BuildingDef, GameMap, TilePos } from "./map/types"

export interface ChurchWing {
  side: -1 | 1
  from: number
  to: number
  reach: number
  churchWidth: number
  doorZ: number
}

/** Measure a wing in the church's canonical frame, where its entrance is +Z. */
export function churchWing(map: Pick<GameMap, "buildings" | "site">, building: Pick<BuildingDef, "x" | "z" | "w" | "d" | "buildType">): ChurchWing | undefined {
  if (building.buildType !== "monk-shelter") return undefined
  const church = map.buildings.find(b => b.id === map.site?.hovelId)
  if (!church) return undefined
  const shape = shrineLayout(church, map.site?.door)
  const turn = normalizeBuildingRotation(-shape.rotation / (Math.PI / 2))
  const centre = rotateBuildingPoint(building.x + building.w / 2 - church.x - church.w / 2,
    building.z + building.d / 2 - church.z - church.d / 2, -turn)
  const across = turn % 2 ? building.d : building.w, along = turn % 2 ? building.w : building.d
  const side = Math.sign(centre.x) as -1 | 1
  const from = centre.z - along / 2, to = centre.z + along / 2
  if (!side || Math.abs(centre.x) - across / 2 !== shape.width / 2
    || from < -shape.depth / 2 || to > shape.depth / 2) return undefined
  return { side, from, to, reach: across, churchWidth: shape.width, doorZ: centre.z }
}

/** The room's +Z end always faces into the church; the player chooses its side. */
export function churchWingRotation(map: GameMap, at: TilePos, fallback: BuildingRotation): BuildingRotation {
  const church = map.buildings.find(b => b.id === map.site?.hovelId)
  if (!church) return fallback
  const shape = shrineLayout(church, map.site?.door), turn = normalizeBuildingRotation(-shape.rotation / (Math.PI / 2))
  const p = rotateBuildingPoint(at.x - church.x - (church.w - 1) / 2, at.z - church.z - (church.d - 1) / 2, -turn)
  return normalizeBuildingRotation(turn + (p.x < 0 ? 3 : 1))
}

export function churchAdditionError(map: GameMap, building: Pick<BuildingDef, "buildType" | "x" | "z" | "w" | "d">): string | null {
  if (building.buildType !== "monk-shelter") return null
  const church = map.buildings.find(b => b.id === map.site?.hovelId)
  if (church && (isChapel(church) || !isComplete(church))) return "Finish upgrading the chapel to a church before adding a monks’ residence."
  return churchWing(map, building) ? null : "Build the monks’ residence directly against a side wall of the church, within its length."
}

/** Completed wings add paired door tiles through the shared wall, never outside. */
export function churchWingGates(map: GameMap): Array<{ inside: TilePos; outside: TilePos }> {
  return map.buildings.filter(b => !!b.churchId && b.churchId === map.site?.hovelId && (!b.construction || b.construction.work >= b.construction.required))
    .map(b => ({ inside: buildingEntry(b), outside: buildingEntry(b, true) }))
}

export function completedChurchWings(map: GameMap): ChurchWing[] {
  return map.buildings.flatMap(b => !!b.churchId && b.churchId === map.site?.hovelId && (!b.construction || b.construction.work >= b.construction.required)
    ? churchWing(map, b) ?? [] : [])
}
