import { settlementRoute } from "../settlement-route"
import { BUILD_CATALOG } from "../balance"
import { buildingApproaches, buildingEntry, rotatedFootprint, rotateBuildingPoint, type BuildingRotation } from "../building-rotation"
import { TILES_PER_DAY } from "../calendar"
import { levelBuildingGround } from "./elevation"
import { tileAt, type BuildingDef, type GameMap, type RoadsideTown, type TilePos } from "./types"

export const TOWN_SPACING = TILES_PER_DAY - 16
export const TOWN_CHAPEL_CLEARANCE = 48
export const TOWN_APPROACH_CLEARANCE = 20
const SEARCH_RADIUS = 8
// Prefer a slightly shorter leg when the ideal stop falls on water or steep land.
const SEARCH_OFFSETS = [0, ...Array.from({ length: SEARCH_RADIUS }, (_, i) => [i + 1, -i - 1]).flat(),
  ...Array.from({ length: 24 }, (_, i) => -SEARCH_RADIUS - i - 1)]
const NAMES = ["Alderford", "Hazelwick", "Birch End", "Willowbank", "Oakstead", "Ashbrook", "Elm Hollow", "Reedham"]

/** The house sits beside the tavern, with parallel roof ridges and aligned fronts. */
function townPlan(map: GameMap, junction: number, rotation: BuildingRotation, ordinal: number) {
  const road = map.road![junction]
  const outward = rotateBuildingPoint(0, -1, rotation)
  const entry = { x: road.x + outward.x * 2, z: road.z + outward.z * 2 }
  const id = `roadside-town-${ordinal}`
  const name = NAMES[((((map.seed ?? 0) >>> 0) % NAMES.length) + ordinal) % NAMES.length]
  const buildings = (["tavern", "house"] as const).map((buildType, index): BuildingDef => {
    const def = BUILD_CATALOG.find(b => b.id === buildType)!
    const size = rotatedFootprint(def, rotation)
    // Place the house directly against the tavern's side, with both fronts on the road side.
    const side = rotateBuildingPoint(index === 0 ? 0 : -3, 0, rotation)
    const origin = { ...size, x: 0, z: 0, rotation, buildType }
    const door = buildingEntry(origin)
    return { id: `${id}-${index}`, owner: "independent", townId: id, buildType,
      label: `${name} ${index === 0 ? "tavern" : "house"}`, rotation, ...size,
      x: entry.x + side.x - door.x, z: entry.z + side.z - door.z,
      height: def.height, color: def.color, roofColor: def.roofColor }
  })
  const x = Math.min(...buildings.map(b => b.x)) - 1
  const z = Math.min(...buildings.map(b => b.z)) - 1
  const right = Math.max(...buildings.map(b => b.x + b.w)) + 1
  const bottom = Math.max(...buildings.map(b => b.z + b.d)) + 1
  const patch: TilePos[] = []
  for (let tz = z; tz < bottom; tz++) for (let tx = x; tx < right; tx++) patch.push({ x: tx, z: tz })
  patch.push(road, { x: road.x + outward.x, z: road.z + outward.z })
  const occupied = (p: TilePos, b: BuildingDef, margin = 0) => p.x >= b.x - margin && p.x < b.x + b.w + margin
    && p.z >= b.z - margin && p.z < b.z + b.d + margin
  const chapel = map.buildings.find(b => b.id === map.site?.hovelId)
  if (chapel && buildings.some(b => Math.hypot(
    Math.max(chapel.x - b.x - b.w, b.x - chapel.x - chapel.w, 0),
    Math.max(chapel.z - b.z - b.d, b.z - chapel.z - chapel.d, 0),
  ) < TOWN_CHAPEL_CLEARANCE)) return null
  if (map.site?.branch.some(p => patch.some(q => Math.hypot(p.x - q.x, p.z - q.z) < TOWN_APPROACH_CLEARANCE))) return null
  // Keep the shrine, ancient groves, waterways and existing routes intact.
  if (patch.some(p => {
    const terrain = tileAt(map, p.x, p.z)
    return terrain === null || terrain === "water" || terrain === "bridge" || terrain === "darkwood"
      || !!map.water?.depth[p.z * map.width + p.x]
      || map.buildings.some(b => occupied(p, b, 2))
      || map.site?.branch.some(b => b.x === p.x && b.z === p.z)
  })) return null
  if (buildings.some(b => patch.some(p => occupied(p, b) && ["path", "track"].includes(tileAt(map, p.x, p.z)!)))) return null
  if (map.elevation) {
    const heights = patch.map(p => map.elevation!.height[p.z * map.width + p.x])
    if (Math.max(...heights) - Math.min(...heights) >= map.elevation.settings.cliffThreshold * .7) return null
  }
  const town: RoadsideTown = { id, name, junction, tavernId: buildings[0].id, buildingIds: buildings.map(b => b.id) }
  return { town, buildings, patch }
}

/** Mutates only a newly generated map. Distances follow road steps, including bends. */
export function addRoadsideTowns(map: GameMap): void {
  map.towns = []
  const road = map.road ?? []
  let target = Math.min(TOWN_SPACING / 2, Math.floor((road.length - 1) / 2))
  while (target < road.length - 12) {
    let placed = false
    for (const offset of SEARCH_OFFSETS) {
      if (placed) break
      const junction = target + offset
      if (junction < 12 || junction >= road.length - 12) continue
      for (const rotation of [0, 1, 2, 3] as const) {
        const plan = townPlan(map, junction, rotation, map.towns.length)
        if (!plan) continue
        // Plan on a private copy so a blocked entrance cannot leave half a town behind.
        const candidate = { ...map, tiles: [...map.tiles], buildings: [...map.buildings, ...plan.buildings] }
        for (const p of plan.patch) {
          const i = p.z * map.width + p.x
          if (candidate.tiles[i] !== "path" && candidate.tiles[i] !== "track") candidate.tiles[i] = "grass"
        }
        for (const b of plan.buildings) candidate.elevation = levelBuildingGround(candidate, b)
        let accessible = true
        for (const b of plan.buildings) for (const entrance of buildingApproaches(candidate, b)) {
          const route = settlementRoute(candidate, candidate.buildings, road[junction], entrance)
          if (!route) { accessible = false; break }
          for (const p of route) {
            const i = p.z * map.width + p.x
            if (candidate.tiles[i] !== "path" && candidate.tiles[i] !== "bridge") candidate.tiles[i] = "track"
          }
        }
        if (!accessible) continue
        // The generator also retains the original tile array while finishing the world.
        for (let i = 0; i < map.tiles.length; i++) map.tiles[i] = candidate.tiles[i]
        map.buildings.push(...plan.buildings)
        map.elevation = candidate.elevation
        map.towns.push(plan.town)
        target = junction + TOWN_SPACING
        placed = true
        break
      }
    }
    // Unsuitable terrain advances the search; never place a town in water or on a cliff.
    if (!placed) target += SEARCH_RADIUS * 2 + 1
  }
}
