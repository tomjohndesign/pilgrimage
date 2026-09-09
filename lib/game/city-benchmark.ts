import { benchmarkWork } from "./benchmark-work"
import type { WanderSpot } from "./monk-wander"
import { withWalkingRouteQueries } from "./walking-route-queries"
import { cartLoadout, cartOffset } from "./transport/assets"
import { alignCart } from "./transport/follow"
import { cartPath } from "./transport/building-parking"
import { routeLength } from "./transport/roadside"
import { BUILD_CATALOG } from "./balance"
import { buildingEntrance, workerRoute } from "./construction"
import { finishElevation } from "./map/elevation"
import { surfaceHeight } from "./map/bridges"
import { isRoadTerrain } from "./map/road"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap, type TilePos } from "./map/types"
import { makeRng } from "./rng"
import type { SimState } from "./sim"

// Opt-in fixture in the real /play scene. Keep it attached to the stable road
// identity so settlement publications retain it without changing saved maps.
export type CityBenchmarkMode = "gameplay" | "routing-stress"
interface City {
  mode: CityBenchmarkMode
  centre: TilePos
  streets: TilePos[]
  destinations: TilePos[]
  neighbours: number[][]
  buildings: number
}
const cities = new WeakMap<NonNullable<GameMap["road"]>, City>()
const journeys = new WeakMap<SimState, {
  people: Map<number, { rng: () => number; destination: number; trips: number }>
  assigned: number; completed: number; failed: number; destinations: Set<number>
}>()
const replayJourneys = new WeakMap<SimState, {
  routes: Map<number, { from: number; to: number; points: WanderSpot[] }>; reused: number
}>()
export function benchmarkCity(map: GameMap) { return map.road ? cities.get(map.road) : undefined }

/** 240 complete catalogue buildings, two-tile streets and the generated forest
 * beyond the town. Authored geometry, sprite trees, wildlife and render passes
 * are the same ones used in a normal game. */
export function createBenchmarkCity(source: GameMap, mode: CityBenchmarkMode = "gameplay"): GameMap {
  if (source.width < 192 || source.depth < 128) throw new Error("City benchmark needs a map at least 192 × 128")
  const map = structuredClone(source), columns = 20, rows = 12, block = 8
  const left = Math.floor((map.width - columns * block) / 2), top = Math.floor((map.depth - rows * block) / 2)
  const right = left + columns * block, bottom = top + rows * block
  for (let z = top - 2; z <= bottom + 2; z++) for (let x = left - 2; x <= right + 2; x++) {
    const i = z * map.width + x
    map.tiles[i] = x >= left && z >= top && ((x - left) % block < 2 || (z - top) % block < 2) ? "path" : "grass"
    if (map.elevation) map.elevation.height[i] = 0
    if (map.water) { map.water.depth[i] = 0; delete map.water.flow[i] }
  }
  if (map.elevation) finishElevation(map.elevation, map.width, map.depth,
    Uint8Array.from(map.water?.depth ?? map.tiles.map(() => 0)), map.water?.surface ?? map.tiles.map(() => 0))
  map.buildings = map.buildings.filter(b => b.x + b.w <= left || b.x >= right || b.z + b.d <= top || b.z >= bottom)
  if (!map.buildings.some(b => b.id === map.site?.hovelId)) map.site = undefined
  const kinds = ["house", "house", "house", "shelter", "tavern", "market", "workshop", "storehouse", "hall", "guard-post"]
  const destinations: TilePos[] = [], streets: TilePos[] = []
  for (let z = 0; z < rows; z++) for (let x = 0; x < columns; x++) {
    const i = z * columns + x, def = BUILD_CATALOG.find(b => b.id === kinds[i % kinds.length])!
    const building = { ...def, buildType: def.id, id: `city-${i}`, x: left + x * block + 3, z: top + z * block + 2, rotation: 0 as const }
    map.buildings.push(building)
    const entrance = buildingEntrance(building)
    // Connect each door to the next east/west street, including the deep tavern.
    for (let dz = entrance.z; dz <= top + (z + 1) * block; dz++) map.tiles[dz * map.width + entrance.x] = "path"
    destinations.push(entrance)
    streets.push({ x: left + x * block + .5, z: top + z * block + .5 })
  }
  const roadZ = top + rows / 2 * block
  map.road = Array.from({ length: map.width }, (_, x) => ({ x, z: roadZ }))
  // A connected approach for ambient road systems outside the city bounds.
  for (const p of map.road) map.tiles[p.z * map.width + p.x] = map.water?.depth[p.z * map.width + p.x] ? "bridge" : "path"
  map.shortcuts = []
  if (map.site) {
    const door = map.site.door, junction = door.x
    const branch = Array.from({ length: Math.abs(door.z - roadZ) + 1 }, (_, i) => ({ x: door.x, z: roadZ + i * Math.sign(door.z - roadZ) }))
    map.site = { ...map.site, junction, branch }
    for (const p of branch) if (p.z < top || p.z > bottom || p.x < left || p.x > right)
      map.tiles[p.z * map.width + p.x] = map.water?.depth[p.z * map.width + p.x] ? "bridge" : "track"
  }
  const neighbours = destinations.map((a, i) => destinations.flatMap((b, j) =>
    i !== j && Math.abs(a.x - b.x) + Math.abs(a.z - b.z) <= 40 ? [j] : []))
  cities.set(map.road, { mode, centre: { x: left + columns * block / 2, z: roadZ }, streets, destinations, neighbours, buildings: destinations.length })
  return map
}

/** Assign fresh, deterministic local journeys as residents arrive. Movement,
 * needs, foot contacts and A* all run through the existing simulation. This
 * intentionally stresses routing traffic rather than autonomous job decisions. */
export function routeBenchmarkCity(sim: SimState, map: GameMap) {
  if (benchmarkCity(map)?.mode !== "routing-stress") return
  return withWalkingRouteQueries(map, () => assignCityJourneys(sim, map))
}

function assignCityJourneys(sim: SimState, map: GameMap) {
  const city = benchmarkCity(map)
  if (!city) return
  const replaying = process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1" && benchmarkWork.replayRoutes
  let replay = replayJourneys.get(sim)
  if (replaying && !replay) { replay = { routes: new Map(), reused: 0 }; replayJourneys.set(sim, replay) }
  if (!replaying) replayJourneys.delete(sim)
  let state = journeys.get(sim)
  if (!state) { state = { people: new Map(), assigned: 0, completed: 0, failed: 0, destinations: new Set() }; journeys.set(sim, state) }
  for (const actor of sim.travelers.values()) {
    let person = state.people.get(actor.id)
    if (!person) {
      const rng = makeRng((map.seed ?? 0) ^ Math.imul(actor.id + 1, 0x45d9f3b))
      const destination = Math.floor(rng() * city.destinations.length), start = (actor.convoy ? city.streets : city.destinations)[destination]
      person = { rng, destination, trips: 0 }; state.people.set(actor.id, person)
      actor.x = tileToWorldX(map, start.x); actor.z = tileToWorldZ(map, start.z); actor.y = surfaceHeight(map, start.x, start.z)
      actor.activity = "fromBuild"; actor.constructionReturn = []
      actor.roadShortcut = undefined
      if (actor.convoy) actor.cartPose = alignCart(actor, Math.PI / 2,
        -cartOffset(cartLoadout(actor.id).puller) * actor.convoyScale)
    }
    if (actor.constructionReturn?.length || actor.roadShortcut) continue
    if (person.trips) state.completed++
    let options = city.neighbours[person.destination]
    if (actor.convoy) {
      // A wagon needs a swept route between street junctions. Pedestrian doors
      // are not parking bays, and teleported carts must begin at their real hitch.
      const start = city.streets[person.destination]
      options = options.filter(i => Math.abs(city.streets[i].x - start.x) + Math.abs(city.streets[i].z - start.z) === 8)
      const first = Math.floor(person.rng() * options.length)
      let assigned = false
      for (let attempt = 0; attempt < options.length; attempt++) {
        const destination = options[(first + attempt) % options.length], target = city.streets[destination]
        const goal = { x: tileToWorldX(map, target.x), z: tileToWorldZ(map, target.z) }
        const route = cartPath(map, actor.cartPose!, goal, cartLoadout(actor.id).puller, actor.convoyScale, { trees: [] })
        if (!route) continue
        actor.activity = "fromBuild"
        actor.roadShortcut = { from: route.entry[0], to: goal, via: route.entry.slice(1, -1),
          start: actor.progress, end: actor.progress, distance: 0, length: routeLength(route.entry) }
        person.destination = destination; person.trips++
        state.assigned++; state.destinations.add(destination); assigned = true
        break
      }
      if (!assigned) state.failed++
      continue
    }
    const repeated = replaying ? replay?.routes.get(actor.id) : undefined
    if (repeated && (person.destination === repeated.to || person.destination === repeated.from)) {
      const reverse = person.destination === repeated.to
      actor.activity = "fromBuild"
      actor.constructionReturn = repeated.points.map(point => ({ ...point }))
      if (reverse) actor.constructionReturn.reverse()
      person.destination = reverse ? repeated.from : repeated.to
      person.trips++; replay!.reused++; state.assigned++; state.destinations.add(person.destination)
      continue
    }
    const destination = options[Math.floor(person.rng() * options.length)]
    const route = workerRoute(map, actor, city.destinations[destination])
    if (!route?.length) { state.failed++; continue }
    if (replaying) replay!.routes.set(actor.id, { from: person.destination, to: destination, points: route.map(point => ({ ...point })) })
    actor.activity = "fromBuild"; actor.constructionReturn = route
    person.destination = destination; person.trips++
    state.assigned++; state.destinations.add(destination)
  }
}

export function cityBenchmarkStats(sim: SimState | null, map: GameMap) {
  const city = benchmarkCity(map), state = sim && journeys.get(sim)
  if (!city) return null
  const activities: Record<string, number> = {}
  let onRoad = 0, offRoad = 0, nearRoad = 0, employed = 0
  for (const actor of sim?.travelers.values() ?? []) {
    activities[actor.activity] = (activities[actor.activity] ?? 0) + 1
    if (actor.employer) employed++
    const x = worldToTileX(map, actor.x), z = worldToTileZ(map, actor.z)
    if (isRoadTerrain(map.tiles[z * map.width + x])) onRoad++; else offRoad++
    // Lane offsets and roadside social stops legitimately leave the exact
    // road tile. Report proximity separately; neither metric proves adherence.
    let nearby = false
    for (let dz = -1; dz <= 1 && !nearby; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = x + dx, cz = z + dz
      if (cx >= 0 && cz >= 0 && cx < map.width && cz < map.depth && isRoadTerrain(map.tiles[cz * map.width + cx])) { nearby = true; break }
    }
    if (nearby) nearRoad++
  }
  return { mode: city.mode, activities, onRoad, offRoad, nearRoad, employed,
    footprintContacts: map.footpaths?.contacts.size ?? 0, footprintEdges: map.footpaths?.edges.size ?? 0,
    replayCached: sim ? replayJourneys.get(sim)?.routes.size ?? 0 : 0, replayed: sim ? replayJourneys.get(sim)?.reused ?? 0 : 0,
    buildings: city.buildings, assigned: state?.assigned ?? 0, completed: state?.completed ?? 0,
    failed: state?.failed ?? 0, uniqueDestinations: state?.destinations.size ?? 0,
    active: sim ? [...sim.travelers.values()].filter(s => s.constructionReturn?.length || s.roadShortcut).length : 0 }
}
