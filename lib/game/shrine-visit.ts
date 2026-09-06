import { buildingStepAllowed, shrineGates } from "./building-navigation"
import { tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./map/types"
import { settlementRoute } from "./settlement-route"

export const DEFAULT_ADMISSION_FEE = 2

export function admissionFee(map: GameMap): number {
  return map.buildings.find(b => b.id === map.site?.hovelId)?.admissionFee ?? DEFAULT_ADMISSION_FEE
}

/** Join the approach to a gate via the grounds, then step inside to pray.
 * Rotate preferred gates between visitors and repeat visits. */
export function shrineVisitRoute(map: GameMap, visitor: number, visits: number): TilePos[] | null {
  const site = map.site
  const shrine = map.buildings.find(b => b.id === site?.hovelId)
  if (!site || !shrine) return null
  const gates = shrineGates(shrine)
  for (let i = 0; i < gates.length; i++) {
    const gate = gates[(visitor + visits + i) % gates.length]
    if (!buildingStepAllowed(map, map.buildings, gate.outside, gate.inside, true)) continue
    const approach = settlementRoute(map, map.buildings, site.door, gate.outside)
    if (approach) return [...site.branch, ...approach.slice(1), gate.inside]
  }
  return null
}

/** Match the displayed relic at the centre of the enclosure. */
export function relicHeading(map: GameMap, visitor: { x: number; z: number }): number | null {
  const shrine = map.buildings.find(b => b.id === map.site?.hovelId)
  if (!shrine) return null
  return Math.atan2(tileToWorldX(map, shrine.x) + (shrine.w - 1) / 2 - visitor.x,
    tileToWorldZ(map, shrine.z) + (shrine.d - 1) / 2 - visitor.z)
}
