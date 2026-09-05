import { computeDangerField, encounterChance, type ThreatSource } from "./map/danger"
import { surfaceHeight } from "./map/bridges"
import {
  tileAt,
  tileToWorldX,
  tileToWorldZ,
  worldToTileX,
  worldToTileZ,
  type GameMap,
} from "./map/types"
import { holdsNerve, takesTrack, type RouteState } from "./route-choice"
import type { Traveler } from "./travelers"

/**
 * The living layer on top of traveler identity: a game clock ticks, needs decay
 * with it, and activities answer them. Pure data and functions — no three.js,
 * no React — the canvas calls `stepSim` each frame and draws whatever positions
 * come out.
 *
 * The loop per traveler:
 *  - Walking wears them down: stamina, hunger, and thirst all fall.
 *  - Stamina at 0 → leave the road for the nearest open ground (grass, dirt,
 *    or a forest-floor clearing — never solid woods or the road itself) and
 *    camp until rested. A roadside stall is
 *    the favourite pitch for anyone; pilgrims will otherwise join an existing
 *    camp rather than camp alone.
 *  - Hunger or thirst at 0 → chase down a vendor and buy: food refills hunger,
 *    wine refills thirst and some stamina. Gold changes hands.
 *  - Vendors walk a stretch, then pull the cart off to the side of the path and
 *    keep shop for a few hours before moving on. They eat their own stock free.
 *  - Danger (see map/danger.ts) is met tile by tile: each new tile rolls for
 *    trouble against its danger, and trouble rolls against the traveler's
 *    nerve. Lose it and they turn back — direction flips and they hurry the
 *    way they came for a while. At the mouth of a track through the dark
 *    forest, who they are decides whether they take it (see route-choice.ts).
 *    Dice are hashed from (id, roll count), so no RNG plumbing is needed and
 *    every journey replays identically.
 */

export type Activity =
  | "walking"
  | "seeking"
  | "fleeing"
  | "toCamp"
  | "camping"
  | "fromCamp"
  | "toShop"
  | "vending"
  | "fromShop"

export const ACTIVITY_LABELS: Record<Activity, string> = {
  walking: "On the road",
  seeking: "Seeking food & drink",
  fleeing: "Turned back",
  toCamp: "Making camp",
  camping: "Camping",
  fromCamp: "Breaking camp",
  toShop: "Setting up shop",
  vending: "Selling wares",
  fromShop: "Packing up",
}

// --- Game time ---------------------------------------------------------------

/** Real seconds per game day; the one knob that scales the whole rhythm. */
export const GAME_DAY_SECONDS = 120
const GAME_HOUR_SECONDS = GAME_DAY_SECONDS / 24

/** The sim opens at dawn on day one. */
const START_TIME = 0.25

/** `time` is in days since the sim began. */
export function formatGameTime(time: number): string {
  const day = Math.floor(time) + 1
  const minutes = Math.floor((time - Math.floor(time)) * 24 * 60)
  const h = String(Math.floor(minutes / 60)).padStart(2, "0")
  const m = String(minutes % 60).padStart(2, "0")
  return `Day ${day} — ${h}:${m}`
}

// --- Tuning ------------------------------------------------------------------
// Need rates are per game hour: a rested traveler walks dry in well under a
// day, and a camp is a few hours' rest — watchable at the default day length.

export const STAMINA_DECAY = 6
export const HUNGER_DECAY = 8
export const THIRST_DECAY = 10
export const CAMP_STAMINA_REGEN = 60
/** Resting slows the need for food and drink but doesn't stop it. */
const CAMP_NEED_FACTOR = 0.5

export const FOOD_PRICE = 2
export const WINE_PRICE = 3
export const WINE_STAMINA_BONUS = 25
/** At the vendor, top up any need at or below this — not just the empty one. */
const BUY_THRESHOLD = 50
/** Close enough to trade, in tiles; a parked stall serves a wider reach. */
const TRADE_RANGE = 1.2
const STALL_TRADE_RANGE = 2.6
/** An exhausted traveler anchors to a stall or camp within this many tiles. */
const CAMP_JOIN_RADIUS = 10
/** How far off the road anyone will look for a clearing. */
const CAMP_SEARCH_RADIUS = 6
/** The hungry hurry: pace multiplier while chasing a vendor. */
const SEEK_HASTE = 1.25
/** The spooked hurry too, and for this many game hours before settling. */
const FLEE_HASTE = 1.35
const FLEE_HOURS = 2

/**
 * A vendor's rhythm in game hours: walk a stretch, then park off the path and
 * sell for a while. Durations are hashed from (id, cycle) instead of drawn from
 * an RNG stream so the sim needs no RNG plumbing yet stays deterministic and
 * desynchronised — two vendors never park and leave in lockstep.
 */
function vendWalkSeconds(id: number, cycle: number): number {
  return (4 + ((id * 31 + cycle * 17) % 5)) * GAME_HOUR_SECONDS
}

function vendShopSeconds(id: number, cycle: number): number {
  return (2.5 + ((id * 13 + cycle * 7) % 4)) * GAME_HOUR_SECONDS
}

/**
 * Deterministic dice: the n-th roll for traveler `id`, in [0, 1). Hashed for
 * the same reason as the vendor timers — no RNG plumbing, and any roll can be
 * replayed from (id, n) alone.
 */
function roll(id: number, n: number): number {
  let h = Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(n + 1, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

export interface SimTraveler {
  id: number
  activity: Activity
  gold: number
  hunger: number
  thirst: number
  stamina: number
  /** World position, rewritten every step; what the renderer draws. */
  x: number
  y: number
  z: number
  /** Distance along the road in tiles; authoritative whenever on the road. */
  progress: number
  /**
   * +1 walks west to east, -1 east to west. Starts as the traveler's own and
   * flips whenever they turn back from trouble.
   */
  direction: 1 | -1
  /**
   * On a track through the dark forest: which shortcut and how far along it,
   * in tiles from its entry end. Null while on the road. `progress` holds the
   * road position they left from until they rejoin.
   */
  track: { index: number; progress: number } | null
  /** Times they have turned back from trouble. */
  fled: number
  /** How many dice they have rolled; feeds the deterministic hash. */
  rolls: number
  /** Seconds left of hurrying after turning back. */
  fleeTimer: number
  /** Off-road walk endpoints and 0–1 progress between them. */
  walkFrom: { x: number; y: number; z: number } | null
  /** The off-road pitch — a camp or a stall, depending on activity. */
  spot: { x: number; y: number; z: number } | null
  walkT: number
  /** Vendor being chased while seeking. */
  targetId: number | null
  /** Vendors only: seconds left in the current walk-or-shop stint. */
  timer: number
  /** Vendors only: completed park-and-sell cycles, feeds the duration hash. */
  cycle: number
}

export interface SimState {
  travelers: Map<number, SimTraveler>
  /** Game time in days since the sim began (fractional). */
  time: number
  /** Danger per tile, indexed like the map's tiles; what encounters roll against. */
  danger: Float64Array
}

/**
 * Bridge to the HUD, which lives outside the canvas: the running sim registers
 * itself here and the traveler panel polls it a few times a second. Mutable
 * module state instead of a store because 60 fps writes shouldn't re-render
 * anything — readers sample it on their own schedule.
 */
export const simRegistry: { current: SimState | null } = { current: null }

interface WorldPoint {
  x: number
  y: number
  z: number
}

/**
 * World point `p` tiles along an ordered walk of tiles, interpolated. Height
 * interpolates between tile-centre surface heights too, which is exactly the
 * slope of a bridge ramp: level road, half-way up at the ramp's centre, deck
 * height on the span.
 */
function routeWorldPoint(
  map: GameMap,
  route: ReadonlyArray<{ x: number; z: number }>,
  p: number,
): WorldPoint {
  const i0 = Math.max(0, Math.min(Math.floor(p), route.length - 2))
  const frac = p - i0
  const a = route[i0]
  const b = route[i0 + 1]
  const ax = tileToWorldX(map, a.x)
  const az = tileToWorldZ(map, a.z)
  const ay = surfaceHeight(map, a.x, a.z)
  const bx = tileToWorldX(map, b.x)
  const bz = tileToWorldZ(map, b.z)
  const by = surfaceHeight(map, b.x, b.z)
  return { x: ax + (bx - ax) * frac, y: ay + (by - ay) * frac, z: az + (bz - az) * frac }
}

function roadWorldPoint(map: GameMap, p: number): WorldPoint {
  return routeWorldPoint(map, map.road!, p)
}

/** Where on their route — road or track — the traveler currently belongs. */
function currentRoutePoint(map: GameMap, s: SimTraveler): WorldPoint {
  if (s.track) return routeWorldPoint(map, map.shortcuts![s.track.index].tiles, s.track.progress)
  return roadWorldPoint(map, s.progress)
}

export function createSim(
  travelers: Traveler[],
  map: GameMap,
  threats: ThreatSource[] = [],
): SimState {
  const sim: SimState = {
    travelers: new Map(),
    time: START_TIME,
    danger: computeDangerField(map, threats),
  }
  if (!map.road || map.road.length < 2) return sim
  const length = map.road.length - 1
  for (const t of travelers) {
    const progress = t.offset * length
    const at = roadWorldPoint(map, progress)
    sim.travelers.set(t.id, {
      id: t.id,
      activity: "walking",
      gold: t.attributes.gold,
      hunger: t.attributes.hunger,
      thirst: t.attributes.thirst,
      stamina: t.attributes.stamina,
      x: at.x,
      y: at.y,
      z: at.z,
      progress,
      direction: t.direction,
      track: null,
      fled: 0,
      rolls: 0,
      fleeTimer: 0,
      walkFrom: null,
      spot: null,
      walkT: 0,
      targetId: null,
      timer: t.type.id === "vendor" ? vendWalkSeconds(t.id, 0) : 0,
      cycle: 0,
    })
  }
  return sim
}

/**
 * Nearest open tile to a world point: grass, dirt, or a forest-floor clearing —
 * never solid woods or the road itself.
 */
function findClearTile(map: GameMap, wx: number, wz: number): { x: number; z: number } | null {
  const cx = worldToTileX(map, wx)
  const cz = worldToTileZ(map, wz)
  for (let r = 0; r <= CAMP_SEARCH_RADIUS; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const terrain = tileAt(map, cx + dx, cz + dz)
        if (terrain === "grass" || terrain === "dirt" || terrain === "clearing") {
          return { x: cx + dx, z: cz + dz }
        }
      }
    }
  }
  return null
}

/** Nearest pitched spot among travelers in the given activities, within radius. */
function findNearbySpot(
  sim: SimState,
  selfId: number,
  wx: number,
  wz: number,
  activities: readonly Activity[],
): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null
  let bestDist = CAMP_JOIN_RADIUS
  for (const other of sim.travelers.values()) {
    if (other.id === selfId || !other.spot) continue
    if (!activities.includes(other.activity)) continue
    const dist = Math.hypot(other.spot.x - wx, other.spot.z - wz)
    if (dist < bestDist) {
      bestDist = dist
      best = other.spot
    }
  }
  return best
}

const STALL_ACTIVITIES: readonly Activity[] = ["toShop", "vending"]
const CAMP_ACTIVITIES: readonly Activity[] = ["toCamp", "camping"]

/** Spread same-tile pitches apart with a per-traveler hash, not RNG. */
function pitchJitter(id: number): { x: number; z: number } {
  return {
    x: (((id * 73) % 100) / 100 - 0.5) * 0.6,
    z: (((id * 37) % 100) / 100 - 0.5) * 0.6,
  }
}

/** World-space pitch on the nearest clearing to `anchor`, or in place if none. */
function pitchSpot(
  map: GameMap,
  s: SimTraveler,
  anchor: { x: number; z: number },
): { x: number; y: number; z: number } {
  const tile = findClearTile(map, anchor.x, anchor.z)
  const jitter = pitchJitter(s.id)
  return tile
    ? {
        x: tileToWorldX(map, tile.x) + jitter.x,
        y: surfaceHeight(map, tile.x, tile.z),
        z: tileToWorldZ(map, tile.z) + jitter.z,
      }
    : { x: s.x, y: s.y, z: s.z }
}

function startOffRoadWalk(s: SimTraveler, activity: Activity): void {
  s.walkFrom = { x: s.x, y: s.y, z: s.z }
  s.walkT = 0
  s.activity = activity
  s.targetId = null
}

function startCamping(sim: SimState, s: SimTraveler, traveler: Traveler, map: GameMap): void {
  // A vendor's stall anchors anyone's camp — food nearby beats solitude.
  // Failing that, pilgrims look for other campers; the rest camp where they are.
  const stall = findNearbySpot(sim, s.id, s.x, s.z, STALL_ACTIVITIES)
  const campmates =
    !stall && traveler.type.id === "pilgrim"
      ? findNearbySpot(sim, s.id, s.x, s.z, CAMP_ACTIVITIES)
      : null
  s.spot = pitchSpot(map, s, stall ?? campmates ?? s)
  startOffRoadWalk(s, "toCamp")
}

/** Advance an off-road walk; returns true when the far end is reached. */
function stepOffRoadWalk(
  s: SimTraveler,
  to: { x: number; y: number; z: number },
  worldSpeed: number,
  dt: number,
): boolean {
  const from = s.walkFrom!
  const dist = Math.max(0.001, Math.hypot(to.x - from.x, to.z - from.z))
  s.walkT = Math.min(1, s.walkT + (worldSpeed * dt) / dist)
  s.x = from.x + (to.x - from.x) * s.walkT
  s.y = from.y + (to.y - from.y) * s.walkT
  s.z = from.z + (to.z - from.z) * s.walkT
  return s.walkT >= 1
}

function routeState(t: Traveler, s: SimTraveler): RouteState {
  return { type: t.type.id, piety: t.attributes.piety, stamina: s.stamina }
}

function nextRoll(s: SimTraveler): number {
  return roll(s.id, s.rolls++)
}

/**
 * Arriving on a new tile: roll for trouble against its danger, and on trouble
 * roll against nerve. Lose it and they turn back the way they came.
 */
function meetTrouble(
  sim: SimState,
  s: SimTraveler,
  t: Traveler,
  map: GameMap,
  tile: { x: number; z: number },
): void {
  const danger = sim.danger[tile.z * map.width + tile.x]
  if (danger <= 0) return
  if (nextRoll(s) >= encounterChance(danger)) return
  if (holdsNerve(routeState(t, s), nextRoll(s))) return
  s.direction = s.direction === 1 ? -1 : 1
  s.fled++
  s.activity = "fleeing"
  s.fleeTimer = FLEE_HOURS * GAME_HOUR_SECONDS
  s.targetId = null
}

function pay(buyer: SimTraveler, vendor: SimTraveler, price: number): void {
  // The penniless still get served — nobody starves on the road for now.
  const paid = Math.min(price, buyer.gold)
  buyer.gold -= paid
  vendor.gold += paid
}

export function stepSim(
  sim: SimState,
  travelers: Traveler[],
  map: GameMap,
  baseSpeed: number,
  dt: number,
): void {
  if (!map.road || map.road.length < 2) return
  const length = map.road.length - 1
  sim.time += dt / GAME_DAY_SECONDS
  const hours = dt / GAME_HOUR_SECONDS

  for (const t of travelers) {
    const s = sim.travelers.get(t.id)
    if (!s) continue
    const camping = s.activity === "camping"
    const isVendor = t.type.id === "vendor"

    // --- Needs march on ------------------------------------------------------
    const needFactor = camping ? CAMP_NEED_FACTOR : 1
    s.hunger = Math.max(0, s.hunger - HUNGER_DECAY * needFactor * hours)
    s.thirst = Math.max(0, s.thirst - THIRST_DECAY * needFactor * hours)
    if (camping) s.stamina = Math.min(100, s.stamina + CAMP_STAMINA_REGEN * hours)
    // Minding a parked stall neither drains nor restores the legs.
    else if (s.activity !== "vending") {
      s.stamina = Math.max(0, s.stamina - STAMINA_DECAY * hours)
    }

    // Vendors eat and drink from their own stock, on the move.
    if (isVendor) {
      if (s.hunger <= 0) s.hunger = 100
      if (s.thirst <= 0) {
        s.thirst = 100
        s.stamina = Math.min(100, s.stamina + WINE_STAMINA_BONUS)
      }
    }

    const worldSpeed = t.pace * baseSpeed

    switch (s.activity) {
      case "walking":
      case "seeking":
      case "fleeing": {
        // Exhaustion trumps everything: an empty stomach walks, empty legs don't.
        if (s.stamina <= 0) {
          startCamping(sim, s, t, map)
          break
        }
        if (s.activity === "fleeing") {
          s.fleeTimer -= dt
          if (s.fleeTimer <= 0) s.activity = "walking"
        }
        // A vendor whose walking stint is up pulls off to the side of the path.
        if (isVendor) {
          s.timer -= dt
          if (s.timer <= 0) {
            s.spot = pitchSpot(map, s, s)
            startOffRoadWalk(s, "toShop")
            break
          }
        }
        // Nobody goes shopping from the middle of the dark forest: on a track
        // they trudge on hungry until they rejoin the road.
        if (s.activity === "walking" && !isVendor && !s.track && (s.hunger <= 0 || s.thirst <= 0)) {
          s.activity = "seeking"
          s.targetId = null
        }

        let direction = s.direction
        let haste = s.activity === "fleeing" ? FLEE_HASTE : 1
        if (s.activity === "seeking") {
          // (Re)acquire the nearest vendor who isn't off camping somewhere.
          const vendor = travelers
            .filter((v) => v.type.id === "vendor")
            .map((v) => sim.travelers.get(v.id))
            .filter(
              (v): v is SimTraveler =>
                !!v && !CAMP_ACTIVITIES.includes(v.activity) && v.activity !== "fromCamp",
            )
            .sort((a, b) => Math.abs(a.progress - s.progress) - Math.abs(b.progress - s.progress))[0]

          if (vendor) {
            s.targetId = vendor.id
            const range = vendor.activity === "vending" ? STALL_TRADE_RANGE : TRADE_RANGE
            if (Math.hypot(vendor.x - s.x, vendor.z - s.z) <= range) {
              if (s.hunger <= BUY_THRESHOLD) {
                pay(s, vendor, FOOD_PRICE)
                s.hunger = 100
              }
              if (s.thirst <= BUY_THRESHOLD) {
                pay(s, vendor, WINE_PRICE)
                s.thirst = 100
                s.stamina = Math.min(100, s.stamina + WINE_STAMINA_BONUS)
              }
              s.activity = "walking"
              s.targetId = null
              break
            }
            direction = vendor.progress >= s.progress ? 1 : -1
            haste = SEEK_HASTE
          } else {
            // No vendor to be had; trudge on hungry and keep watching.
            s.targetId = null
          }
        }

        if (s.track) {
          // On a track: walk it to the far end, then rejoin the road there.
          const track = map.shortcuts![s.track.index]
          const last = track.tiles.length - 1
          const before = Math.floor(s.track.progress)
          const next = s.track.progress + direction * worldSpeed * haste * dt
          if (next >= last || next <= 0) {
            s.progress = direction === 1 ? track.exit : track.entry
            s.track = null
          } else {
            s.track.progress = next
            const tile = Math.floor(next)
            if (tile !== before && s.activity === "walking") {
              meetTrouble(sim, s, t, map, track.tiles[tile])
            }
          }
          const at = currentRoutePoint(map, s)
          s.x = at.x
          s.y = at.y
          s.z = at.z
          break
        }

        const next = s.progress + direction * worldSpeed * haste * dt
        // Walkers wrap at the map edges (leave east, arrive west); seekers
        // clamp — their target is on the road, never beyond it.
        const before = Math.floor(s.progress)
        s.progress =
          s.activity === "seeking"
            ? Math.max(0, Math.min(length, next))
            : ((next % length) + length) % length
        const after = Math.floor(s.progress)
        if (after !== before && s.activity === "walking") {
          // A new road tile: a track mouth to consider, or trouble to meet.
          const mouth = (map.shortcuts ?? []).findIndex(
            (sc) => (direction === 1 ? sc.entry : sc.exit) === after,
          )
          if (mouth >= 0 && takesTrack(routeState(t, s), nextRoll(s))) {
            s.track = {
              index: mouth,
              progress: direction === 1 ? 0 : map.shortcuts![mouth].tiles.length - 1,
            }
          } else {
            meetTrouble(sim, s, t, map, map.road[after])
          }
        }
        const at = currentRoutePoint(map, s)
        s.x = at.x
        s.y = at.y
        s.z = at.z
        break
      }

      case "toShop": {
        if (stepOffRoadWalk(s, s.spot!, worldSpeed, dt)) {
          s.activity = "vending"
          s.timer = vendShopSeconds(s.id, s.cycle)
        }
        break
      }

      case "vending": {
        // The stall stands beside the path; customers come to it.
        s.timer -= dt
        if (s.timer <= 0) {
          s.cycle++
          if (s.spot) {
            startOffRoadWalk(s, "fromShop")
          } else {
            s.timer = vendWalkSeconds(s.id, s.cycle)
            s.activity = "walking"
          }
        }
        break
      }

      case "fromShop": {
        const back = currentRoutePoint(map, s)
        if (stepOffRoadWalk(s, back, worldSpeed, dt)) {
          s.activity = "walking"
          s.spot = null
          s.walkFrom = null
          s.timer = vendWalkSeconds(s.id, s.cycle)
        }
        break
      }

      case "toCamp": {
        if (stepOffRoadWalk(s, s.spot!, worldSpeed, dt)) s.activity = "camping"
        break
      }

      case "camping": {
        if (s.stamina >= 100) startOffRoadWalk(s, "fromCamp")
        break
      }

      case "fromCamp": {
        const back = currentRoutePoint(map, s)
        if (stepOffRoadWalk(s, back, worldSpeed, dt)) {
          s.activity = "walking"
          s.spot = null
          s.walkFrom = null
        }
        break
      }
    }
  }
}
