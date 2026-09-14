import { layoutHand } from "./building-layout"
import { buildingCentre } from "./buildings"
import { rotateBuildingPoint, rotatedFootprint } from "./building-rotation"
import { isComplete, walkWorker, workerRoute } from "./construction"
import { MinHeap, ROUTE_DIRS } from "./map/route"
import { walkingSurface } from "./map/walking-surface"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type BuildingDef, type GameMap } from "./map/types"
import type { WanderSpot } from "./monk-wander"
import type { SimTraveler } from "./sim"
import { makeRng } from "./rng"
import { penGatePassage } from "./pen-gate"
import { SHEEP_PEN_CAPACITY, sheepPenLayout } from "./workshop-layout"
import { gaitSpeed, gaitStride } from "./wildlife/gait"
import type { Point } from "./wildlife/habitat"
import type { AnimalRigEdits } from "./wildlife/rig-edits"
import type { WildlifeAnimal, WildlifeWorld } from "./wildlife/simulation"

export interface HerdingTask {
  animalId: number
  route: WanderSpot[]
  buildings: readonly BuildingDef[]
  retry: number
  /** Distance along the shared route, including the initial approach. */
  followed: number
  approach: number
}
export interface SheepFold {
  penId: string
  slot: number
  shepherd: number | null
  arrived: boolean
  route: WanderSpot[]
  /** Livestock wait if their following shepherd falls behind. */
  guide: Point
  travelled: number
  wanderStep?: number
  resting?: boolean
  bed?: number
  tendedBy?: number
  replacing?: boolean
  /** Quietly lower into the existing lying pose during preparation. */
  slaughter?:number
  carcass?:boolean
  lastMilked?:number
  escort?: { leadDistance:number; followed:number; guide:Point & {y:number} }
}
/** Being driven calls for a purposeful walk, twice the ambient grazing cadence. */
export const HERDING_PACE = 2

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)

/** Keep grazing bodies inside the fence and clear of the shed and trough. */
export function foldPastureContains(map: GameMap, pen: BuildingDef, scale: number) {
  const { w, d } = rotatedFootprint(pen, pen.rotation), centre = buildingCentre(map, pen)
  const hut = sheepPenLayout(w, d), margin = Math.max(.28, .18 * scale)
  return (at: Point) => {
    const p = rotateBuildingPoint(at.x - centre.x, at.z - centre.z, -(pen.rotation ?? 0))
    const x = p.x * layoutHand(pen.buildType, pen.layoutSeed), z = p.z
    if (Math.abs(x) > w / 2 - margin || Math.abs(z) > d / 2 - margin) return false
    if (Math.abs(x - hut.coreX) < hut.coreWidth / 2 + margin && Math.abs(z - hut.coreZ) < hut.coreDepth / 2 + margin) return false
    if (Math.abs(x-hut.storageX)<hut.storageWidth/2+margin && Math.abs(z-hut.storageZ)<hut.storageDepth/2+margin) return false
    if (Math.abs(x - hut.troughX) < .265 + margin && Math.abs(z - hut.troughZ) < .13 + margin) return false
    if (Math.abs(x - hut.feedX) < .3 + margin && Math.abs(z - hut.feedZ) < .13 + margin) return false
    if (hut.wraps && d>hut.coreDepth && Math.abs(Math.abs(x)-(w/2-.87))<margin+.045
      && [hut.shelterFront,-d/2+.13].some(postZ=>Math.abs(z-postZ)<margin+.045)) return false
    // The open gate leaf and stacked hurdle rods occupy the front corners.
    if (z > d / 2 - .95 && (Math.abs(x - (hut.penLeft + hut.gateWidth)) < .1 + margin || x > w / 2 - .32 - margin)) return false
    return true
  }
}

/** Positions share the authored fold, its open gate and its rotated footprint. */
export function foldLayout(map: GameMap, pen: BuildingDef, scale = 1) {
  const { w, d } = rotatedFootprint(pen, pen.rotation)
  const { wraps, coreDepth, penLeft, gateWidth, coreX, coreZ, shelterFront, troughX, troughZ, feedX, feedZ, storageX, storageZ, storageWidth, workX } = sheepPenLayout(w, d)
  const centre = buildingCentre(map, pen)
  const point = (x: number, z: number): WanderSpot => {
    const p = rotateBuildingPoint(x*layoutHand(pen.buildType,pen.layoutSeed), z, pen.rotation)
    const at = { x: centre.x + p.x, z: centre.z + p.z }
    return { ...at, y: walkingSurface(map, at.x, at.z).height }
  }
  const gateX = penLeft + gateWidth / 2
  const contains = foldPastureContains(map, pen, scale)
  const slots: WanderSpot[] = [], slotRoutes: WanderSpot[][] = []
  const spacing = Math.max(.5, .45 * scale), margin = Math.max(.28, .18 * scale)
  // Leave the gate lane, trough at the back, and hurdle rods at the right clear.
  for (let z = -d * .22 + .38; z <= d / 2 - margin; z += spacing) {
    for (let x = penLeft + .7; x <= w / 2 - margin - .15; x += spacing) {
      if (contains(point(x,z))) { slots.push(point(x, z)); slotRoutes.push([point(x, z)]) }
    }
  }
  if (wraps && d > coreDepth) {
    const rearZ = -d / 2 + margin + .15
    // The rear lane crosses behind the side hut, clear of its wall and trough.
    for (let x = -w / 2 + margin + .15; x <= w / 2 - margin - .15; x += spacing) {
      if (contains(point(x,rearZ))) { slots.push(point(x, rearZ)); slotRoutes.push([point(gateX, rearZ), point(x, rearZ)]) }
    }
  }
  const beds: WanderSpot[] = []
  if (wraps && d > coreDepth) for (const side of [-1,1]) for (let row=0;row<2;row++) {
    const bed=point(side*(w/2-.5),-d/2+.72+row*Math.max(.45,-shelterFront+d/2-1.25))
    if(contains(bed)) beds.push(bed)
  }
  return { slots:slots.slice(0,SHEEP_PEN_CAPACITY), slotRoutes:slotRoutes.slice(0,SHEEP_PEN_CAPACITY), beds, point,
    water:point(troughX,troughZ+.55),feed:point(feedX,feedZ+.55),
    slaughter:point(workX,d/2-.8),slaughterHandler:point(workX+.65*scale,d/2-.8),
    storage:point(storageX,storageZ), storageStand:point(storageX-storageWidth/2-Math.max(.36,.22*scale),storageZ), storageEntry:point(gateX,d/2+.5),
    room:point(coreX,Math.max(coreZ,d/2-.5)),doorstep:point(coreX,d/2+.5),
    outside: point(gateX, d / 2 + .5), inside: point(gateX, d / 2 - .35) }
}

/** Workers and public food visitors share the gate and checked paths inside the fold. */
export function foldAccessRoute(map:GameMap,pen:BuildingDef,from:WanderSpot,goal:WanderSpot,scale:number):WanderSpot[]|null {
  if(foldPastureContains(map,pen,scale)(from))return foldWalkRoute(map,pen,from,goal,scale)
  const layout=foldLayout(map,pen,scale)
  const approach=workerRoute(map,from,{x:worldToTileX(map,layout.outside.x),z:worldToTileZ(map,layout.outside.z)})
  const inside=foldWalkRoute(map,pen,layout.inside,goal,scale)
  return approach && inside ? [...approach,layout.outside,layout.inside,...inside] : null
}

/** Small checked pasture paths can turn around the hut without crossing its walls. */
export function foldWalkRoute(map: GameMap, pen: BuildingDef, from: Point, to: Point, scale: number): WanderSpot[] | null {
  const contains=foldPastureContains(map,pen,scale), centre=buildingCentre(map,pen)
  const clear=(a:Point,b:Point)=>{
    const steps=Math.max(1,Math.ceil(distance(a,b)/.08))
    for(let i=1;i<=steps;i++) if(!contains({x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps})) return false
    return true
  }
  const spot=(p:Point):WanderSpot=>({...p,y:walkingSurface(map,p.x,p.z).height})
  if(clear(from,to))return [spot(to)]
  const nodes:Point[]=[from,to]
  for(let z=centre.z-pen.d/2+.3;z<centre.z+pen.d/2-.25;z+=.25)
    for(let x=centre.x-pen.w/2+.3;x<centre.x+pen.w/2-.25;x+=.25) if(contains({x,z}))nodes.push({x,z})
  const queue=new MinHeap(),costs=new Map([[0,0]]),parents=new Map<number,number>(),closed=new Set<number>()
  queue.push(0,0)
  while(queue.size) {
    const id=queue.pop()
    if(closed.has(id))continue
    if(id===1) {const route:WanderSpot[]=[];for(let n=1;n!==0;n=parents.get(n)!)route.unshift(spot(nodes[n]));return route}
    closed.add(id)
    for(let next=1;next<nodes.length;next++) {
      const gap=distance(nodes[id],nodes[next]),cost=costs.get(id)!+gap
      if(closed.has(next)||gap>(id===0||next===1?.65:.36)||cost>=(costs.get(next)??Infinity)||!clear(nodes[id],nodes[next]))continue
      costs.set(next,cost);parents.set(next,id);queue.push(next,cost+distance(nodes[next],to))
    }
  }
  return null
}

/** Herded livestock may cross roads, but still clear water, slopes, buildings and trunks. */
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
  // Open pasture needs no detour via tile centres or pauses at extra corners.
  if (sheepSegment(world,map,from,to,scale)) return [{...to,y:walkingSurface(map,to.x,to.z).height}]
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
  for (const sheep of world.animals.filter(a => (a.kind === "sheep" || a.kind === "goat") && !a.reserve && !a.concealed && !a.fold).sort((a, b) => distance(actor, a) - distance(actor, b))) {
    const home = sheepRoute(world, map, sheep, layout.outside, scale)
    if (!home) continue
    const route = workerRoute(map, actor, { x: worldToTileX(map, sheep.x), z: worldToTileZ(map, sheep.z) })
    if (!route) continue
    route.push({ x: sheep.x, y: sheep.y, z: sheep.z })
    sheep.fold = { penId: pen.id, slot, shepherd: actor.id, arrived: false, route: [], guide: actor, travelled: 0 }
    actor.buildingTask = undefined
    actor.herding = { animalId: sheep.id, route, buildings: map.buildings, retry: 0, followed: 0, approach: 0 }
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
  if(!penGatePassage(world,map,pen,actor,task.route,dt))return true
  const layout = foldLayout(map, pen, scale), destination = layout.slots[fold.slot]
  if (!destination || (task.buildings !== map.buildings && (task.buildings.length !== map.buildings.length || task.buildings.some((b, i) => {
    const next = map.buildings[i]
    return b.id !== next.id || b.x !== next.x || b.z !== next.z || b.w !== next.w || b.d !== next.d || b.rotation !== next.rotation
  })))) { releaseSheep(actor, world); return false }
  if (actor.activity === "toSheep") {
    task.retry -= dt
    // Livestock continue grazing and wandering until the shepherd actually reaches them.
    if (task.retry <= 0 && distance(task.route.at(-1) ?? actor, sheep) > .6 * scale) {
      const route = workerRoute(map, actor, { x: worldToTileX(map, sheep.x), z: worldToTileZ(map, sheep.z) })
      if (!route) { releaseSheep(actor, world); return false }
      task.route = [...route, { x: sheep.x, y: sheep.y, z: sheep.z }]; task.retry = 2
    }
    if (distance(actor, sheep) > .65 * scale) { walkWorker(actor, task.route, speed, dt); return true }
    const route = sheepRoute(world, map, sheep, layout.outside, scale)
    if (!route) { releaseSheep(actor, world); return false }
    fold.route = [...route, layout.inside, ...layout.slotRoutes[fold.slot]]
    task.route = fold.route.map(p => ({ ...p }))
    // Follow the animal’s checked route from behind, including each corner.
    task.approach = distance(actor, sheep)
    task.route.unshift({ x: sheep.x, y: sheep.y, z: sheep.z })
    actor.activity = "herding"; sheep.target = null; sheep.rest = 0
  }
  const available = fold.arrived ? Infinity : Math.max(0, task.approach + fold.travelled - task.followed - .5 * scale)
  const before = { x: actor.x, z: actor.z }
  // Preserve corners so distance along the route cannot cut across a fence or hut.
  walkWorker(actor, task.route, Math.min(speed, available / dt), dt, true)
  task.followed += distance(before, actor)
  if (!fold.arrived || task.route.length) return true
  actor.herding = undefined
  return false
}

/** Managed livestock alternate short grazing pauses with checked walks inside their fold. */
function chooseFoldWalk(animal: WildlifeAnimal, map: GameMap, pen: BuildingDef, scale: number, flock:readonly WildlifeAnimal[]) {
  const fold = animal.fold!, contains = foldPastureContains(map, pen, scale)
  fold.wanderStep = (fold.wanderStep ?? 0) + 1
  const rng = makeRng((map.seed ?? 0) ^ Math.imul(animal.id + 1, 374761393) ^ Math.imul(fold.wanderStep, 668265263))
  if ((fold.wanderStep + animal.id) % 3 === 0) {
    const beds=foldLayout(map,pen,scale).beds
    const index=beds.findIndex((_,i)=>!flock.some(a=>a!==animal && a.fold?.penId===pen.id && a.fold.resting && a.fold.bed===i))
    const bed=beds[index]
    const route=bed && foldWalkRoute(map,pen,animal,bed,scale)
    if(route) {fold.resting=true;fold.bed=index;fold.route=route;return}
  }
  fold.resting=false
  fold.bed=undefined
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = rng() * Math.PI * 2, radius = .4 + rng() * .9
    const goal = { x: animal.x + Math.sin(angle) * radius, z: animal.z + Math.cos(angle) * radius }
    const steps = Math.ceil(radius / .08)
    if (!Array.from({length:steps}, (_, i) => ({x:animal.x+(goal.x-animal.x)*(i+1)/steps,z:animal.z+(goal.z-animal.z)*(i+1)/steps})).every(contains)) continue
    fold.route = [{...goal,y:walkingSurface(map,goal.x,goal.z).height}]
    return
  }
  animal.rest = 1
}

/** Sheep and goats share their normal gait; only active herding uses the brisk cadence. */
export function stepFoldSheep(animal: WildlifeAnimal, map: GameMap, dt: number, scale: number, edits?: AnimalRigEdits, flock:readonly WildlifeAnimal[]=[]): boolean {
  const fold = animal.fold
  if (!fold) return false
  const pen = map.buildings.find(b => b.id === fold.penId && isComplete(b))
  if (!pen) { if(fold.replacing)animal.concealed=false;animal.fold = undefined; animal.target = null; animal.rest = 0; return false }
  if (dt <= 0) return true
  if (fold.replacing) {animal.concealed=true;animal.moving=false;animal.distance=0;return true}
  if (!fold.arrived && !fold.route.length) return false // Reserved, still waiting for its shepherd.
  animal.action = "graze"; animal.actionAge += dt
  animal.moving = false; animal.speed = 0; animal.drive = 0; animal.distance = 0
  if(fold.slaughter !== undefined || fold.carcass) {
    animal.action="lie";animal.grazing=0;animal.lying=fold.carcass ? 1 : Math.min(1,fold.slaughter!/.3)
    return true
  }
  if(fold.tendedBy !== undefined && !fold.escort) {animal.lying=Math.max(0,animal.lying-dt);return true}
  if (fold.arrived && !fold.route.length) {
    if(fold.escort)return true
    animal.rest -= dt
    if(fold.resting && animal.rest>0) {
      animal.action="lie";animal.lying=Math.min(1,animal.lying+dt);animal.grazing=Math.max(0,animal.grazing-dt)
      return true
    }
    animal.grazing = Math.min(1, animal.grazing + dt)
    if (animal.rest > 0) return true
    chooseFoldWalk(animal,map,pen,scale,flock)
    if (!fold.route.length) return true
  }
  animal.lying=Math.max(0,animal.lying-dt)
  animal.grazing = Math.max(0, animal.grazing - dt * 2)
  if (!fold.arrived && distance(animal, fold.guide) > 1.4 * scale) return true
  const settle = () => {
    fold.arrived = true; fold.shepherd = null; animal.home = { x: animal.x, z: animal.z }
    animal.rest = fold.resting ? 8 + animal.id % 5 : 2 + ((animal.id + (fold.wanderStep ?? 0) * 7) % 9) / 3
    animal.actionAge = 0
  }
  while (fold.route.length && distance(animal, fold.route[0]) < 1e-8) fold.route.shift()
  if (!fold.route.length) { settle(); return true }
  const goal = fold.route[0], heading = Math.atan2(goal.x - animal.x, goal.z - animal.z)
  const turn = Math.atan2(Math.sin(heading - animal.heading), Math.cos(heading - animal.heading))
  animal.heading += Math.max(-dt * 4, Math.min(dt * 4, turn))
  if (Math.abs(turn) > .45 || animal.lying > .01) return true
  const allowed=fold.escort ? Math.max(0,fold.escort.leadDistance-fold.escort.followed-.5*scale)/dt : Infinity
  const speed = Math.min(allowed,gaitSpeed(animal.kind, "walk", scale, edits) * (fold.arrived && !fold.escort ? 1 : HERDING_PACE)), step = Math.min(distance(animal, goal), speed * dt)
  const gap=distance(animal,goal),next={x:animal.x+(goal.x-animal.x)*step/gap,z:animal.z+(goal.z-animal.z)*step/gap}
  if(fold.arrived && !foldPastureContains(map,pen,scale)(next)) {
    fold.route=[];fold.resting=false;fold.bed=undefined;animal.rest=.5;return true
  }
  if (walkWorker(animal, [goal], speed, dt)) fold.route.shift()
  animal.y = walkingSurface(map, animal.x, animal.z).height
  animal.gait = "walk"; animal.speed = speed; animal.drive = 1; animal.moving = step > 0; animal.distance = step
  fold.travelled += step
  if(fold.escort)fold.escort.followed+=step
  animal.phase = (animal.phase + step / gaitStride(animal.kind, "walk", scale)) % 1
  if (!fold.route.length) settle()
  return true
}
