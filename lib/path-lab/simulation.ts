import { buildingEntry, type BuildingRotation } from "../game/building-rotation"
import { MinHeap, ROUTE_DIRS } from "../game/map/route"
import { makeRng } from "../game/rng"
import { DEFAULT_PERMUTATION, type Permutation } from "./permutations"
import type { BuildingDef } from "../game/map/types"

export type Experiment = "routes" | "wear" | "town"
export interface PathSettings { traffic: number; wear: number; halfLife: number; preference: number; newPathCost: number; turnPenalty: number; permanentAt: number; roadFloor: number }
export const DEFAULT_PATH_SETTINGS: PathSettings = { traffic: 36, wear: .04, halfLife: 3, preference: .8, newPathCost: 1, turnPenalty: .4, permanentAt: .9, roadFloor: .3 }
export const LAB_DAY = 60
export const FIXED_STEP = .05
export const ESTABLISH = .45
export const ABANDON = .25
export const WIDTH = 34
export const DEPTH = 22
export const ROAD_Z = 16
export const indexAt = (x: number, z: number) => z * WIDTH + x
export const coords = (i: number) => ({ x: i % WIDTH, z: Math.floor(i / WIDTH) })
/** Progress is a fraction of the current edge, whose length may be sqrt(2). */
export interface Journey { id: number; route: number[]; edge: number; progress: number; returning: boolean; through: boolean }
export interface PathWorld {
  experiment: Experiment
  /** Wear influences route cost; both policies retain individual recurring journeys. */
  shared: boolean
  permutation: Permutation
  closedDestinations: Set<string>
  focus: string | null
  routeMemory: Map<string, number[]>
  terrainCost: Float64Array
  time: number
  remainder: number
  spawn: number
  serial: number
  completed: number
  wear: Float64Array
  /** Direction bits for edges that have actually carried traffic (or founding roads). */
  pathLinks: Uint8Array
  /** Undirected segment compaction: all commuters, in either direction, reinforce it. */
  edgeWear: Float64Array
  permanentEdges: Uint8Array
  permanentTiles: Uint8Array
  edgeUsers: Uint16Array
  recentDistance: number
  recentSharedDistance: number
  baseline: Float64Array
  established: Uint8Array
  connected: Uint8Array
  blocked: Uint8Array
  buildings: BuildingDef[]
  journeys: Journey[]
  trafficOn: boolean
}

const home = indexAt(1, ROAD_Z)
const hash = (n: number) => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value) }
export function neighbors(i: number): number[] {
  const { x, z } = coords(i)
  return ROUTE_DIRS.flatMap(([dx, dz]) => x + dx >= 0 && x + dx < WIDTH && z + dz >= 0 && z + dz < DEPTH ? [indexAt(x + dx, z + dz)] : [])
}
export const WALK_DIRS: ReadonlyArray<readonly [number, number]> = [...ROUTE_DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]]
const edgeDirection = new Map(WALK_DIRS.map(([dx, dz], direction) => [dz * WIDTH + dx, direction]))
const bendWeights = WALK_DIRS.map(([ax, az]) => WALK_DIRS.map(([bx, bz]) => {
  const steps = Math.round(Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz))))) / (Math.PI / 4))
  return steps === 0 ? 0 : .5 + steps * .5
}))

export function stepAllowed(blocked: Uint8Array, from: number, to: number): boolean {
  if (from < 0 || to < 0 || from >= blocked.length || to >= blocked.length || blocked[from] || blocked[to]) return false
  const a = coords(from), b = coords(to), dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z)
  if (Math.max(dx, dz) !== 1) return false
  // Both side tiles must be open: a diagonal cannot squeeze past a solid corner.
  return !dx || !dz || (!blocked[indexAt(a.x, b.z)] && !blocked[indexAt(b.x, a.z)])
}

export function walkingNeighbors(i: number, blocked: Uint8Array): number[] {
  const p = coords(i)
  return WALK_DIRS.flatMap(([dx, dz]) => {
    const x = p.x + dx, z = p.z + dz, next = indexAt(x, z)
    return x >= 0 && x < WIDTH && z >= 0 && z < DEPTH && stepAllowed(blocked, i, next) ? [next] : []
  })
}

export function edgeLength(from: number, to: number): number {
  const a = coords(from), b = coords(to)
  return Math.hypot(b.x - a.x, b.z - a.z)
}

export function routeClear(route: number[], blocked: Uint8Array): boolean {
  return route.every((i, n) => !blocked[i] && (n === 0 || stepAllowed(blocked, route[n - 1], i)))
}

/** Four forward directions per tile cover every undirected edge of the eight-neighbor grid. */
export function pathEdgeIndex(from: number, to: number): number {
  const delta = Math.abs(to - from)
  return Math.min(from, to) * 4 + (delta === 1 ? 0 : delta === WIDTH ? 1 : delta === WIDTH - 1 ? 2 : 3)
}

function edgeBaseline(world: PathWorld, i: number, settings: PathSettings): number {
  const main = i % 4 === 0 && Math.floor(Math.floor(i / 4) / WIDTH) === ROAD_Z ? settings.roadFloor : 0
  return Math.max(main, world.permanentEdges[i] ? ESTABLISH : 0)
}

function trailRecognition(world: PathWorld, from: number, to: number, fullDepth: number): number {
  const depth = Math.min(world.edgeWear[pathEdgeIndex(from, to)], world.wear[from], world.wear[to])
  const t = Math.min(1, Math.max(0, (depth - .04) / (fullDepth - .04)))
  return t * t * (3 - 2 * t)
}

/** One passage has little pull. Several passages make the common corridor increasingly legible. */
export function sharedTrailStrength(world: PathWorld, from: number, to: number): number {
  return trailRecognition(world, from, to, .6)
}

export function recordPathEdge(world: PathWorld, from: number, to: number): void {
  const a = coords(from), b = coords(to)
  const direction = WALK_DIRS.findIndex(([dx, dz]) => b.x - a.x === dx && b.z - a.z === dz)
  const reverse = WALK_DIRS.findIndex(([dx, dz]) => a.x - b.x === dx && a.z - b.z === dz)
  if (direction < 0 || reverse < 0) return
  world.pathLinks[from] |= 1 << direction
  world.pathLinks[to] |= 1 << reverse
}

const entryIndex = (b: BuildingDef) => { const p = buildingEntry(b); return indexAt(p.x, p.z) }
export function footprint(b: BuildingDef): number[] {
  return Array.from({ length: b.w * b.d }, (_, n) => indexAt(b.x + n % b.w, b.z + Math.floor(n / b.w)))
}
export function labBuilding(x: number, z: number, kind: "workshop" | "shelter", rotation: BuildingRotation, serial: number): BuildingDef {
  return { id: `lab-${serial}`, buildType: kind, label: kind === "workshop" ? "Woodcutter’s hut" : "Shelter", x, z, rotation, w: 2, d: 2, height: 1, color: "#9f7c51", roofColor: "#614c35" }
}

export function createPathWorld(experiment: Experiment, settings = DEFAULT_PATH_SETTINGS, shared = true, permutation: Permutation = DEFAULT_PERMUTATION): PathWorld {
  const size = WIDTH * DEPTH
  const world: PathWorld = { experiment, shared, permutation: { ...permutation }, closedDestinations: new Set(), focus: null,
    routeMemory: new Map(), terrainCost: new Float64Array(size), time: 0, remainder: 0, spawn: 0, serial: 0, completed: 0,
    wear: new Float64Array(size), pathLinks: new Uint8Array(size), edgeWear: new Float64Array(size * 4), edgeUsers: new Uint16Array(size * 4), recentDistance: 0, recentSharedDistance: 0, baseline: new Float64Array(size), established: new Uint8Array(size),
    permanentEdges: new Uint8Array(size * 4), permanentTiles: new Uint8Array(size),
    connected: new Uint8Array(size), blocked: new Uint8Array(size), buildings: [], journeys: [], trafficOn: true }
  const rng = makeRng(permutation.seed)
  for (let i = 0; i < size; i++) world.terrainCost[i] = rng() * .02
  if (permutation.layout === "original") {
    for (let z = 7; z <= 12; z++) for (let x = 12; x <= 15; x++) world.blocked[indexAt(x, z)] = 1
  } else if (permutation.layout === "bottleneck") {
    const wall = 13 + Math.floor(rng() * 7), gap = 3 + Math.floor(rng() * 7)
    for (let z = 0; z < DEPTH; z++) for (let x = wall; x <= wall + 1; x++) {
      if (z !== ROAD_Z && z !== gap && z !== gap + 1) world.blocked[indexAt(x, z)] = 1
    }
  } else {
    for (let grove = 0; grove < 7; grove++) {
      const cx = 4 + Math.floor(rng() * 25), cz = 2 + Math.floor(rng() * 17), radius = 1 + rng() * 2
      for (let z = 0; z < DEPTH; z++) for (let x = 2; x < WIDTH - 2; x++) {
        if (z !== ROAD_Z && Math.hypot(x - cx, z - cz) < radius) world.blocked[indexAt(x, z)] = 1
      }
    }
  }
  for (let x = 0; x < WIDTH; x++) {
    const i = indexAt(x, ROAD_Z)
    world.baseline[i] = settings.roadFloor
    world.wear[i] = experiment === "wear" ? .8 : settings.roadFloor
    if (x > 0) {
      recordPathEdge(world, i - 1, i)
      world.edgeWear[pathEdgeIndex(i - 1, i)] = world.wear[i]
    }
  }
  updateNetwork(world)
  if (permutation.layout === "original") {
    world.buildings = experiment === "routes"
      ? [labBuilding(23, 4, "workshop", 0, 0), labBuilding(27, 8, "workshop", 0, 1), labBuilding(19, 2, "workshop", 0, 2)]
      : [labBuilding(23, 5, "workshop", 0, 0)]
    world.buildings.forEach(b => footprint(b).forEach(i => { world.blocked[i] = 2 }))
  } else {
    // Rejection sampling preserves entrance access; the same seed produces the same map for both policies.
    for (let attempt = 0; attempt < 2500 && world.buildings.length < permutation.destinations; attempt++) {
      const cluster = world.buildings.length % 2
      const x = permutation.layout === "clusters" ? 3 + cluster * 18 + Math.floor(rng() * 7) : 2 + Math.floor(rng() * (WIDTH - 5))
      const z = 1 + Math.floor(rng() * (DEPTH - 4))
      const candidate = labBuilding(x, z, "workshop", Math.floor(rng() * 4) as BuildingRotation, world.buildings.length)
      if (!placementIssue(world, candidate, settings)) {
        world.buildings.push(candidate)
        footprint(candidate).forEach(i => { world.blocked[i] = 2 })
      }
    }
  }
  if (experiment === "wear") {
    // This experiment starts with an old network, including every destination, to make abandonment inspectable.
    for (const b of world.buildings) {
      const route = findRoute(world, home, entryIndex(b), { ...settings, preference: 0, newPathCost: 0, turnPenalty: 0 }, 0)
      route?.forEach((i, n) => {
        world.wear[i] = .8
        if (n > 0) { recordPathEdge(world, route[n - 1], i); world.edgeWear[pathEdgeIndex(route[n - 1], i)] = .8 }
      })
    }
  }
  updateNetwork(world)
  return world
}

/** Distance still matters; shared passage makes following an actual corridor easier than cutting across it. */
export function travelCost(world: PathWorld, from: number, to: number, settings: PathSettings, traveler: number): number {
  const preference = world.shared ? settings.preference : 0
  const common = preference > 0 ? sharedTrailStrength(world, from, to) : 0
  const ground = (world.wear[from] + world.wear[to]) / 2
  // Individual quirks fade on a recognizable shared trail, rather than preserving parallel lanes forever.
  const tie = hash(to + (traveler % 12) * 7919 + world.permutation.seed * 31) * .08 * (1 - common * preference)
  // A modest existing trail avoids the effort of breaking new ground, before it becomes a deep path.
  // Scale all ground costs equally so untouched maps retain the same individual route choices.
  const newGround = world.shared && settings.newPathCost > 0 ? settings.newPathCost * (1 - trailRecognition(world, from, to, .25)) : 0
  return (1 + world.terrainCost[to] + tie) * (1 + newGround) - preference * (.25 * ground ** 2 + .75 * common)
}

export function routeSharing(world: PathWorld, route: number[]): number {
  let shared = 0, distance = 0
  for (let n = 1; n < route.length; n++) {
    const length = edgeLength(route[n - 1], route[n])
    distance += length; shared += length * sharedTrailStrength(world, route[n - 1], route[n])
  }
  return distance > 0 ? shared / distance : 0
}

/** Route memory and search must price the same bends, including two 45° bends versus one 90° bend. */
export function routeCost(world: PathWorld, route: number[], settings: PathSettings, traveler = 0): number {
  let cost = 0, incoming = 8
  for (let n = 1; n < route.length; n++) {
    const from = route[n - 1], to = route[n], direction = edgeDirection.get(to - from)!
    cost += edgeLength(from, to) * travelCost(world, from, to, settings, traveler)
    if (world.shared && incoming !== 8) cost += settings.turnPenalty * bendWeights[incoming][direction]
    incoming = direction
  }
  return cost
}

/** Keep the previous route unless blocked or a new route is materially cheaper now. */
export function recurringRoute(world: PathWorld, start: number, end: number, settings: PathSettings, traveler: number): number[] | null {
  const key = `${traveler % 12}:${start}:${end}`
  const previous = world.routeMemory.get(key)
  const candidate = findRoute(world, start, end, settings, traveler)
  if (!candidate) return null
  const cost = (route: number[]) => routeCost(world, route, settings, traveler)
  if (previous && routeClear(previous, world.blocked)) {
    const joinsOthers = world.shared && (settings.preference > 0 || settings.newPathCost > 0) && routeSharing(world, candidate) > routeSharing(world, previous) + .01
    const improvement = joinsOthers ? .005 : .03
    if (cost(candidate) >= cost(previous) * (1 - improvement)) return [...previous]
  }
  // Bound memory across repeated placements and demand changes in a long-running playground.
  if (world.routeMemory.size >= 2048) world.routeMemory.delete(world.routeMemory.keys().next().value!)
  world.routeMemory.set(key, candidate)
  return [...candidate]
}

/** Incoming direction is part of search state: arriving at the same tile facing differently can save later turns. */
export function findRoute(world: PathWorld, start: number, end: number, settings: PathSettings, traveler = 0, blocked = world.blocked): number[] | null {
  if (start < 0 || end < 0 || start >= blocked.length || end >= blocked.length || blocked[start] || blocked[end]) return null
  const turnPenalty = world.shared ? settings.turnPenalty : 0, stride = turnPenalty > 0 ? 9 : 1
  const distance = new Float64Array(blocked.length * stride).fill(Infinity)
  const parents = new Int32Array(blocked.length * stride).fill(-1)
  const closed = new Uint8Array(blocked.length * stride)
  const goal = coords(end), heap = new MinHeap()
  const preference = world.shared ? settings.preference : 0
  const estimate = (i: number) => {
    const p = coords(i), dx = Math.abs(p.x - goal.x), dz = Math.abs(p.z - goal.z)
    return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * (1 - preference)
  }
  const startState = start * stride + (stride > 1 ? 8 : 0)
  distance[startState] = 0; heap.push(startState, estimate(start))
  while (heap.size) {
    const state = heap.pop(), current = Math.floor(state / stride), incoming = stride > 1 ? state % stride : 8
    if (closed[state]) continue
    if (current === end) {
      const route: number[] = []
      for (let i = state; i !== -1; i = parents[i]) route.push(Math.floor(i / stride))
      return route.reverse()
    }
    closed[state] = 1
    for (const next of walkingNeighbors(current, blocked)) {
      const direction = edgeDirection.get(next - current)!, nextState = next * stride + (stride > 1 ? direction : 0)
      if (closed[nextState]) continue
      const bend = incoming === 8 ? 0 : turnPenalty * bendWeights[incoming][direction]
      const cost = distance[state] + edgeLength(current, next) * travelCost(world, current, next, settings, traveler) + bend
      if (cost < distance[nextState]) { distance[nextState] = cost; parents[nextState] = state; heap.push(nextState, cost + estimate(next)) }
    }
  }
  return null
}

export function updateNetwork(world: PathWorld): void {
  world.connected.fill(0)
  const queue: number[] = []
  for (let i = 0; i < world.wear.length; i++) {
    const main = Math.floor(i / WIDTH) === ROAD_Z
    world.established[i] = !world.blocked[i] && (main || world.wear[i] >= ESTABLISH || (!!world.established[i] && world.wear[i] >= ABANDON)) ? 1 : 0
    if (main && !world.blocked[i]) { world.connected[i] = 1; queue.push(i) }
  }
  for (let head = 0; head < queue.length; head++) for (const next of walkingNeighbors(queue[head], world.blocked)) {
    if (world.established[next] && !world.connected[next]) { world.connected[next] = 1; queue.push(next) }
  }
}

export function placementIssue(world: PathWorld, candidate: BuildingDef, settings: PathSettings): string | null {
  const { x, z } = candidate, door = buildingEntry(candidate)
  if (x < 0 || z < 0 || x + candidate.w > WIDTH || z + candidate.d > DEPTH || door.x < 0 || door.z < 0 || door.x >= WIDTH || door.z >= DEPTH) return "Keep the building and entrance inside the map."
  const tiles = footprint(candidate)
  if (tiles.some(i => world.blocked[i])) return "Choose open ground away from buildings and woods."
  if (tiles.some(i => world.established[i])) return "Keep established paths clear."
  if (tiles.includes(home)) return "Keep the arrival point clear."
  if (world.journeys.some(j => tiles.includes(j.route[j.edge]) || tiles.includes(j.route[Math.min(j.edge + 1, j.route.length - 1)]))) return "Someone is passing through here. Try a clear tile."
  const entrance = entryIndex(candidate)
  if (world.blocked[entrance]) return "The entrance needs clear ground."
  if (candidate.buildType === "shelter" && ![entrance, ...neighbors(entrance)].some(i => world.connected[i])) return "Shelters need an entrance beside a connected, established path."
  const blocked = world.blocked.slice()
  tiles.forEach(i => { blocked[i] = 2 })
  if (world.journeys.some(j => j.edge < j.route.length - 1 && !stepAllowed(blocked, j.route[j.edge], j.route[j.edge + 1]))) return "Someone is passing this corner. Keep their current step clear."
  if (world.established.some((established, i) => established && WALK_DIRS.some(([dx, dz], direction) => {
    if (!dx || !dz || !(world.pathLinks[i] & (1 << direction))) return false
    const p = coords(i), next = indexAt(p.x + dx, p.z + dz)
    return world.established[next] && stepAllowed(world.blocked, i, next) && !stepAllowed(blocked, i, next)
  }))) return "Keep established diagonal paths clear, including their corners."
  if ([candidate, ...world.buildings].some(b => !findRoute(world, home, entryIndex(b), settings, 0, blocked))) return "Keep a clear route to every entrance."
  if (world.journeys.some(j => !findRoute(world, j.route[Math.min(j.edge + 1, j.route.length - 1)], j.route[j.route.length - 1], settings, j.id, blocked))) return "Keep a clear route for people already walking."
  return null
}

export function placeLabBuilding(world: PathWorld, candidate: BuildingDef, settings: PathSettings): string | null {
  if (world.buildings.length >= 10) return "This small playground has room for ten destinations. Restart to try a new layout."
  const issue = placementIssue(world, candidate, settings)
  if (issue) return issue
  world.buildings.push(candidate)
  footprint(candidate).forEach(i => { world.blocked[i] = 2; world.wear[i] = 0 })
  // Existing trips keep their current edge, then replan the remaining leg around the new site.
  world.journeys.forEach(j => {
    const at = Math.min(j.edge + 1, j.route.length - 1)
    const rest = findRoute(world, j.route[at], j.route[j.route.length - 1], settings, j.id)
    if (rest) j.route = [...j.route.slice(0, at), ...rest]
  })
  updateNetwork(world)
  return null
}

/** Integrate distance in each half of a grid edge; idle time never deposits wear. */
export function walkJourney(world: PathWorld, journey: Journey, distance: number, wear: number, permanentAt = DEFAULT_PATH_SETTINGS.permanentAt): boolean {
  while (distance > 1e-9 && journey.edge < journey.route.length - 1) {
    const from = journey.route[journey.edge], to = journey.route[journey.edge + 1]
    const length = edgeLength(from, to)
    const amount = Math.min(distance, (1 - journey.progress) * length)
    const start = journey.progress, end = Math.min(1, start + amount / length)
    recordPathEdge(world, from, to)
    const edge = pathEdgeIndex(from, to), commuter = 1 << (journey.id % 12)
    world.recentDistance += amount
    if (world.edgeUsers[edge] & ~commuter) world.recentSharedDistance += amount
    world.edgeUsers[edge] |= commuter
    world.edgeWear[edge] = Math.min(1, world.edgeWear[edge] + amount / length * wear)
    if (permanentAt > 0 && world.edgeWear[edge] >= permanentAt) {
      world.permanentEdges[edge] = 1
      world.permanentTiles[from] = world.permanentTiles[to] = 1
    }
    const first = Math.max(0, Math.min(.5, end) - Math.min(.5, start)) * length
    world.wear[from] = Math.min(1, world.wear[from] + first * wear)
    world.wear[to] = Math.min(1, world.wear[to] + (amount - first) * wear)
    journey.progress = end; distance -= amount
    if (journey.progress >= 1 - 1e-9) { journey.edge++; journey.progress = 0 }
  }
  return journey.edge >= journey.route.length - 1
}

function step(world: PathWorld, settings: PathSettings): void {
  world.time += FIXED_STEP
  const decay = 2 ** (-FIXED_STEP / (LAB_DAY * settings.halfLife))
  for (let i = 0; i < world.wear.length; i++) {
    world.baseline[i] = Math.max(Math.floor(i / WIDTH) === ROAD_Z ? settings.roadFloor : 0, world.permanentTiles[i] ? ESTABLISH : 0)
    world.wear[i] = world.baseline[i] + Math.max(0, world.wear[i] - world.baseline[i]) * decay
    if (world.wear[i] < .0001) world.wear[i] = 0
  }
  for (let i = 0; i < world.edgeWear.length; i++) {
    const baseline = edgeBaseline(world, i, settings)
    world.edgeWear[i] = baseline + Math.max(0, world.edgeWear[i] - baseline) * decay
    if (world.edgeWear[i] < .0001) { world.edgeWear[i] = 0; world.edgeUsers[i] = 0 }
  }
  const recentDecay = 2 ** (-FIXED_STEP / (LAB_DAY * .5))
  world.recentDistance *= recentDecay; world.recentSharedDistance *= recentDecay
  if (world.trafficOn && settings.traffic > 0) {
    world.spawn += FIXED_STEP * settings.traffic / 60
    while (world.spawn >= 1) {
      world.spawn--
      const id = world.serial++
      const through = world.experiment === "wear" && id % 5 === 0
      const available = world.buildings.filter(b => !world.closedDestinations.has(b.id))
      if (!available.length && !through) continue
      const roll = (salt: number) => hash(id * 37 + world.permutation.seed * 53 + salt)
      const focused = available.find(b => b.id === world.focus)
      const destination = focused && roll(2) < .8 ? focused : available[Math.floor(roll(3) * available.length)]
      const goal = through ? indexAt(WIDTH - 1, ROAD_Z) : entryIndex(destination)
      let start = world.permutation.sources === "both" && roll(5) < .5 ? indexAt(WIDTH - 2, ROAD_Z) : home
      if (world.permutation.sources === "local" && !through) {
        const origins = available.filter(b => b !== destination)
        if (!origins.length) continue
        start = entryIndex(origins[Math.floor(roll(7) * origins.length)])
      }
      if (through) start = home
      const route = recurringRoute(world, start, goal, settings, id)
      if (route) world.journeys.push({ id, route, edge: 0, progress: 0, returning: false, through })
    }
  }
  world.journeys = world.journeys.filter(journey => {
    if (!walkJourney(world, journey, FIXED_STEP * 4, settings.wear, settings.permanentAt)) return true
    if (!journey.returning && !journey.through) {
      const reverse = [...journey.route].reverse()
      // A building may now occupy an earlier part of this outbound route.
      const returnRoute = !routeClear(reverse, world.blocked) ? findRoute(world, reverse[0], reverse[reverse.length - 1], settings, journey.id) : reverse
      if (!returnRoute) return true
      journey.route = returnRoute
      journey.edge = 0; journey.progress = 0; journey.returning = true
      return true
    }
    world.completed++
    return false
  })
  updateNetwork(world)
}

/** Fixed ticks make pause, stepping and accelerated playback comparable. */
export function advanceWorld(world: PathWorld, seconds: number, settings: PathSettings): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return
  world.remainder += seconds
  while (world.remainder >= FIXED_STEP - 1e-9) { step(world, settings); world.remainder = Math.max(0, world.remainder - FIXED_STEP) }
}

export function journeyPosition(j: Journey): { x: number; z: number } {
  const a = coords(j.route[j.edge]), b = coords(j.route[Math.min(j.edge + 1, j.route.length - 1)])
  return { x: a.x + (b.x - a.x) * j.progress, z: a.z + (b.z - a.z) * j.progress }
}

export function setDestinationOpen(world: PathWorld, id: string, open: boolean): void {
  if (open) world.closedDestinations.delete(id)
  else world.closedDestinations.add(id)
}

export function worldStats(world: PathWorld) {
  const offRoad = (i: number) => Math.floor(i / WIDTH) !== ROAD_Z
  return {
    sharedTravel: world.recentDistance > .001 ? world.recentSharedDistance / world.recentDistance : 0,
    permanent: world.permanentEdges.reduce((n, value) => n + value, 0),
    trails: world.established.reduce((n, value, i) => n + (offRoad(i) ? value : 0), 0),
    traces: world.wear.reduce((n, value, i) => n + (offRoad(i) && value > .1 ? 1 : 0), 0),
    connected: world.connected.reduce((n, value, i) => n + (offRoad(i) ? value : 0), 0),
  }
}
