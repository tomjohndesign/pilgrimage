import { BURROW_SECONDS, burrowApproach, burrowMotion } from "./burrow-motion"
import { RIG_TO_WORLD } from "../transport/assets"
import { walkingSurface } from "../map/walking-surface"
import { tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"
import { deriveSeed, makeRng, SEED_STREAM } from "../rng"
import type { TreePlacement } from "../trees/placement"
import { habitatAllows, wildlifeHabitat, wildlifeSegmentClear, type Point } from "./habitat"
import { birdGlide, easeWing } from "./motion"
import { gaitSpeed, gaitStride, type WildlifeGait, type WildlifeAction } from "./gait"
import type { AnimalRigEdits } from "./rig-edits"
import { chooseGait, restDuration } from "./behavior"
import { isBird, isDomestic, type WildlifeKind } from "./species"

export interface WildlifeAnimal extends Point {
  id: number; kind: WildlifeKind; group: number; leader: number
  y: number; heading: number; phase: number; age: number; rest: number
  grazing: number; gait: WildlifeGait; speed: number; drive: number
  action: WildlifeAction; lying: number; actionAge: number
  burrow: number | null; burrowState: "outside" | "returning" | "entering" | "inside" | "emerging"; shelter: number; outsideTime: number; reserve: boolean; moving: boolean; distance: number; target: Point | null; home: Point
  perch: number | null; flight: null | { from: Point & { y: number }; to: Point & { y: number }; elapsed: number; duration: number; height: number; perch: number | null; sheltered: boolean }
  frightened: number; concealed: boolean; transient: boolean
}
export interface RabbitBurrow extends Point { id: number; group: number; y: number; heading: number }
export interface WildlifeWorld {
  burrows: RabbitBurrow[]
  animals: WildlifeAnimal[]; habitat: ReturnType<typeof wildlifeHabitat>; trees: readonly TreePlacement[]
  rng: () => number; canopy: number
}

export function treePerch(tree: TreePlacement, id = 0, sheltered = false) {
  const shape = tree.shape, scale = tree.scale ?? 1
  const crown = shape?.crown[0]
  // Upper outside crown, visibly resting on the tree rather than hidden inside it.
  return { x: tree.x + (crown?.x ?? 0) * scale + Math.sin(id * 2.4) * (crown?.rx ?? 0.3) * scale * 0.35,
    z: tree.z + (crown?.z ?? 0) * scale + Math.cos(id * 2.4) * (crown?.rz ?? 0.3) * scale * 0.35,
    y: tree.y + ((crown?.y ?? 0.9) + (crown?.ry ?? 0.3) * (sheltered ? 0.12 : 0.94)) * scale }
}
export function createWildlife(map: GameMap, trees: readonly TreePlacement[], scale = 1): WildlifeWorld {
  const rng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.wildlife))
  const world: WildlifeWorld = { animals: [], burrows: [], habitat: wildlifeHabitat(map, trees), trees, rng,
    canopy: trees.reduce((height, tree) => Math.max(height, treePerch(tree).y), 2) + 0.8 }
  let group = 0
  const candidates = new Map<WildlifeKind, Point[]>()
  function add(kind: WildlifeKind, at: Point, leader: number, perch: number | null = null) {
    const id = world.animals.length
    const animal: WildlifeAnimal = { id, kind, group, leader, ...at, y: walkingSurface(map, at.x, at.z).height,
      heading: rng() * Math.PI * 2, phase: rng(), age: rng() * 20, rest: restDuration(kind, rng()), grazing: kind === "fox" || isBird(kind) ? 0 : 1, gait: kind === "rabbit" ? "hop" : "walk", speed: 0, drive: 0,
      action: kind === "fox" ? "lie" : "graze", lying: 0, actionAge: 0, burrow: null, burrowState: "outside", shelter: 0, outsideTime: rng() * 18, reserve: false, moving: false, distance: 0,
      target: null, home: { ...at }, perch, flight: null, frightened: 0, concealed: false, transient: false }
    if (perch !== null) Object.assign(animal, treePerch(trees[perch], id))
    world.animals.push(animal)
    return animal
  }
  function spawn(kind: WildlifeKind, count: number) {
    let sites = candidates.get(kind)
    if (!sites) {
      sites = []
      for (let z = 1; z < map.depth - 1; z++) for (let x = 1; x < map.width - 1; x++) {
        const at = { x: tileToWorldX(map, x), z: tileToWorldZ(map, z) }
        if (habitatAllows(world.habitat, kind, at, map, 0.2 * scale)) sites.push(at)
      }
      candidates.set(kind, sites)
    }
    if (!sites.length) return
    // Build the entire herd before committing it: no lone domestic animals on tiny islands.
    for (let attempt = 0; attempt < 60; attempt++) {
      const home = sites[Math.floor(rng() * sites.length)], spots: Point[] = [{ ...home }]
      if (world.animals.some(a => !isBird(a.kind) && Math.hypot(a.x - home.x, a.z - home.z) < 3)) continue
      for (let n = 0; n < 80 && spots.length < count; n++) {
        const angle = rng() * Math.PI * 2, radius = 0.45 * scale + rng() * 1.1
        const at = { x: home.x + Math.sin(angle) * radius, z: home.z + Math.cos(angle) * radius }
        if (spots.some(p => Math.hypot(p.x - at.x, p.z - at.z) < 0.45 * scale)) continue
        if (wildlifeSegmentClear(world.habitat, kind, home, at, map, 0.2 * scale)) spots.push(at)
      }
      if (spots.length !== count) continue
      const leader = world.animals.length
      spots.forEach(at => add(kind, at, leader))
      if (kind === "rabbit") {
        const owner = world.animals[leader]
        const burrow = { id: world.burrows.length, group, ...home, y: owner.y, heading: owner.heading }
        world.burrows.push(burrow)
        for (const rabbit of world.animals.filter(a => a.group === group)) { rabbit.burrow = burrow.id; rabbit.home = { ...home } }
      }
      group++; return
    }
  }
  const sets = Math.max(1, Math.min(4, Math.round(map.width * map.depth / 5000)))
  for (let i = 0; i < sets; i++) {
    spawn("deer", 3 + Math.floor(rng() * 2)); spawn("buck", 1)
    spawn("sheep", 4 + Math.floor(rng() * 2)); spawn("goat", 3 + Math.floor(rng() * 2))
    spawn("rabbit", 2); spawn("fox", 1); spawn("boar", 2)
  }
  for (let flock = 0; flock < sets * 3 && trees.length; flock++) {
    const perch = Math.floor(rng() * trees.length), leader = world.animals.length
    for (let n = 0; n < 3; n++) add("sparrow", trees[perch], leader, perch)
    group++
  }
  for (let n = 0; n < sets; n++) {
    const perch = trees.length ? Math.floor(rng() * trees.length) : null
    const bird = add("hawk", perch === null ? { x: 0, z: 0 } : trees[perch], world.animals.length, perch)
    group++; launchBird(world, bird, map, new Set())
  }
  // A bounded pool represents birds hidden inside unobserved crowns. Chopping can
  // reveal a small flock even when no visible bird happened to pick that tree.
  if (trees.length) for (let n = 0; n < 6; n++) {
    const bird = add("sparrow", trees[0], world.animals.length, 0)
    bird.concealed = true; bird.transient = true; bird.reserve = true
  }
  return world
}

export function launchBird(world: WildlifeWorld, animal: WildlifeAnimal, map: GameMap, felled: ReadonlySet<number>, avoid: number | null = animal.perch) {
  let perch: number | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!world.trees.length) break
    const i = Math.floor(world.rng() * world.trees.length), tree = world.trees[i]
    if (i === avoid || felled.has(i) || tree.walking) continue
    const distance = Math.hypot(tree.x - animal.x, tree.z - animal.z)
    if (distance > (animal.kind === "hawk" ? 30 : 16) || distance < 2) continue
    perch = i; break
  }
  const hawk = animal.kind === "hawk", sheltered = world.rng() < (hawk ? 0.3 : 0.8)
  const to = perch !== null ? treePerch(world.trees[perch], animal.id, sheltered) : {
    x: Math.max(-map.width / 2 + 1, Math.min(map.width / 2 - 1, animal.x + (world.rng() - 0.5) * 14)),
    z: Math.max(-map.depth / 2 + 1, Math.min(map.depth / 2 - 1, animal.z + (world.rng() - 0.5) * 14)),
    y: world.canopy + (hawk ? 3 : 0.5),
  }
  animal.flight = { from: { x: animal.x, y: animal.y, z: animal.z }, to, elapsed: 0,
    duration: (hawk ? 14 : 3) + Math.hypot(to.x - animal.x, to.z - animal.z) / (hawk ? 1.2 : 2.2),
    height: Math.max(animal.y, to.y, ...world.trees.filter(tree => Math.hypot(tree.x - (animal.x + to.x) / 2, tree.z - (animal.z + to.z) / 2) < Math.hypot(to.x - animal.x, to.z - animal.z) / 2 + 1).map(tree => treePerch(tree).y)) + (hawk ? 2 : 0.5), perch, sheltered }
  animal.perch = null; animal.rest = 0; animal.moving = true; animal.concealed = false; animal.reserve = false
}

/** Real axe contacts disturb perched flocks and nearby wildlife immediately on the next tick. */
export function startleWildlife(world: WildlifeWorld, tree: TreePlacement, map: GameMap, felled: ReadonlySet<number>) {
  const index = world.trees.indexOf(tree)
  if (index < 0 || felled.has(index)) return
  let flushed = false
  for (const animal of world.animals) {
    if (animal.reserve || animal.burrowState === "inside") continue
    const near = Math.hypot(animal.x - tree.x, animal.z - tree.z) < 3.5
    if (isBird(animal.kind)) {
      if (!animal.flight && (animal.perch === index || near)) {
        flushed = true; animal.frightened = 5; launchBird(world, animal, map, felled, index)
      }
    } else if (near && !isDomestic(animal.kind)) { animal.frightened = 6; animal.rest = 0; animal.target = null }
  }
  if (!flushed && world.rng() < 0.55) {
    const flock = world.animals.filter(a => a.transient && a.concealed).slice(0, 2 + Math.floor(world.rng() * 2))
    for (const animal of flock) {
      Object.assign(animal, treePerch(tree, animal.id))
      animal.concealed = false; animal.reserve = false; animal.frightened = 5
      launchBird(world, animal, map, felled, index)
    }
  }
}

export function stepWildlife(world: WildlifeWorld, map: GameMap, dt: number, scale = 1, felled: ReadonlySet<number> = new Set(), people: readonly Point[] = [], edits: Record<string, AnimalRigEdits> = {}) {
  if (dt <= 0) return
  dt = Math.min(dt, 0.1)
  const { rng, habitat } = world
  for (const animal of world.animals) {
    if (animal.reserve) continue
    animal.distance = 0; animal.age += dt; animal.frightened = Math.max(0, animal.frightened - dt)
    if (isBird(animal.kind)) {
      if (!animal.flight) {
        if (animal.perch !== null && !felled.has(animal.perch) && !world.trees[animal.perch].walking) {
          Object.assign(animal, treePerch(world.trees[animal.perch], animal.id, animal.concealed)); animal.rest -= dt
          if (animal.rest > 0) continue
          if (animal.transient) { animal.concealed = true; animal.reserve = true; animal.moving = false; continue }
        }
        launchBird(world, animal, map, felled)
      }
      const flight = animal.flight!
      if (flight.perch !== null && (felled.has(flight.perch) || world.trees[flight.perch].walking)) {
        launchBird(world, animal, map, felled, flight.perch); continue
      }
      flight.elapsed += dt
      const t = Math.min(1, flight.elapsed / flight.duration), ease = t * t * (3 - 2 * t)
      const arc = Math.sin(Math.PI * t), hawk = animal.kind === "hawk"
      const dx = flight.to.x - flight.from.x, dz = flight.to.z - flight.from.z
      const bow = (hawk ? 3 : 0.45) * Math.sin(Math.PI * 2 * t), length = Math.hypot(dx, dz) || 1
      const x = Math.max(-map.width / 2 + 0.5, Math.min(map.width / 2 - 0.5, flight.from.x + dx * ease + dz / length * bow * arc))
      const z = Math.max(-map.depth / 2 + 0.5, Math.min(map.depth / 2 - 0.5, flight.from.z + dz * ease - dx / length * bow * arc))
      if (Math.hypot(x - animal.x, z - animal.z) > 1e-6) animal.heading = Math.atan2(x - animal.x, z - animal.z)
      animal.x = x; animal.z = z
      // Reach cruising height early; descend only when directly over the destination canopy.
      const rise = Math.min(1, t / 0.18), fall = Math.min(1, (1 - t) / 0.18)
      animal.y = t < 0.5 ? flight.from.y + (flight.height - flight.from.y) * easeWing(rise)
        : flight.to.y + (flight.height - flight.to.y) * easeWing(fall)
      const glide = birdGlide(hawk ? "hawk" : "sparrow", flight.elapsed, flight.duration)
      animal.phase = (animal.phase + dt * (glide > .5 ? .3 : hawk ? .85 : 6) * (edits[animal.kind]?.clips[glide > .5 ? "glide" : "fly"]?.cadence ?? 1)) % 1
      if (t === 1) {
        Object.assign(animal, flight.to); animal.perch = flight.perch; animal.flight = null
        animal.concealed = flight.perch !== null && flight.sheltered
        animal.moving = false; animal.rest = (hawk ? 5 : 8) + rng() * (hawk ? 8 : 22)
      }
      continue
    }
    const burrow = animal.burrow === null ? null : world.burrows[animal.burrow]
    if (burrow && (animal.burrowState === "inside" || animal.burrowState === "entering" || animal.burrowState === "emerging")) {
      animal.moving = false; animal.speed = 0; animal.drive = 0; animal.grazing = 0; animal.action = "burrow"
      if (animal.burrowState === "inside") {
        animal.rest -= dt
        if (animal.rest <= 0 && !world.animals.some(other => other !== animal && other.burrow === animal.burrow && ["entering", "emerging"].includes(other.burrowState)) && !people.some(person => Math.hypot(person.x - burrow.x, person.z - burrow.z) < 3)) {
          animal.burrowState = "emerging"; animal.concealed = false; animal.heading = burrow.heading
        }
      } else {
        const entering=animal.burrowState==="entering"
        animal.shelter = Math.max(0, Math.min(1, animal.shelter + (entering ? 1 : -1) * dt / BURROW_SECONDS * (edits.rabbit?.clips.burrow?.cadence??1)))
        const pose=burrowMotion(animal.shelter,entering),size=RIG_TO_WORLD*scale
        animal.x = burrow.x + Math.sin(burrow.heading) * pose.z * size
        animal.z = burrow.z + Math.cos(burrow.heading) * pose.z * size
        animal.heading = burrow.heading + pose.heading
        if (animal.shelter === 1) { animal.burrowState = "inside"; animal.concealed = true; animal.rest = 12 + rng() * 26 }
        if (animal.shelter === 0) { animal.burrowState = "outside"; animal.rest = 2 + rng() * 4; animal.outsideTime = 0; animal.action = "idle"; animal.actionAge = 0 }
      }
      continue
    }
    animal.actionAge += dt * (edits[animal.kind]?.clips[animal.action]?.cadence ?? 1); animal.outsideTime += dt
    const leader = world.animals[animal.leader], domestic = isDomestic(animal.kind)
    const threat = domestic ? undefined : people.find(p => Math.hypot(p.x - animal.x, p.z - animal.z) < 2.5)
    if (threat) { animal.frightened = 3; animal.rest = 0 }
    if (burrow && animal.burrowState === "outside" && (animal.outsideTime > 35 || animal.frightened > 0)
      && wildlifeSegmentClear(habitat, animal.kind, animal, burrowApproach(burrow,scale), map, 0.2 * scale)
      && wildlifeSegmentClear(habitat, animal.kind, burrowApproach(burrow,scale), burrow, map, 0.2 * scale)) {
      animal.burrowState = "returning"; animal.target = burrowApproach(burrow,scale); animal.rest = 0
    }
    const separation = Math.hypot(animal.x - leader.x, animal.z - leader.z)
    const herd = animal.kind === "deer" || domestic
    if (herd && animal.leader !== animal.id && separation > 1.8) animal.rest = 0
    if (!habitatAllows(habitat, animal.kind, animal, map, 0.2 * scale)) { animal.rest = 0; animal.target = null }
    animal.rest -= dt
    const settle = animal.rest > 1.6 && !animal.target && !animal.frightened
    const lieTarget = settle && animal.action === "lie" ? 1 : 0
    const approach = (value: number, target: number, rate: number) => value + Math.max(-dt * rate, Math.min(dt * rate, target - value))
    animal.lying = approach(animal.lying, lieTarget, 0.7)
    const grazeTarget = settle && animal.action === "graze" ? (Math.sin(animal.age * 0.22) > 0.85 ? 0.15 : 1) : 0
    animal.grazing = approach(animal.grazing, grazeTarget, 1.3)
    if (animal.rest > 0 || animal.lying > 0.01) {
      animal.moving = false; animal.speed = 0; animal.drive = approach(animal.drive, 0, 3); continue
    }
    if (herd && animal.leader !== animal.id && separation > 2.1 && animal.target && Math.hypot(animal.target.x - leader.x, animal.target.z - leader.z) > 1.3) animal.target = null
    if (herd && animal.leader === animal.id && world.animals.some(a => a.leader === animal.id && Math.hypot(a.x - animal.x, a.z - animal.z) > 2.4)) {
      animal.moving = false; animal.speed = 0; animal.drive = approach(animal.drive, 0, 3); continue
    }
    if (!animal.target) {
      if(animal.burrowState === "returning")animal.burrowState="outside"
      animal.gait = chooseGait(animal.kind, animal.frightened > 0, rng())
      for (let attempt = 0; attempt < 18; attempt++) {
        const angle = threat ? Math.atan2(animal.x - threat.x, animal.z - threat.z) + (rng() - 0.5) : rng() * Math.PI * 2
        const follower = herd && animal.id !== animal.leader, origin = follower ? leader : animal
        const running = animal.gait === "gallop" || animal.gait === "canter" || animal.gait === "trot"
        const radius = follower ? 0.5 + rng() * 0.8 : (running ? 1.2 : 0.35) + rng() * (animal.frightened ? 3 : running ? 2.3 : 0.75)
        const target = { x: origin.x + Math.sin(angle) * radius, z: origin.z + Math.cos(angle) * radius }
        if (Math.hypot(target.x - animal.home.x, target.z - animal.home.z) > (burrow ? 3 : domestic ? 7 : 10)) continue
        if (!domestic && people.some(p => Math.hypot(p.x - target.x, p.z - target.z) < 2.5)) continue
        if (!habitatAllows(habitat, animal.kind, target, map, 0.2 * scale)) continue
        if (!wildlifeSegmentClear(habitat, animal.kind, animal, target, map, 0.2 * scale)) continue
        animal.target = target; break
      }
      if (!animal.target) { animal.rest = 1; animal.moving = false; continue }
    }
    const target = animal.target, dx = target.x - animal.x, dz = target.z - animal.z, distance = Math.hypot(dx, dz)
    if (distance < 0.015) {
      if(burrow && animal.burrowState==="returning") {
        // Queue at the mouth, then face into it before the first entry frame.
        const turn=Math.atan2(Math.sin(burrow.heading+Math.PI-animal.heading),Math.cos(burrow.heading+Math.PI-animal.heading))
        animal.heading+=Math.max(-dt*3,Math.min(dt*3,turn))
        animal.moving=false;animal.speed=0;animal.drive=approach(animal.drive,0,3);animal.grazing=approach(animal.grazing,0,2)
        if(Math.abs(turn)>.01 || world.animals.some(other=>other!==animal&&other.burrow===animal.burrow&&["entering","emerging"].includes(other.burrowState)))continue
        animal.x=target.x;animal.z=target.z
      }
      animal.target = null; animal.moving = false; animal.speed = 0
      animal.rest = restDuration(animal.kind, rng()); animal.actionAge = 0
      animal.action = animal.kind === "fox" ? rng() < 0.65 ? "lie" : "idle" : "graze"
      if (animal.burrowState === "returning") { animal.burrowState = "entering"; animal.shelter = 0; animal.drive = 0; animal.grazing = 0; animal.action = "burrow" }
      continue
    }
    const maxSpeed = gaitSpeed(animal.kind, animal.gait, scale, edits[animal.kind]), acceleration = maxSpeed * 2.5
    animal.speed = approach(animal.speed, Math.min(maxSpeed, Math.sqrt(2 * acceleration * distance)), acceleration)
    animal.drive = Math.min(1, animal.speed / maxSpeed)
    const step = Math.min(distance, animal.speed * dt)
    const next = { x: animal.x + dx / distance * step, z: animal.z + dz / distance * step }
    if (!wildlifeSegmentClear(habitat, animal.kind, animal, next, map, 0.2 * scale)) { animal.target = null; animal.rest = 0.5; animal.moving = false; continue }
    if (world.animals.some(other => other !== animal && !other.concealed && !isBird(other.kind) && !(burrow && other.burrow === animal.burrow)
      && Math.hypot(other.x - next.x, other.z - next.z) < 0.32 * scale
      && Math.hypot(other.x - next.x, other.z - next.z) < Math.hypot(other.x - animal.x, other.z - animal.z))) {
      animal.target = null; animal.rest = 0.5; animal.moving = false; continue
    }
    const heading = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(heading - animal.heading), Math.cos(heading - animal.heading))
    animal.heading += Math.max(-dt * 4, Math.min(dt * 4, turn))
    // Face the next stretch before accelerating along it.
    if (Math.abs(turn) > 0.45) { animal.speed = 0; animal.drive = approach(animal.drive, 0, 3); animal.moving = false; continue }
    animal.x = next.x; animal.z = next.z; animal.y = walkingSurface(map, animal.x, animal.z).height
    animal.distance = step; animal.moving = true
    animal.phase = (animal.phase + step / (gaitStride(animal.kind, animal.gait, scale) * Math.max(0.05, animal.drive))) % 1
  }
}
