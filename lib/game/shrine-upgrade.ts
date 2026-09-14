import { isComplete } from "./construction"
import type { GameMap, BuildingDef } from "./map/types"
import { tileAt } from "./map/types"
import { TERRAIN } from "./map/terrain"
import { buildingApproaches } from "./building-rotation"
import { settlementRoute, shrineRoadHead } from "./settlement-route"
import { isChapel } from "./shrine-layout"
import type { Settlement } from "./settlement"

export const CHURCH_COST = { gold: 120, wood: 80 }
export const CHURCH_RENOWN_BONUS = 30
export const CHAPEL_MONKS = 4
export const CHURCH_MONKS = 8

const shrine = (map: GameMap) => map.buildings.find(b => b.id === map.site?.hovelId)
export const shrineMonkCapacity = (map: GameMap) => {
  const building = shrine(map)
  return !building ? Infinity : (isChapel(building) || !isComplete(building)) ? CHAPEL_MONKS : CHURCH_MONKS
}
export const shrineDonationMultiplier = (map: GameMap) => {
  const building = shrine(map)
  return building && (isChapel(building) || !isComplete(building)) ? .5 : 1
}
export const shrineBuildingRenown = (map: GameMap, base: number) => {
  const building = shrine(map)
  return base + (building?.buildType === "church" && isComplete(building) ? CHURCH_RENOWN_BONUS : 0)
}

/** Enlarge behind the same doorway so the founding approach stays connected. */
export function churchPlan(map: GameMap): BuildingDef | null {
  const chapel = shrine(map), door = map.site?.door
  if (!chapel || !door || !isChapel(chapel)) return null
  if (door.x < chapel.x || door.x >= chapel.x + chapel.w) {
    return { ...chapel, buildType: "church", x: door.x < chapel.x ? door.x + 1 : door.x - 5, z: door.z - 1,
      w: 5, d: 3, rotation: door.x < chapel.x ? 1 : 3, height: 1.18, label: "Church" }
  }
  return { ...chapel, buildType: "church", x: door.x - 1, z: door.z < chapel.z ? door.z + 1 : door.z - 5,
    w: 3, d: 5, rotation: door.z < chapel.z ? 2 : 0, height: 1.18, label: "Church" }
}

/** Space for the nave and attached rooms, in the final church's orientation.
 * Side strips retain the full wall length so the residence can sit forward or
 * back. Keep this shared by placement and the build overlay.
 */
export function churchDevelopmentPlot(map: GameMap): BuildingDef | null {
  const church = shrine(map)
  if (church && map.site?.churchPlot) return { ...church, ...map.site.churchPlot }
  // Older worlds have existing neighbours; preserve their established layout.
  return churchPlan(map)
}

export function churchExpansionContains(map: GameMap, x: number, z: number): boolean {
  const plot = churchDevelopmentPlot(map)
  return !!plot && x >= plot.x && x < plot.x + plot.w && z >= plot.z && z < plot.z + plot.d
}

export function churchUpgradeError(map: GameMap, resources: Settlement["resources"]): string | null {
  const church = churchPlan(map)
  if (!church) return map.buildings.some(b => b.id === map.site?.hovelId && !isComplete(b))
    ? "The church upgrade is under construction." : "The shrine is already a church."
  const contains = (p: { x: number; z: number }) => p.x >= church.x && p.x < church.x + church.w && p.z >= church.z && p.z < church.z + church.d
  for (let z = church.z; z < church.z + church.d; z++) for (let x = church.x; x < church.x + church.w; x++) {
    const ground = tileAt(map, x, z)
    if (!ground || !TERRAIN[ground].buildable) return "The church needs clear, buildable ground behind the chapel."
  }
  const others = map.buildings.filter(b => b.id !== church.id)
  if (others.some(b => b.x < church.x + church.w && church.x < b.x + b.w && b.z < church.z + church.d && church.z < b.z + b.d))
    return "Another building occupies the church’s 3 × 5 plot."
  if (others.some(b => buildingApproaches(map, b).some(contains))) return "Keep the neighbouring building entrances clear."
  const planned = { ...map, buildings: map.buildings.map(b => b.id === church.id ? church : b) }
  const head = shrineRoadHead(planned)
  if (!head || !settlementRoute(planned, planned.buildings, head, map.site!.door)) return "Keep a clear route from the road to the church door."
  if (resources.gold < CHURCH_COST.gold || resources.wood < CHURCH_COST.wood) return `Requires ${CHURCH_COST.gold} gold and ${CHURCH_COST.wood} wood.`
  return null
}
