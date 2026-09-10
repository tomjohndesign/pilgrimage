import { layoutHand } from "./building-layout"
import { buildingCentre } from "./buildings"
import { rotateBuildingPoint, rotatedFootprint } from "./building-rotation"
import { isComplete, walkWorker, workerRoute } from "./construction"
import { MinHeap, ROUTE_DIRS } from "./map/route"
import { walkingSurface } from "./map/walking-surface"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type BuildingDef, type GameMap } from "./map/types"
import type { WanderSpot } from "./monk-wander"
import type { SimTraveler } from "./sim"
import { sheepPenLayout } from "./workshop-layout"
import { gaitSpeed, gaitStride } from "./wildlife/gait"
import type { Point } from "./wildlife/habitat"
import type { AnimalRigEdits } from "./wildlife/rig-edits"
import type { WildlifeAnimal, WildlifeWorld } from "./wildlife/simulation"

export interface HerdingTask {
  animalId: number
  route: WanderSpot[]
  buildings: readonly BuildingDef[]
  retry: number
}
export interface SheepFold {
  penId: string
  slot: number
  shepherd: number | null
  arrived: boolean
  route: WanderSpot[]
  /** The shepherd waits when the sheep falls behind, including at corners. */
  guide: Point
  guideArrived: boolean
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)

/** Positions share the authored fold, its open gate and its rotated footprint. */
export function foldLayout(map: GameMap, pen: BuildingDef, scale = 1) {
  const { w, d } = rotatedFootprint(pen, pen.rotation), { penLeft } = sheepPenLayout(w)
  const centre = buildingCentre(map, pen)
  const point = (x: number, z: number): WanderSpot => {
    const p = rotateBuildingPoint(x*layoutHand(pen.buildType,pen.layoutSeed), z, pen.rotation)
    const at = { x: centre.x + p.x, z: centre.z + p.z }
    return { ...at, y: walkingSurface(map, at.x, at.z).height }
  }
  const gateX = penLeft + Math.min(.62, d * .42) / 2
  const slots: WanderSpot[] = []
  const spacing = Math.max(.5, .45 * scale), margin = Math.max(.28, .18 * scale)
  // Leave the gate lane, trough at the back, and hurdle rods at the right clear.
  for (let z = -d * .22 + .38; z <= d / 2 - margin; z += spacing) {
    for (let x = penLeft + .7; x <= w / 2 - margin - .15; x += spacing) slots.push(point(x, z))
  }
  return { slots, outside: point(gateX, d / 2 + .5), inside: point(gateX, d / 2 - .35) }
}

/** Herded sheep may cross roads, but still clear water, slopes, buildings and trunks. */
function sheepSegment(world: WildlifeWorld, map: GameMap, from: Point, to: Point, scale: number): boolean {
  const steps = Math.max(1, Math.ceil(distance(from, to) / .12)), clearance = .18 * scale
  let height = walkingSurface(map, from.x, from.z).height
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + (to.x - from.x) * i / steps, z: from.z + (to.z - from.z) * i / steps }
    for (const [dx, dz] of [[0, 0], [clearance, 0], [-clearance, 0], [0, clearance], [0, -clearance]]) {
      const tile = tileAt(map, worldToTileX(map, p.x + dx), worldToTileZ(map, p.z + dz))
      if (!tile || !["grass", "clearing", "dirt", "hills", "path", "track", "bridge", "ford"].includes(tile)) return false
    }
    if (map.buildings.some(b => {
      const c = buildingCentre(map, b)
      return Math.abs(p.x - c.x) < b.w / 2 + clearance && Math.abs(p.z - c.z) < b.d / 2 + clearance
    })) return false
    const tx = worldToTileX(map, p.x), tz = worldToTileZ(map, p.z)
    for (let z = tz - 1; z <= tz + 1; z++) for (let x = tx - 1; x <= tx + 1; x++) {
      if ((world.habitat.trunks.get(z * map.width + x) ?? []).some(tree => distance(tree, p) < clearance + (tree.shape?.trunkRadius ?? .1) * (tree.scale ?? 1))) return false
    }
    const nextHeight = walkingSurface(map, p.x, p.z).height
    if (Math.abs(nextHeight - height) > .16) return false
    height = nextHeight
  }
  return true
}

/** A bounded tile search with checked endpoint segments; no straight-line river shortcuts. */
function sheepRoute(world: WildlifeWorld, map: GameMap, from: Point, to: Point, scale: number): WanderSpot[] | null {
  const point = (id: number): WanderSpot => {
    const x = tileToWorldX(map, id % map.width), z = tileToWorldZ(map, Math.floor(id / map.width))
    return { x, z, y: walkingSurface(map, x, z).height }
  }
  const start = worldToTileZ(map, from.z) * map.width + worldToTileX(map, from.x)
  const end = worldToTileZ(map, to.z) * map.width + worldToTileX(map, to.x)
  if (!sheepSegment(world, map, from, point(start), scale) || !sheepSegment(world, map, point(end), to, scale)) return null
  const queue = new MinHeap(), costs = new Map([[start, 0]]), parents = new Map([[start, -1]]), closed = new Set<number>()
  queue.push(start, 0)
  while (queue.size) {
    const id = queue.pop()
    if (closed.has(id)) continue
    if (id === end) {
      const route: WanderSpot[] = [{ ...to, y: walkingSurface(map, to.x, to.z).height }]
      for (let n = end; n !== -1; n = parents.get(n)!) route.push(point(n))
      // Endpoint belongs after the reversed tile route.
      return [...route.slice(1).reverse(), route[0]]
    }
    closed.add(id)
    const x = id % map.width, z = Math.floor(id / map.width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, next = nz * map.width + nx
      if (nx < 0 || nz < 0 || nx >= map.width || nz >= map.depth || closed.has(next)) continue
      const cost = costs.get(id)! + 1
      if (cost >= (costs.get(next) ?? Infinity) || !sheepSegment(world, map, point(id), point(next), scale)) continue
      costs.set(next, cost); parents.set(next, id)
      queue.push(next, cost + distance(point(next), to))
    }
  }
  return null
}

export function releaseSheep(actor: SimTraveler, world?: WildlifeWorld | null) {
  const sheep = world?.animals.find(a => a.id === actor.herding?.animalId)
  if (sheep?.fold && !sheep.fold.arrived) { sheep.fold = undefined; sheep.target = null; sheep.rest = 0 }
  actor.herding = undefined
}

export function seekSheep(actor: SimTraveler, world: WildlifeWorld | null | undefined, map: GameMap, scale: number): boolean {
  if (!world) return false
  const pen = map.buildings.find(b => b.id === actor.employer && b.buildType === "sheep-pen" && isComplete(b))
  if (!pen) return false
  const layout = foldLayout(map, pen, scale)
  const slot = layout.slots.findIndex((_, index) => !world.animals.some(a => a.fold?.penId === pen.id && a.fold.slot === index))
  if (slot < 0) return false
  for (const sheep of world.animals.filter(a => a.kind === "sheep" && !a.fold).sort((a, b) => distance(actor, a) - distance(actor, b))) {
    const home = sheepRoute(world, map, sheep, layout.outside, scale)
    if (!home) continue
    const route = workerRoute(map, actor, { x: worldToTileX(map, sheep.x), z: worldToTileZ(map, sheep.z) })
    if (!route) continue
    route.push({ x: sheep.x, y: sheep.y, z: sheep.z })
    sheep.fold = { penId: pen.id, slot, shepherd: actor.id, arrived: false, route: [], guide: actor, guideArrived: false }
    actor.buildingTask = undefined
    actor.herding = { animalId: sheep.id, route, buildings: map.buildings, retry: 0 }
    actor.activity = "toSheep"
    return true
  }
  return false
}

export function stepShepherd(actor: SimTraveler, world: WildlifeWorld | null | undefined, map: GameMap, speed: number, dt: number, scale: number): boolean {
  const task = actor.herding, sheep = world?.animals.find(a => a.id === task?.animalId), fold = sheep?.fold
  const pen = map.buildings.find(b => b.id === fold?.penId && b.id === actor.employer && isComplete(b))
  if (!world || !task || !sheep || !fold || !pen) { releaseSheep(actor, world); return false }
  if (dt <= 0) return true
  const layout = foldLayout(map, pen, scale), destination = layout.slots[fold.slot]
  if (!destination || (task.buildings !== map.buildings && (task.buildings.length !== map.buildings.length || task.buildings.some((b, i) => {
    const next = map.buildings[i]
    return b.id !== next.id || b.x !== next.x || b.z !== next.z || b.w !== next.w || b.d !== next.d || b.rotation !== next.rotation
  })))) { releaseSheep(actor, world); return false }
  if (actor.activity === "toSheep") {
    task.retry -= dt
    // Sheep continue grazing and wandering until the shepherd actually reaches them.
    if (task.retry <= 0 && distance(task.route.at(-1) ?? actor, sheep) > .6 * scale) {
      const route = workerRoute(map, actor, { x: worldToTileX(map, sheep.x), z: worldToTileZ(map, sheep.z) })
      if (!route) { releaseSheep(actor, world); return false }
      task.route = [...route, { x: sheep.x, y: sheep.y, z: sheep.z }]; task.retry = 2
    }
    if (distance(actor, sheep) > .65 * scale) { walkWorker(actor, task.route, speed, dt); return true }
    const route = sheepRoute(world, map, sheep, layout.outside, scale)
    if (!route) { releaseSheep(actor, world); return false }
    fold.route = [...route, layout.inside, destination]
    task.route = fold.route.map(p => ({ ...p }))
    // Join the sheep's exact route before leading it home.
    task.route.unshift({ x: sheep.x, y: sheep.y, z: sheep.z })
    actor.activity = "herding"; sheep.target = null; sheep.rest = 0
  }
  if (distance(actor, sheep) < 1.2 * scale) walkWorker(actor, task.route, speed, dt)
  fold.guideArrived = task.route.length === 0
  if (!fold.arrived) return true
  actor.herding = undefined
  return false
}

/** Managed sheep use the existing gait and distance-driven phase, at their own walking pace. */
export function stepFoldSheep(animal: WildlifeAnimal, map: GameMap, dt: number, scale: number, edits?: AnimalRigEdits): boolean {
  const fold = animal.fold
  if (!fold) return false
  const pen = map.buildings.find(b => b.id === fold.penId && isComplete(b))
  if (!pen) { animal.fold = undefined; animal.target = null; animal.rest = 0; return false }
  if (!fold.arrived && !fold.route.length) return false // Reserved, still waiting for its shepherd.
  animal.action = "graze"; animal.actionAge += dt; animal.lying = Math.max(0, animal.lying - dt)
  animal.moving = false; animal.speed = 0; animal.drive = 0
  if (fold.arrived) { animal.grazing = Math.min(1, animal.grazing + dt); return true }
  animal.grazing = Math.max(0, animal.grazing - dt * 2)
  if (!fold.guideArrived && distance(animal, fold.guide) < .6 * scale) return true
  while (fold.route.length && distance(animal, fold.route[0]) < 1e-8) fold.route.shift()
  if (!fold.route.length) { fold.arrived = true; fold.shepherd = null; animal.home = { x: animal.x, z: animal.z }; return true }
  const goal = fold.route[0], heading = Math.atan2(goal.x - animal.x, goal.z - animal.z)
  const turn = Math.atan2(Math.sin(heading - animal.heading), Math.cos(heading - animal.heading))
  animal.heading += Math.max(-dt * 4, Math.min(dt * 4, turn))
  if (Math.abs(turn) > .45 || animal.lying > .01) return true
  const speed = gaitSpeed("sheep", "walk", scale, edits), step = Math.min(distance(animal, goal), speed * dt)
  if (walkWorker(animal, [goal], speed, dt)) fold.route.shift()
  animal.y = walkingSurface(map, animal.x, animal.z).height
  animal.gait = "walk"; animal.speed = speed; animal.drive = 1; animal.moving = step > 0; animal.distance = step
  animal.phase = (animal.phase + step / gaitStride("sheep", "walk", scale)) % 1
  if (!fold.route.length) { fold.arrived = true; fold.shepherd = null; animal.home = { x: animal.x, z: animal.z } }
  return true
}
