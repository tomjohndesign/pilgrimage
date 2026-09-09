import { elevationStep } from "./elevation"
import { isRoadTerrain } from "./road"
import { ROUTE_DIRS } from "./route"
import { tileAt, type GameMap, type TilePos } from "./types"

export type Waymark = "shrine" | "road" | "trail"
export interface CrossroadArm { direction: TilePos; mark: Waymark }
export interface Crossroad { center: TilePos; arms: CrossroadArm[]; shrineFork?: boolean; junction?: TilePos }

const key = (map: GameMap, p: TilePos) => p.z * map.width + p.x
const same = (a: TilePos, b: TilePos) => a.x === b.x && a.z === b.z
const distance = (a: TilePos, b: TilePos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))
const RING = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const

const islands = new WeakMap<Crossroad[], Set<number>>()
/** Reserved ground: navigation, carts and construction all leave the post's island alone. */
export function crossroadIslandAt(map: GameMap, x: number, z: number): boolean {
  if (!map.crossroads?.length) return false
  let cells = islands.get(map.crossroads)
  if (!cells) { cells = new Set(map.crossroads.map(c => key(map, c.center))); islands.set(map.crossroads, cells) }
  const tx = Math.round(x), tz = Math.round(z)
  return tx >= 0 && tz >= 0 && tx < map.width && tz < map.depth && cells.has(tz * map.width + tx)
}

function destinationDistances(map: GameMap, destinations: TilePos[]) {
  const distances = new Int32Array(map.tiles.length).fill(-1), queue: TilePos[] = []
  for (const p of destinations) { distances[key(map, p)] = 0; queue.push(p) }
  for (let i = 0; i < queue.length; i++) for (const [dx, dz] of ROUTE_DIRS) {
    const a = queue[i], b = { x: a.x + dx, z: a.z + dz }, t = tileAt(map, b.x, b.z)
    if (!(isRoadTerrain(t) || t === "bridge") || distances[key(map, b)] >= 0) continue
    if (!Number.isFinite(elevationStep(map.elevation, key(map, a), key(map, b)))) continue
    distances[key(map, b)] = distances[key(map, a)] + 1; queue.push(b)
  }
  return distances
}

/** Cut a walk around an island, retaining a mapping for gameplay's road indices. */
function around(route: TilePos[], center: TilePos, start?: TilePos, end?: TilePos) {
  const ring = RING.map(([x, z]) => ({ x: center.x + x, z: center.z + z }))
  const result: TilePos[] = [], indices: number[] = []
  const add = (p: TilePos) => { if (!result.length || !same(result.at(-1)!, p)) result.push(p) }
  for (let i = 0; i < route.length;) {
    if (distance(route[i], center) > 1) { indices[i] = result.length; add(route[i++]); continue }
    const first = i
    while (i + 1 < route.length && distance(route[i + 1], center) <= 1) i++
    const last = i
    const a = first === 0 && start ? start : route[first]
    const b = last === route.length - 1 && end ? end : route[last]
    let ia = ring.findIndex(p => same(p, a)), ib = ring.findIndex(p => same(p, b))
    // Destination-only approaches may begin on the former junction itself.
    if (ia < 0) ia = ib >= 0 ? ib : 0
    if (ib < 0) ib = ia
    const clockwise = (ib - ia + 8) % 8, anticlockwise = (ia - ib + 8) % 8
    // Resolve half-circle ties by coordinates, so reversed walks use the same side.
    const step = clockwise < anticlockwise || (clockwise === anticlockwise && ia < ib) ? 1 : -1
    const length = Math.min(clockwise, anticlockwise), offset = result.length
    for (let j = 0; j <= length; j++) add(ring[(ia + step * j + 8) % 8])
    for (let j = first; j <= last; j++) indices[j] = Math.min(result.length - 1, offset + Math.round((j - first) / Math.max(1, last - first) * length))
    i++
  }
  return { route: result, indices }
}

/** Apply once after generation. A ring uses existing terrain rendering and real walking tiles. */
export function createCrossroads(map: GameMap): void {
  if (map.crossroads) return
  const shrine = destinationDistances(map, map.site ? [map.site.door] : [])
  const candidates: Crossroad[] = []
  for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
    if (!isRoadTerrain(tileAt(map, x, z))) continue
    const center = { x, z }, index = key(map, center)
    const directions = ROUTE_DIRS.filter(([dx, dz]) => {
      const next = tileAt(map, x + dx, z + dz)
      return isRoadTerrain(next) || next === "bridge"
    })
    if (directions.length < 3) continue
    // A filled stair-step corner is a broad bend, not a choice of destinations.
    const exits = directions.filter(([dx, dz]) => !directions.some(([sx, sz]) =>
      dx * sx + dz * sz === 0 && isRoadTerrain(tileAt(map, x + dx + sx, z + dz + sz))))
    if (exits.length < 1) continue
    candidates.push({ center, shrineFork: !!map.site && same(center, map.site.branch[0]), arms: directions.map(([dx, dz]) => {
      const n = (z + dz) * map.width + x + dx
      const toward = (field: Int32Array) => field[n] >= 0 && field[n] < field[index]
      return { direction: { x: dx, z: dz }, mark: map.tiles[n] === "path" || map.tiles[n] === "bridge" ? "road" : toward(shrine) ? "shrine" : "trail" }
    }) })
  }
  // The founding choice takes priority when several nearby tracks meet.
  candidates.sort((a, b) => Number(b.shrineFork) - Number(a.shrineFork))
  map.crossroads = []
  for (const crossroad of candidates) {
    const junction = crossroad.center
    if (map.crossroads.some(c => distance(c.center, junction) <= 3)) continue
    // A junction on an edge or beside an obstacle still needs a marker. Try
    // the adjoining ground. Narrow bridge landings can use the first dry
    // corner along an outgoing track, keeping the marker beside the fork.
    const fits = (center: TilePos) => {
      if (map.crossroads!.some(c => distance(c.center, center) <= 2)) return false
      if ((map.darkForests ?? []).some(grove => distance(grove.center, center) <= 2)) return false
      if (map.site && same(map.site.door, center)) return false
      const patch = [center, ...RING.map(([x, z]) => ({ x: center.x + x, z: center.z + z }))]
      return patch.every(p => {
        const terrain = tileAt(map, p.x, p.z)
        if (!terrain || terrain === "water" || terrain === "bridge" || terrain === "darkwood") return false
        if (map.buildings.some(b => p.x >= b.x - 1 && p.x <= b.x + b.w && p.z >= b.z - 1 && p.z <= b.z + b.d)) return false
        return ROUTE_DIRS.every(([dx, dz]) => {
          const next = { x: p.x + dx, z: p.z + dz }
          return distance(next, center) > 1 || Number.isFinite(elevationStep(map.elevation, key(map, p), key(map, next)))
        })
      })
    }
    const offsets: [number, number][] = []
    for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) offsets.push([x, z])
    offsets.sort((a, b) => a[0] ** 2 + a[1] ** 2 - b[0] ** 2 - b[1] ** 2)
    const connected = new Set<number>([key(map, junction)]), queue = [junction]
    for (let i = 0; i < queue.length; i++) for (const [dx, dz] of ROUTE_DIRS) {
      const p = { x: queue[i].x + dx, z: queue[i].z + dz }, index = key(map, p)
      if (distance(p, junction) > 3 || connected.has(index) || !isRoadTerrain(tileAt(map, p.x, p.z))) continue
      if (!Number.isFinite(elevationStep(map.elevation, key(map, queue[i]), index))) continue
      connected.add(index); queue.push(p)
    }
    const center = offsets.map(([x, z]) => ({ x: junction.x + x, z: junction.z + z }))
      .find(p => fits(p) && RING.some(([x, z]) => connected.has(key(map, { x: p.x + x, z: p.z + z }))))
    if (!center) continue
    const patch = [center, ...RING.map(([x, z]) => ({ x: center.x + x, z: center.z + z }))]
    const oldRoad = map.road ?? [], rerouted = around(oldRoad, center)
    const anchor = (index: number) => rerouted.route[rerouted.indices[index]]
    if (map.site) {
      map.site.branch = around(map.site.branch, center, anchor(map.site.junction)).route
      map.site.junction = rerouted.indices[map.site.junction]
    }
    for (const shortcut of map.shortcuts ?? []) {
      shortcut.tiles = around(shortcut.tiles, center, anchor(shortcut.entry), anchor(shortcut.exit)).route
      shortcut.entry = rerouted.indices[shortcut.entry]; shortcut.exit = rerouted.indices[shortcut.exit]
    }
    for (const town of map.towns ?? []) town.junction = rerouted.indices[town.junction]
    for (const grove of map.darkForests ?? []) grove.approach = around(grove.approach, center).route
    map.road = rerouted.route
    const surface = oldRoad.some(p => distance(p, center) <= 1) ? "path" : "track"
    for (const p of patch) map.tiles[key(map, p)] = same(p, center) ? "clearing" : surface
    for (const p of map.road) if (map.tiles[key(map, p)] !== "bridge") map.tiles[key(map, p)] = "path"
    map.crossroads.push({ ...crossroad, center, junction })
  }
  // Branch triggers live at the last shared road tile, including the new ring.
  const roadIndex = new Map((map.road ?? []).map((p, i) => [key(map, p), i]))
  if (map.site) {
    let leading = 0
    while (leading + 1 < map.site.branch.length && roadIndex.has(key(map, map.site.branch[leading + 1]))) leading++
    map.site.branch = map.site.branch.slice(leading)
    map.site.junction = roadIndex.get(key(map, map.site.branch[0])) ?? map.site.junction
  }
}
