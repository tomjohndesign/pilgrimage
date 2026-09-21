import { GAME_DAY_SECONDS } from "./calendar"
import { coopFloorHeight, coopLayout } from "./coop-layout"
import { depositFood, type FoodStock } from "./storage"
import { layoutHand } from "./building-layout"
import { buildingCentre } from "./buildings"
import { rotateBuildingPoint, rotatedFootprint } from "./building-rotation"
import { isComplete } from "./construction"
import type { BuildingDef, GameMap } from "./map/types"
import { walkingSurface } from "./map/walking-surface"
import { gaitSpeed, gaitStride } from "./wildlife/gait"
import type { AnimalRigEdits } from "./wildlife/rig-edits"
import type { WildlifeAnimal } from "./wildlife/simulation"
import type { ChickenKind } from "./wildlife/species"

export const COOP_EGG_CAPACITY = 12
export const EGG_LAY_SECONDS = 7
export interface ChickenNesting { nest: number; stage: "entering" | "laying" | "leaving"; route: { x: number; z: number }[]; timer: number }
export const COOP_FLOCK: readonly ChickenKind[] = ["russet-hen", "cream-hen", "russet-hen", "cream-hen", "russet-hen", "rooster"]

export function coopPoint(map: GameMap, coop: BuildingDef, x: number, z: number) {
  const centre = buildingCentre(map, coop), offset = rotateBuildingPoint(x * layoutHand(coop.buildType, coop.layoutSeed), z, coop.rotation)
  return { x: centre.x + offset.x, z: centre.z + offset.z }
}

/** Completed coops own their birds. Placement, demolition and reload all use this reconciliation. */
export function syncCoopChickens(world: { animals: WildlifeAnimal[] }, map: GameMap) {
  const coops = map.buildings.filter(b => b.buildType === "chicken-coop" && isComplete(b))
  const ids = new Set(coops.map(b => b.id))
  const nextId = world.animals.reduce((max, a) => Math.max(max, a.id + 1), 0)
  let serial = nextId
  world.animals = world.animals.filter(a => !a.coopId || ids.has(a.coopId))
  for (const coop of coops) {
    if (world.animals.some(a => a.coopId === coop.id)) continue
    const local = rotatedFootprint(coop, coop.rotation)
    for (const [slot, kind] of COOP_FLOCK.entries()) {
      const at = coopPoint(map, coop, ((slot % 3) - 1) * (local.w - .6) / 3, .23 + Math.floor(slot / 3) * (local.d / 2 - .4))
      const id = serial++
      world.animals.push({ id, kind, coopId: coop.id, group: id, leader: id, ...at,
        layIn: kind === "rooster" ? undefined : 8 + slot * 9,
        y: walkingSurface(map, at.x, at.z).height + coopFloorHeight(((slot % 3) - 1) * (local.w - .6) / 3, .23 + Math.floor(slot / 3) * (local.d / 2 - .4)), heading: slot * 1.7, phase: slot / 6, age: slot,
        rest: 1 + slot * .7, grazing: 1, gait: "walk", speed: 0, drive: 0,
        action: "graze", lying: 0, actionAge: slot / 6, burrow: null, burrowState: "outside",
        shelter: 0, outsideTime: 0, reserve: false, moving: false, distance: 0, target: null,
        home: at, perch: null, flight: null, frightened: 0, concealed: false, transient: false,
        roamTime: 0, regrouping: false })
    }
  }
}

/** Follow a route through the pop-hole instead of walking through the coop walls. */
export function stepCoopChicken(animal: WildlifeAnimal, map: GameMap, dt: number, scale: number, edits?: AnimalRigEdits,
  flock: readonly WildlifeAnimal[] = [], stores?: Map<string, FoodStock>) {
  const coop = map.buildings.find(b => b.id === animal.coopId)
  animal.distance = 0
  if (!coop || !isComplete(coop)) { animal.concealed = true; return }
  if (dt <= 0) return
  const { w, d } = rotatedFootprint(coop, coop.rotation), layout = coopLayout(w, d)
  const stop = (laying = false) => {
    animal.moving = false; animal.drive = 0; animal.speed = 0; animal.grazing = laying ? 0 : 1
    animal.action = laying ? "idle" : "graze"; animal.lying = laying ? 1 : 0
  }
  const point = (p: { x: number; z: number }) => coopPoint(map, coop, p.x, p.z)
  const surface = () => {
    const centre = buildingCentre(map, coop), local = rotateBuildingPoint(animal.x - centre.x, animal.z - centre.z, -(coop.rotation ?? 0))
    const straw = Math.max(0, Math.min(1, -local.z / .2)) * .0475
    const nest = animal.nesting && point(layout.nests[animal.nesting.nest])
    const lift = nest ? Math.max(0, 1 - Math.hypot(animal.x - nest.x, animal.z - nest.z) / .18) * .061 : 0
    animal.y = walkingSurface(map, animal.x, animal.z).height + coopFloorHeight(local.x, local.z) + straw + lift
  }
  if (animal.kind !== "rooster" && !animal.nesting) {
    animal.layIn = (animal.layIn ?? GAME_DAY_SECONDS) - dt
    if (animal.layIn <= 0 && (stores?.get(coop.id)?.eggs ?? 0) < COOP_EGG_CAPACITY && !flock.some(a => a.coopId === coop.id && a.nesting)) {
      const nest = animal.id % 2
      animal.nesting = { nest, stage: "entering", timer: EGG_LAY_SECONDS,
        route: [layout.doorOutside, layout.doorInside, { x: layout.nests[nest].x, z: -.3 }, layout.nests[nest]].map(point) }
      animal.target = null; animal.rest = 0
    }
  }
  const nesting = animal.nesting
  if (nesting?.stage === "laying") {
    stop(true); surface(); nesting.timer -= dt
    if (nesting.timer <= 0) {
      if (stores && (stores.get(coop.id)?.eggs ?? 0) < COOP_EGG_CAPACITY) depositFood(stores, coop, "eggs", 1)
      nesting.stage = "leaving"
      nesting.route = [{ x: layout.nests[nesting.nest].x, z: -.3 }, layout.doorInside, layout.doorOutside,
        { x: (animal.id % 2 ? -1 : 1) * .45, z: .6 }].map(point)
      animal.lying = 0
    }
    return
  }
  if (nesting && !nesting.route.length) {
    if (nesting.stage === "entering") {
      nesting.stage = "laying"; stop(true)
      const rear = point({ x: layout.nests[nesting.nest].x, z: layout.back })
      animal.heading = Math.atan2(rear.x - animal.x, rear.z - animal.z)
    } else { animal.nesting = undefined; animal.layIn = GAME_DAY_SECONDS; animal.rest = 2; stop() }
    return
  }
  if (!nesting && animal.rest > 0) {
    stop(); animal.rest -= dt
    animal.actionAge += dt * (edits?.clips.graze?.cadence ?? 1)
    return
  }
  if (!nesting && !animal.target) {
    const random = (salt: number) => { const v = Math.sin(animal.id * 73.7 + animal.age * 19.3 + salt) * 43758.5453; return v - Math.floor(v) }
    let x = (random(1) - .5) * (w - .5)
    const z = .25 + random(2) * (d / 2 - .47)
    if (flock.some(a => a.coopId === coop.id && a.nesting) && Math.abs(x) < .25) x = x < 0 ? -.35 : .35
    animal.target = coopPoint(map, coop, x > w * .2 && z > d * .25 ? w * .1 : x, z)
  }
  const target = nesting?.route[0] ?? animal.target!
  const dx = target.x - animal.x, dz = target.z - animal.z, distance = Math.hypot(dx, dz)
  const speed = gaitSpeed(animal.kind, "walk", scale, edits), step = Math.min(distance, dt * speed)
  if (distance < .005) {
    if (nesting) nesting.route.shift()
    else { animal.target = null; animal.rest = 1.5 + (Math.sin(animal.age + animal.id) + 1) * 1.5 }
    animal.actionAge = 0; stop(); surface(); return
  }
  const x = animal.x + dx / distance * step, z = animal.z + dz / distance * step
  if (flock.some(other => other !== animal && other.coopId === animal.coopId && Math.hypot(other.x - x, other.z - z) < .1 * scale)) {
    if (!nesting) { animal.target = null; animal.rest = .3 + (animal.id % 5) * .13 }
    stop(); return
  }
  animal.x = x; animal.z = z; surface()
  animal.heading = Math.atan2(dx, dz); animal.distance = step; animal.speed = speed
  animal.phase = (animal.phase + step / gaitStride(animal.kind, "walk", scale)) % 1
  animal.moving = true; animal.drive = 1; animal.grazing = 0; animal.lying = 0; animal.action = "idle"
}
