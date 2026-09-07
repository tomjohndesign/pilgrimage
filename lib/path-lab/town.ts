import { buildingEntry } from "../game/building-rotation"
import { populationVisual } from "../game/base-person/population-assets"
import { BASE_CHARACTER_SCALE, DEFAULT_WALK_SPEED, walkSpeedScale } from "../game/base-person/gait"
import type { BuildingDef, GameMap } from "../game/map/types"
import { advanceWorld, coords, createPathWorld, DEFAULT_PATH_SETTINGS, DEPTH, edgeLength, FIXED_STEP, footprint, indexAt, journeyPosition, LAB_DAY, recurringRoute, updateNetwork, walkJourney, WIDTH, type Journey, type PathSettings, type PathWorld } from "./simulation"

export const TOWN_DAY = 180
export const TOWN_SETTINGS = { ...DEFAULT_PATH_SETTINGS, traffic: 0 }
export interface TownSite extends BuildingDef { purpose: string; workplace?: boolean }
const site = (id: string, label: string, x: number, z: number, buildType: string, purpose: string, workplace = false): TownSite => ({ id, label, x, z, w: 2, d: 2, height: .85, color: "#ad9672", roofColor: "#786140", rotation: 0, buildType, purpose, workplace })
export const TOWN_SITES: TownSite[] = [
  site("home-0", "Willow cottage", 5, 5, "shepherd-hut", "Home to Ada, Oswin and Edith"),
  site("home-1", "Ash cottage", 5, 11, "shepherd-hut", "Home to Leof, Wulf and Alys"),
  site("home-2", "Orchard cottage", 11, 3, "shepherd-hut", "Home to Eda, Cuth and Hild"),
  site("home-3", "Roadside cottage", 11, 12, "shepherd-hut", "Home to Alden, Maud and Godric"),
  site("timber", "Wood yard", 24, 4, "workshop", "Woodworkers carry fuel to the bakehouse", true),
  site("granary", "Granary", 26, 11, "storehouse", "Porters carry grain to the bakehouse and market", true),
  site("bakehouse", "Bakehouse", 20, 11, "hall", "Bakers collect grain, bake and carry bread to market", true),
  site("market", "Market stalls", 15, 8, "market", "Residents collect provisions; sellers bring stock here", true),
]
export const TOWN_JOBS = {
  woodworker: { label: "Woodworker", stops: ["timber", "bakehouse", "timber", "market"] },
  porter: { label: "Grain porter", stops: ["granary", "bakehouse", "granary", "market"] },
  baker: { label: "Baker", stops: ["granary", "bakehouse", "market"] },
  seller: { label: "Market seller", stops: ["granary", "market", "bakehouse", "market"] },
} as const
export type TownJob = keyof typeof TOWN_JOBS
export interface Resident {
  id: number; name: string; job: TownJob; home: string; calling: "peasant" | "merchant"; variant: number
  x: number; z: number; heading: number; distance: number; speed: number
  trip: Journey | null; target: string | null; stop: number; wait: number; completed: number; carrying: boolean; cargo: string | null
}
export interface Town { world: PathWorld; map: GameMap; people: Resident[]; closed: Set<string>; remainder: number; revision: number }
export function residentVisual(person: Pick<Resident, "calling" | "variant">) {
  const visual = populationVisual(person.calling, person.variant, null)
  // This scene needs walk, idle and loaded travel, all from the current shared rig.
  return { ...visual, actions: { carrying: visual.actions.carrying } }
}
export function createTown(): Town {
  const world = createPathWorld("routes", TOWN_SETTINGS, true, { seed: 42, layout: "original", sources: "local", destinations: 8 })
  world.blocked.fill(0); world.buildings = TOWN_SITES.map(s => ({ ...s }))
  // Two small groves divide the open ground and encourage shared diagonal approaches.
  for (const [x, z] of [[18, 3], [19, 3], [18, 4], [19, 4], [18, 12], [18, 13], [18, 14], [19, 14], [28, 5], [29, 5], [29, 6]]) world.blocked[indexAt(x, z)] = 1
  world.buildings.forEach(b => footprint(b).forEach(i => { world.blocked[i] = 2 }))
  updateNetwork(world)
  const map: GameMap = { width: WIDTH, depth: DEPTH, seed: 42, buildings: world.buildings, tiles: Array.from(world.blocked, value => value === 1 ? "forest" : "grass") }
  const names = ["Ada", "Leof", "Eda", "Alden", "Oswin", "Wulf", "Cuth", "Maud", "Edith", "Alys", "Hild", "Godric"]
  const jobs = Object.keys(TOWN_JOBS) as TownJob[]
  const people: Resident[] = names.map((name, id) => {
    const home = `home-${id % 4}`, entry = buildingEntry(world.buildings.find(b => b.id === home)!)
    const calling = id % 4 === 3 ? "merchant" : "peasant", variant = id % 6
    const visual = residentVisual({ calling, variant })
    return { id, name, job: jobs[id % 4], home, calling, variant, ...entry, heading: 0, distance: 0, speed: DEFAULT_WALK_SPEED * walkSpeedScale(visual.walkStride, BASE_CHARACTER_SCALE), trip: null, target: null, stop: 0, wait: id * .7, completed: 0, carrying: false, cargo: null }
  })
  return { world, map, people, closed: new Set(), remainder: 0, revision: 0 }
}
function startTrip(town: Town, person: Resident, settings: PathSettings) {
  const stops = [...TOWN_JOBS[person.job].stops, person.home]
  for (let attempts = 0; attempts < stops.length; attempts++) {
    const target = stops[person.stop++ % stops.length]
    if (town.closed.has(target)) continue
    const door = buildingEntry(town.world.buildings.find(b => b.id === target)!), goal = indexAt(door.x, door.z)
    const start = indexAt(Math.round(person.x), Math.round(person.z))
    if (start === goal) continue
    const route = recurringRoute(town.world, start, goal, settings, person.id)
    if (!route) continue
    person.target = target
    person.trip = { id: person.id, route, edge: 0, progress: 0, returning: false, through: false }
    return
  }
  person.wait = 5
}
/** Fixed ticks share wear, routing, diagonals and permanence with the schematic playground. */
export function advanceTown(town: Town, seconds: number, settings = TOWN_SETTINGS) {
  town.people.forEach(person => { person.distance = 0 })
  if (!Number.isFinite(seconds) || seconds <= 0) return
  town.remainder += seconds
  const policy = { ...settings, traffic: 0, halfLife: settings.halfLife * TOWN_DAY / LAB_DAY }
  while (town.remainder >= FIXED_STEP - 1e-9) {
    town.remainder = Math.max(0, town.remainder - FIXED_STEP)
    advanceWorld(town.world, FIXED_STEP, policy)
    for (const person of town.people) {
      if (!person.trip) {
        person.wait -= FIXED_STEP
        if (person.wait <= 0) startTrip(town, person, policy)
        continue
      }
      const trip = person.trip, from = trip.route[trip.edge], to = trip.route[Math.min(trip.edge + 1, trip.route.length - 1)]
      const a = coords(from), b = coords(to)
      person.heading = Math.atan2(b.x - a.x, b.z - a.z)
      const remaining = trip.route.slice(trip.edge + 1).reduce((total, i, n) => total + edgeLength(trip.route[trip.edge + n], i), 0) - trip.progress * edgeLength(from, to)
      const distance = Math.min(person.speed * FIXED_STEP, remaining)
      const arrived = walkJourney(town.world, trip, distance, settings.wear, settings.permanentAt)
      const point = journeyPosition(trip)
      person.x = point.x; person.z = point.z; person.distance += distance
      if (arrived) {
        person.completed++; person.trip = null
        person.wait = person.target === person.home ? 12 : 6 + person.id % 3
        person.cargo = town.closed.has(person.target!) ? null : ({ timber: "firewood", granary: "grain", bakehouse: "bread" } as Record<string, string>)[person.target!] ?? null
        person.carrying = person.cargo !== null
      }
    }
  }
}
export function setWorkplaceOpen(town: Town, id: string, open: boolean) {
  if (!TOWN_SITES.some(site => site.id === id && site.workplace)) return
  if (open) town.closed.delete(id); else town.closed.add(id)
}
export function residentTask(town: Town, person: Resident) {
  const label = TOWN_SITES.find(site => site.id === person.target)?.label ?? "home"
  if (person.trip) return `${person.cargo ? `Carrying ${person.cargo} to` : "Walking to"} ${label}`
  if (person.target === person.home || !person.target) return "Resting at home"
  if (town.closed.has(person.target)) return `${label} is closed`
  if (person.target === "market") return person.job === "seller" ? "Trading at the market" : "Collecting provisions"
  if (person.target === "bakehouse" && person.job === "baker") return "Baking bread"
  return `Collecting ${person.cargo ?? "supplies"} at ${label}`
}
