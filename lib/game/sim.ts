import { buildingEntry } from "./building-rotation"
import { timberDestination, type FoodStock } from "./storage"
import { nearProcession, type RelicProcession } from "./relic-procession"
import { roadsideStall, routePoint, routeLength, type StallRoute } from "./transport/roadside"
import { roadLanePoint } from "./map/road-lane"
import { cartOnRoute } from "./transport/follow"
import { keeperRoutine } from "./transport/keeper"
import { personWalkStride } from "./base-person/gait"
import { populationDesign, travelerAppearance } from "./base-person/population"
import { animalClearance } from "./transport/stall"
import { BASE_CHARACTER_SCALE } from "./base-person/gait"
import { cartOffset, SHOP_SECONDS, cartLoadout } from "./transport/assets"
import { createPasture, stepPasture, type PastureAnimal } from "./transport/pasture"
import { LINEAR_MOVEMENT, easeSpeed, paceVariation, type MovementTuning } from "./motion"
import { DEFAULT_BALANCE, type GameBalance } from "./balance"
import { buildingAt } from "./settlement"
import { AXE_DAMAGE_PER_HOUR, STUMP_LIFETIME_DAYS, TIMBER_LOAD, stackWood, treeResource, type TreeResource, type WoodPile } from "./trees/timber"
import { BUILDING_KINDS, buildingCentre, type PlacedBuilding } from "./buildings"
import { generateRelic, hospitalityNeedThreshold, visitChance, type RelicStats } from "./relic"
import { settlementRoute } from "./settlement-route"
import { admissionFee, shrineVisitRoute } from "./shrine-visit"
import type { TreePlacement } from "./trees/placement"
import { TREE_SPECIES } from "./trees/species"
import type { TilePos } from "./map/types"
import { computeDangerField, encounterChance, type ThreatSource } from "./map/danger"
import { surfaceHeight, ropeHeightAt } from "./map/bridges"
import {
  tileAt,
  tileToWorldX,
  tileToWorldZ,
  worldToTileX,
  worldToTileZ,
  type GameMap,
} from "./map/types"
import { holdsNerve, takesTrack, type RouteState } from "./route-choice"
import { deriveSeed, makeRng, SEED_STREAM } from "./rng"
import type { Traveler } from "./travelers"

/**
 * The living layer on top of traveler identity: a game clock ticks, needs decay
 * with it, and activities answer them. Pure data and functions — no three.js,
 * no React — the canvas calls `stepSim` each frame and draws whatever positions
 * come out.
 *
 * The loop per traveler:
 *  - Walking wears them down: stamina, hunger, and thirst all fall.
 *  - At the shrine junction, faith, hospitality and available work draw visitors
 *    down the branch. The brothers restore their needs and bestow piety before
 *    they return to the road; each visit spreads the shrine's renown.
 *  - Jobless visitors may settle into a woodcutter hut slot, walk to a reserved
 *    tree, fell it and haul logs home. Camps provide rest when needs run low.
 *  - Stamina at 0 → leave the road for the nearest open ground (grass, dirt,
 *    or a forest-floor clearing — never solid woods or the road itself) and
 *    camp until rested. A roadside stall is
 *    the favourite pitch for anyone; pilgrims will otherwise join an existing
 *    camp rather than camp alone.
 *  - Hunger or thirst at 0 → chase down a vendor and buy: food refills hunger,
 *    wine refills thirst. Energy returns through rest. Gold changes hands.
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
  | "toRelic"
  | "visiting"
  | "fromRelic"
  | "toWork"
  | "working"
  | "gathering"
  | "hauling"
  | "idle"
  | "walking"
  | "seeking"
  | "toStall"
  | "browsing"
  | "fromStall"
  | "fleeing"
  | "toCamp"
  | "camping"
  | "fromCamp"
  | "toShop"
  | "openingShop"
  | "packingShop"
  | "vending"
  | "fromShop"

export const ACTIVITY_LABELS: Record<Activity, string> = {
  toRelic: "Following the path to the shrine",
  visiting: "Praying before the relic",
  fromRelic: "Returning from the shrine",
  toWork: "Walking to work",
  working: "Felling a tree",
  gathering: "Cutting & gathering fallen timber",
  hauling: "Carrying logs to storage",
  idle: "Resting from woodcutting",
  walking: "On the road",
  seeking: "Seeking food & drink",
  toStall: "Approaching the stall",
  browsing: "Buying food & drink",
  fromStall: "Returning to the path",
  fleeing: "Turned back",
  toCamp: "Making camp",
  camping: "Camping",
  fromCamp: "Breaking camp",
  toShop: "Setting up shop",
  openingShop: "Unloading wares",
  packingShop: "Packing wares & bringing the animal back",
  vending: "Selling wares",
  fromShop: "Packing up",
}

// --- Game time ---------------------------------------------------------------

/** Simulation seconds per day: 5 real minutes at the HUD's 1× (2 sim seconds/real second).
 * Roughly one uninterrupted walk along a generated 128×128 map's winding road.
 */
export const GAME_DAY_SECONDS = 600
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
// Need rates are per game hour and read from the live balance below. A camp
// is a few hours' rest — watchable at the default day length.

export const CAMP_STAMINA_REGEN = 60
/** Resting slows the need for food and drink but doesn't stop it. */
const CAMP_NEED_FACTOR = 0.5

export const FOOD_PRICE = 2
export const WINE_PRICE = 3
/** Top up near-empty needs, so each drink doesn't also become a half-full meal. */
const BUY_THRESHOLD = 10
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
  /** Prayer interrupts travel/work without discarding its route or reservations. */
  praying?: boolean
  /** Actual gold paid for this visit, captured on admission. */
  admissionPaid: number
  keeperTime?: number
  customerVisit?: { vendorId: number; road: { x: number; y: number; z: number }; frontage: { x: number; y: number; z: number } }
  stallRoute?: StallRoute
  pasture?: PastureAnimal

  id: number
  activity: Activity
  gold: number
  piety: number
  jobless: boolean
  deliveryBuilding?: string | null
  employer: string | null
  branchProgress: number
  shrineRoute: TilePos[] | null
  /** Road lane used when entering the shrine, including a reversed approach for shelter. */
  branchEntryLane: number
  visitCooldown: number
  visits: number
  workRoute: TilePos[] | null
  /** Exact working position beside the trunk; also anchors the return trip. */
  workTarget: WorldPoint | null
  workProgress: number
  tree: number | null
  carrying: number
  hunger: number
  thirst: number
  stamina: number
  /** World position, rewritten every step; what the renderer draws. */
  x: number
  y: number
  z: number
  /** Distance along the road in tiles; authoritative whenever on the road. */
  progress: number
  /** Smoothed travel speed, before activity-specific haste. */
  moveSpeed: number
  /**
   * +1 walks west to east, -1 east to west. Starts as the traveler's own and
   * flips whenever they turn back from trouble.
   */
  direction: 1 | -1
  /** Personal distance left of the route centre, in tiles. */
  laneOffset: number
  /** Signed offset along the ordered route; eases across when turning back. */
  lane: number
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
  offRoadRoute: WorldPoint[] | null
  /** Vendor being chased while seeking. */
  targetId: number | null
  /** Vendors only: seconds left in the current walk-or-shop stint. */
  timer: number
  /** Vendors only: completed park-and-sell cycles, feeds the duration hash. */
  cycle: number
}

export interface SimState {
  procession?: RelicProcession | null
  admissionSequence: number
  admissionPayments: AdmissionPayment[]
  seed: number
  travelers: Map<number, SimTraveler>
  /** Game time in days since the sim began (fractional). */
  time: number
  /** Danger per tile, indexed like the map's tiles; what encounters roll against. */
  danger: Float64Array
  relic: RelicStats
  world: GameMap
  /** Contributions from structures, residents, scenery and relics, before visits. */
  shrineRenown: number
  balance: GameBalance
  visits: number
  wood: number
  /** Cumulative admission receipts; the economy credits each payment once. */
  shrineGold: number
  constructionWood: number
  felled: Set<number>
  treeResources: Map<number, TreeResource>
  foodStores: Map<string, FoodStock>
  piles: Map<string, WoodPile>
  resourceRevision: number
  buildings: readonly PlacedBuilding[]
  trees: readonly TreePlacement[]
}

export interface AdmissionPayment {
  id: number
  travelerId: number
  amount: number
  x: number
  y: number
  z: number
}

/**
 * Bridge to the HUD, which lives outside the canvas: the running sim registers
 * itself here and the traveler panel polls it a few times a second. Mutable
 * module state instead of a store because 60 fps writes shouldn't re-render
 * anything — readers sample it on their own schedule.
 */
export const simRegistry: { current: SimState | null } = { current: null }

/**
 * Offset a route vertex to the left (+z is south, so eastbound left is -z).
 * Joining the adjacent parallel segments at their intersection keeps bends
 * continuous. On our 4-connected routes the offset stays inside the tile.
 */
function laneVertex(
  map: GameMap,
  route: ReadonlyArray<{ x: number; z: number }>,
  i: number,
  lane: number,
): { x: number; z: number } {
  const p = route[i]
  const a = route[Math.max(0, i - 1)]
  const b = route[Math.min(route.length - 1, i + 1)]
  const inX = i === 0 ? b.x - p.x : p.x - a.x
  const inZ = i === 0 ? b.z - p.z : p.z - a.z
  const outX = i === route.length - 1 ? inX : b.x - p.x
  const outZ = i === route.length - 1 ? inZ : b.z - p.z
  const divisor = 1 + inX * outX + inZ * outZ
  // A doubled-back vertex has no intersection; keep its outgoing normal.
  const nx = divisor > 0 ? (inZ + outZ) / divisor : outZ
  const nz = divisor > 0 ? -(inX + outX) / divisor : -outX
  return { x: p.x + nx * lane, z: p.z + nz * lane }
}

interface WorldPoint {
  x: number
  y: number
  z: number
}

/**
 * World point along parallel lanes, interpolated continuously around bends.
 * Height follows the route's tile-centre surfaces, including bridge ramps and
 * raised decks; lane offsets must not be used as fractional tile indices.
 */
function routeWorldPoint(
  map: GameMap,
  route: ReadonlyArray<{ x: number; z: number }>,
  p: number,
  lane = 0,
  junctions?: { entry: number; exit: number },
): WorldPoint {
  if (route.length === 1) return {
    x: tileToWorldX(map, route[0].x),
    y: surfaceHeight(map, route[0].x, route[0].z),
    z: tileToWorldZ(map, route[0].z),
  }
  const i0 = Math.max(0, Math.min(Math.floor(p), route.length - 2))
  const frac = p - i0
  const vertex = (i: number) => {
    // Tracks meet the same lane point as the road at both junctions.
    if (junctions && (i === 0 || i === route.length - 1)) {
      const junction = i === 0 ? junctions.entry : junctions.exit
      return roadLanePoint(map, map.road!, junction, lane) ?? laneVertex(map, map.road!, junction, lane)
    }
    return laneVertex(map, route, i, lane)
  }
  const a = vertex(i0)
  const b = vertex(i0 + 1)
  const ay = surfaceHeight(map, route[i0].x, route[i0].z)
  const by = surfaceHeight(map, route[i0 + 1].x, route[i0 + 1].z)
  const curved = roadLanePoint(map, route, p, lane)
  // Preserve a shortcut's shared road-lane endpoint, blending to its own
  // tangent entrance over the first/last half tile.
  if (curved && junctions) {
    const end = p < 0.5 ? 0 : p > route.length - 1.5 ? route.length - 1 : -1
    if (end >= 0) {
      const own = roadLanePoint(map, route, end, lane)!
      const shared = vertex(end)
      const weight = Math.max(0, 1 - 2 * Math.abs(p - end))
      curved.x += (shared.x - own.x) * weight
      curved.z += (shared.z - own.z) * weight
    }
  }
  const tx = curved?.x ?? a.x + (b.x - a.x) * frac
  const tz = curved?.z ?? a.z + (b.z - a.z) * frac
  const point = { x: tileToWorldX(map, tx),
    y: ropeHeightAt(map, tx, tz) ?? ay + (by - ay) * frac,
    z: tileToWorldZ(map, tz) }
  return point
}

function roadWorldPoint(map: GameMap, p: number, lane: number): WorldPoint {
  return routeWorldPoint(map, map.road!, p, lane)
}

/** Road convoys keep both the puller and axle on their curved walking lane. */
export function roadCartPose(map: GameMap, s: SimTraveler, wheelbase: number) {
  return cartOnRoute(s.progress, s.direction, wheelbase, p => {
    const lane = roadLanePoint(map, map.road!, p, s.lane)
    return lane ? { x: tileToWorldX(map, lane.x), z: tileToWorldZ(map, lane.z) } : roadWorldPoint(map, p, s.lane)
  })
}

/** Where on their route — road or track — the traveler currently belongs. */
function currentRoutePoint(map: GameMap, s: SimTraveler): WorldPoint {
  if (s.track) {
    const track = map.shortcuts![s.track.index]
    return routeWorldPoint(map, track.tiles, s.track.progress, s.lane, track)
  }
  return roadWorldPoint(map, s.progress, s.lane)
}

/** Join the shrine's walking lanes to the traveler's road lane over the first tile. */
function shrineWorldPoint(map: GameMap, s: SimTraveler): WorldPoint {
  const site = map.site!
  const route = s.shrineRoute ?? site.branch
  // Leave the walking lane before reaching the grounds; cross gates centrally.
  const laneBlend = s.shrineRoute ? Math.max(0, Math.min(1, site.branch.length - 1 - s.branchProgress)) : 1
  const point = routeWorldPoint(map, route, s.branchProgress, s.lane * laneBlend)
  if (s.branchProgress < 1) {
    const start = routeWorldPoint(map, site.branch, 0, s.lane)
    const roadLane = s.activity === "toRelic" ? s.branchEntryLane : s.direction * s.laneOffset
    const road = roadWorldPoint(map, site.junction, roadLane)
    const blend = 1 - s.branchProgress
    point.x += (road.x - start.x) * blend
    point.y += (road.y - start.y) * blend
    point.z += (road.z - start.z) * blend
  }
  return point
}

/** Cross to the new left lane over a short walk, including when seeking food. */
function stepLane(s: SimTraveler, direction: 1 | -1, distance: number): void {
  const target = direction * s.laneOffset
  const step = Math.max(0, distance) * 0.8
  s.lane += Math.max(-step, Math.min(step, target - s.lane))
}

export function createSim(
  travelers: Traveler[],
  map: GameMap,
  threats: ThreatSource[] = [],
  relic: RelicStats = generateRelic(map.seed ?? 0).stats,
): SimState {
  const sim: SimState = {
    admissionSequence: 0,
    admissionPayments: [],
    seed: map.seed ?? 0,
    travelers: new Map(),
    time: START_TIME,
    danger: computeDangerField(map, threats),
    relic: { ...relic },
    world: map,
    shrineRenown: 0,
    balance: DEFAULT_BALANCE,
    visits: 0,
    wood: 0,
    shrineGold: 0,
    constructionWood: 0,
    felled: new Set(),
    treeResources: new Map(),
    foodStores: new Map(),
    piles: new Map(),
    resourceRevision: 0,
    buildings: [],
    trees: [],
  }
  if (!map.road || map.road.length < 2) return sim
  const length = map.road.length - 1
  for (const t of travelers) {
    const progress = t.offset * length
    // A separate, per-id stream preserves the cast and survives reordering.
    const laneRng = makeRng(deriveSeed(deriveSeed(map.seed ?? 0, SEED_STREAM.lanes), t.id))
    const laneOffset = 0.18 + laneRng() * 0.1
    const lane = t.direction * laneOffset
    const at = roadWorldPoint(map, progress, lane)
    sim.travelers.set(t.id, {
      admissionPaid: 0,
      id: t.id,
      activity: "walking",
      gold: t.attributes.gold,
      piety: t.attributes.piety,
      jobless: t.attributes.jobless,
      employer: null,
      branchProgress: 0,
      shrineRoute: null,
      branchEntryLane: lane,
      visitCooldown: 0,
      visits: 0,
      workRoute: null,
      workTarget: null,
      workProgress: 0,
      tree: null,
      carrying: 0,
      hunger: t.attributes.hunger,
      thirst: t.attributes.thirst,
      stamina: t.attributes.stamina,
      x: at.x,
      y: at.y,
      z: at.z,
      progress,
      moveSpeed: 0,
      direction: t.direction,
      laneOffset,
      lane,
      track: null,
      fled: 0,
      rolls: 0,
      fleeTimer: 0,
      walkFrom: null,
      spot: null,
      walkT: 0,
      offRoadRoute: null,
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
function findClearTile(map: GameMap, wx: number, wz: number, start: TilePos): { x: number; z: number } | null {
  const cx = worldToTileX(map, wx)
  const cz = worldToTileZ(map, wz)
  for (let r = 0; r <= CAMP_SEARCH_RADIUS; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const terrain = tileAt(map, cx + dx, cz + dz)
        if ((terrain === "grass" || terrain === "dirt" || terrain === "clearing") && !buildingAt(map, cx + dx, cz + dz)) {
          const goal = { x: cx + dx, z: cz + dz }
          if (settlementRoute(map, map.buildings, start, goal)) return goal
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

const STALL_ACTIVITIES: readonly Activity[] = ["toShop", "openingShop", "vending", "packingShop"]
const CAMP_ACTIVITIES: readonly Activity[] = ["toCamp", "camping"]

/** World-space pitch on the nearest clearing to `anchor`, or in place if none. */
function pitchSpot(
  map: GameMap,
  s: SimTraveler,
  anchor: { x: number; z: number },
): { x: number; y: number; z: number } {
  const tile = findClearTile(map, anchor.x, anchor.z, { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) })
  return tile
    ? {
        x: tileToWorldX(map, tile.x),
        y: surfaceHeight(map, tile.x, tile.z),
        z: tileToWorldZ(map, tile.z),
      }
    : { x: s.x, y: s.y, z: s.z }
}

function startOffRoadWalk(s: SimTraveler, activity: Activity): void {
  s.walkFrom = { x: s.x, y: s.y, z: s.z }
  s.walkT = 0
  s.offRoadRoute = null
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

/** Camps and stalls use the same four-neighbour routing as settlement work. */
function stepOffRoadWalk(
  s: SimTraveler,
  to: WorldPoint,
  worldSpeed: number,
  dt: number,
  map: GameMap,
): boolean {
  if (!s.offRoadRoute) {
    const route = settlementRoute(map, map.buildings,
      { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) },
      { x: worldToTileX(map, to.x), z: worldToTileZ(map, to.z) })
    if (!route) return false
    const points = route.map(p => ({ x: tileToWorldX(map, p.x), y: surfaceHeight(map, p.x, p.z), z: tileToWorldZ(map, p.z) }))
    // Align to/from the road lane inside its tile; never take a diagonal shortcut.
    const first = points[0], last = points.at(-1)!
    s.offRoadRoute = [
      { x: first.x, y: s.y, z: s.z }, ...points,
      { x: to.x, y: last.y, z: last.z }, { ...to },
    ]
  }
  let distance = worldSpeed * dt
  while (s.offRoadRoute.length) {
    const target = s.offRoadRoute[0]
    const dx = target.x - s.x, dz = target.z - s.z, length = Math.hypot(dx, dz)
    if (length > distance) {
      const t = distance / length
      s.x += dx * t; s.y += (target.y - s.y) * t; s.z += dz * t
      return false
    }
    s.x = target.x; s.y = target.y; s.z = target.z
    distance -= length
    s.offRoadRoute.shift()
  }
  s.walkT = 1
  return true
}

/** Customers have already aligned with the entrance on the road. Their final
 * axis-aligned leg stops at the frontage, before the display tile's centre. */
function startCustomerWalk(s: SimTraveler, activity: "toStall" | "fromStall"): void {
  startOffRoadWalk(s, activity)
  s.offRoadRoute = [{ ...s.customerVisit![activity === "toStall" ? "frontage" : "road"] }]
}

function stepStallWalk(map: GameMap, s: SimTraveler, leaving: boolean, distance: number): boolean {
  if (!s.stallRoute) return stepOffRoadWalk(s, leaving ? currentRoutePoint(map, s) : s.spot!, distance, 1, map)
  const route = leaving ? s.stallRoute.exit : s.stallRoute.entry
  s.walkT = Math.min(routeLength(route), s.walkT + distance)
  const p = routePoint(route, s.walkT)
  s.x = p.x; s.z = p.z; s.y = surfaceHeight(map, worldToTileX(map, p.x), worldToTileZ(map, p.z))
  return s.walkT >= routeLength(route)
}

function routeState(t: Traveler, s: SimTraveler): RouteState {
  return { type: t.type.id, piety: s.piety, stamina: s.stamina }
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

/** Unskilled applicants can fill any open woodcutter hut slot. */
function findJob(sim: SimState, s: SimTraveler, map: GameMap): PlacedBuilding | undefined {
  if (!s.jobless || s.employer) return undefined
  return sim.buildings.find((b) => {
    const centre = buildingCentre(map, b)
    return Array.from(sim.travelers.values()).filter((worker) => worker.employer === b.id).length < BUILDING_KINDS[b.kind].jobs &&
      sim.trees.some((tree, index) => (sim.treeResources.get(index)?.remainingWood ?? 1) > 0 &&
        Math.hypot(tree.x - centre.x, tree.z - centre.z) <= BUILDING_KINDS[b.kind].workRadius)
  })
}

function startWorkRoute(s: SimTraveler, route: TilePos[], activity: Activity): void {
  s.workRoute = route
  s.workProgress = 0
  s.activity = activity
}

function stepWorkRoute(s: SimTraveler, map: GameMap, speed: number, dt: number): boolean {
  const route = s.workRoute!
  s.workProgress = Math.min(route.length - 1, s.workProgress + speed * dt)
  const at = routeWorldPoint(map, route, s.workProgress)
  if (s.workTarget) {
    const last = route.length - 1
    const inbound = s.activity === "toWork"
    if (inbound && s.workProgress >= Math.max(0, last - 1) || s.activity === "hauling" && s.workProgress <= 1) {
      const a = inbound ? routeWorldPoint(map, route, Math.max(0, last - 1)) : s.workTarget
      const b = inbound ? s.workTarget : routeWorldPoint(map, route, Math.min(1, last))
      const blend = last === 0 ? 1 : inbound ? s.workProgress - (last - 1) : s.workProgress
      at.x = a.x + (b.x - a.x) * blend
      at.y = a.y + (b.y - a.y) * blend
      at.z = a.z + (b.z - a.z) * blend
    }
  }
  s.x = at.x
  s.y = at.y
  s.z = at.z
  return s.workProgress >= route.length - 1
}

function chooseTree(sim: SimState, s: SimTraveler, map: GameMap): boolean {
  const camp = sim.buildings.find((b) => b.id === s.employer)
  if (!camp) return false
  const centre = buildingCentre(map, camp)
  const reserved = new Set(Array.from(sim.travelers.values()).map((w) => w.tree))
  const candidates = sim.trees.map((tree, index) => ({ tree, index }))
    .filter(({ tree, index }) => !tree.walking && (sim.treeResources.get(index)?.remainingWood ?? 1) > 0 && !reserved.has(index) &&
      Math.hypot(tree.x - centre.x, tree.z - centre.z) <= BUILDING_KINDS[camp.kind].workRadius)
    .sort((a, b) => Number(sim.felled.has(b.index)) - Number(sim.felled.has(a.index)) ||
      Math.hypot(a.tree.x - s.x, a.tree.z - s.z) - Math.hypot(b.tree.x - s.x, b.tree.z - s.z))
  const start = { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) }
  for (const { tree, index } of candidates) {
    const route = settlementRoute(map, [...map.buildings, ...sim.buildings], start,
      { x: worldToTileX(map, tree.x), z: worldToTileZ(map, tree.z) }, true)
    if (!route) continue
    s.tree = index
    // Approach from the route's last step, leaving room for the waist-height axe stroke.
    const approach = routeWorldPoint(map, route, Math.max(0, route.length - 2))
    const dx = approach.x - tree.x, dz = approach.z - tree.z
    const distance = Math.hypot(dx, dz)
    const radius = TREE_SPECIES[tree.species].trunk.radius
    const standOff = (tree.shape?.trunkRadius ?? (radius.min + radius.max) / 2) * (tree.scale ?? 1) + 0.31
    s.workTarget = {
      x: tree.x + (distance > 1e-6 ? dx / distance : 0) * standOff,
      y: tree.y,
      z: tree.z + (distance > 1e-6 ? dz / distance : 1) * standOff,
    }
    if (!sim.treeResources.has(index)) sim.treeResources.set(index, treeResource(tree, index, map.seed))
    startWorkRoute(s, route, "toWork")
    return true
  }
  return false
}

function finishVisit(sim: SimState, s: SimTraveler, t: Traveler, map: GameMap): void {
  s.visits++
  sim.visits++
  if (s.admissionPaid > 0) s.piety = Math.min(100, s.piety + 4 + sim.relic.sanctity / 25)
  s.admissionPaid = 0
  const job = findJob(sim, s, map)
  if (job && nextRoll(s) < (t.attributes.skills.some((skill) => BUILDING_KINDS[job.kind].trades.includes(skill)) ? 0.9 : 0.65)) {
    const route = settlementRoute(map, [...map.buildings, ...sim.buildings],
      { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) },
      buildingEntry(job), false, true)
    if (route) {
      s.employer = job.id
      s.jobless = false
      startWorkRoute(s, route, "hauling")
      return
    }
  }
  s.activity = "fromRelic"
}

export function stepSim(
  sim: SimState,
  travelers: Traveler[],
  map: GameMap,
  baseSpeed: number,
  dt: number,
  movement: MovementTuning = LINEAR_MOVEMENT,
  /** Rendered stride relative to the reference person, keyed by traveler ID. */
  speedScales?: ReadonlyMap<number, number>,
  characterScale = BASE_CHARACTER_SCALE,
): void {
  if (!map.road || map.road.length < 2) return
  const length = map.road.length - 1
  sim.time += dt / GAME_DAY_SECONDS
  const hours = dt / GAME_HOUR_SECONDS

  for (const t of travelers) {
    const s = sim.travelers.get(t.id)
    if (!s) continue
    s.praying = nearProcession(sim.procession, s, s.praying)
    if (s.praying) { s.moveSpeed = 0; continue }
    s.visitCooldown = Math.max(0, s.visitCooldown - dt)
    const camping = s.activity === "camping"
    const sheltered = s.activity === "visiting" || s.activity === "idle"
    const isVendor = t.type.id === "vendor"

    // --- Needs march on ------------------------------------------------------
    const needFactor = camping ? CAMP_NEED_FACTOR : 1
    s.hunger = Math.max(0, s.hunger - sim.balance.rules.hungerDecay * needFactor * hours)
    s.thirst = Math.max(0, s.thirst - sim.balance.rules.thirstDecay * needFactor * hours)
    if (camping) s.stamina = Math.min(100, s.stamina + CAMP_STAMINA_REGEN * hours)
    // Minding a parked stall neither drains nor restores the legs.
    else if (s.activity !== "vending") {
      s.stamina = Math.max(0, s.stamina - sim.balance.rules.staminaDecay * hours)
    }

    if (sheltered) {
      s.hunger = Math.min(100, s.hunger + 70 * hours)
      s.thirst = Math.min(100, s.thirst + 90 * hours)
      s.stamina = Math.min(100, s.stamina + 65 * hours)
    }

    // Vendors eat and drink from their own stock, on the move.
    if (isVendor) {
      if (s.hunger <= 0) s.hunger = 100
      if (s.thirst <= 0) {
        s.thirst = 100
      }
    }

    const targetSpeed = t.pace * baseSpeed * (speedScales?.get(t.id) ?? 1) * paceVariation(t.id, sim.time * GAME_DAY_SECONDS, movement.variation)
    s.moveSpeed = camping || sheltered || s.activity === "working" || s.activity === "browsing" || s.activity === "openingShop" || s.activity === "packingShop" || s.activity === "vending" ? 0 :
      easeSpeed(s.moveSpeed, targetSpeed, dt, movement.acceleration)
    const worldSpeed = s.moveSpeed

    if (s.pasture && (s.activity === "openingShop" || s.activity === "vending" || s.activity === "packingShop")) {
      s.pasture.obstacles = [...sim.travelers.values()].flatMap(other =>
        other.stallRoute && ["openingShop", "vending", "packingShop"].includes(other.activity) ? other.stallRoute.obstacles : [])
      stepPasture(map, s.pasture, dt, Math.max(0.01, targetSpeed), s.activity === "packingShop")
    }
    switch (s.activity) {
      case "toRelic":
      case "fromRelic": {
        const branch = s.shrineRoute ?? map.site!.branch
        const inbound = s.activity === "toRelic"
        s.branchProgress = Math.max(0, Math.min(branch.length - 1,
          s.branchProgress + (inbound ? 1 : -1) * worldSpeed * dt))
        stepLane(s, inbound ? 1 : -1, worldSpeed * dt)
        const at = shrineWorldPoint(map, s)
        s.x = at.x
        s.y = at.y
        s.z = at.z
        if (inbound && s.branchProgress >= branch.length - 1) {
          const fee = admissionFee(map)
          if (s.gold >= fee) {
            s.gold -= fee
            sim.shrineGold += fee
            s.admissionPaid = fee
            if (fee > 0) {
              sim.admissionPayments.push({ id: ++sim.admissionSequence, travelerId: s.id, amount: fee, x: s.x, y: s.y, z: s.z })
              // Presentation reads these receipts by sequence; long games stay bounded.
              if (sim.admissionPayments.length > 64) sim.admissionPayments.shift()
            }
            s.activity = "visiting"
            s.timer = 2 * GAME_HOUR_SECONDS
          } else {
            s.activity = "fromRelic"
          }
        } else if (!inbound && s.branchProgress <= 0) {
          s.lane = s.direction * s.laneOffset
          s.activity = "walking"
          s.shrineRoute = null
          s.visitCooldown = 30
        }
        break
      }
      case "visiting": {
        s.timer -= dt
        if (s.timer <= 0 && Math.min(s.hunger, s.thirst, s.stamina) >= 95) finishVisit(sim, s, t, map)
        break
      }
      case "toWork": {
        if (stepWorkRoute(s, map, worldSpeed, dt)) {
          const tree = sim.treeResources.get(s.tree!)!
          s.activity = tree.health > 0 ? "working" : "gathering"
          s.timer = GAME_HOUR_SECONDS
        }
        break
      }
      case "working": {
        const tree = sim.treeResources.get(s.tree!)!
        tree.health = Math.max(0, tree.health - AXE_DAMAGE_PER_HOUR * hours)
        if (tree.health <= 0) {
          tree.felledAt = sim.time
          tree.stumpUntil = sim.time + STUMP_LIFETIME_DAYS
          sim.felled.add(s.tree!)
          sim.resourceRevision++
          s.activity = "gathering"
          s.timer = GAME_HOUR_SECONDS
        }
        break
      }
      case "gathering": {
        s.timer -= dt
        if (s.timer <= 0) {
          const tree = sim.treeResources.get(s.tree!)!
          const destination = s.employer && timberDestination(map, [...map.buildings, ...sim.buildings], s.employer, s)
          if (!destination) { s.timer = GAME_HOUR_SECONDS; break }
          s.carrying = Math.min(TIMBER_LOAD, tree.remainingWood)
          tree.remainingWood -= s.carrying
          sim.resourceRevision++
          s.tree = null
          s.deliveryBuilding = destination.building.id
          startWorkRoute(s, destination.route, "hauling")
        }
        break
      }
      case "hauling": {
        if (stepWorkRoute(s, map, worldSpeed, dt)) {
          if (s.employer && s.carrying > 0) {
            stackWood(sim.piles, s.deliveryBuilding ?? s.employer, s.carrying)
            sim.wood += s.carrying
            sim.resourceRevision++
            s.gold++
          }
          s.carrying = 0
          s.deliveryBuilding = null
          if (Math.min(s.hunger, s.thirst, s.stamina) > 40 && chooseTree(sim, s, map)) break
          s.activity = "idle"
          s.timer = GAME_HOUR_SECONDS
        }
        break
      }
      case "idle": {
        s.timer -= dt
        if (s.timer <= 0 && Math.min(s.hunger, s.thirst, s.stamina) >= 80) {
          if (!chooseTree(sim, s, map)) s.timer = GAME_HOUR_SECONDS
        }
        break
      }
      case "walking":
      case "seeking":
      case "fleeing": {
        // A hungry traveler may consider a shrine ahead on their own route.
        // Never turn them back toward a junction they have already passed.
        const renown = sim.shrineRenown + sim.visits * sim.balance.rules.visitRenown
        const ahead = map.site ? s.direction * (map.site.junction - s.progress) : -1
        const shelter = !!map.site && s.gold >= admissionFee(map) && !s.track && s.activity !== "fleeing" && s.visitCooldown <= 0 &&
          Math.min(s.hunger, s.thirst) < hospitalityNeedThreshold(renown, sim.balance) && ahead >= 0 && ahead <= 12
        if (s.stamina <= 0 && !shelter) {
          startCamping(sim, s, t, map)
          break
        }
        if (s.activity === "fleeing") {
          s.fleeTimer -= dt
          if (s.fleeTimer <= 0) s.activity = "walking"
        }
        // A vendor whose walking stint is up pulls off to the side of the path.
        if (isVendor && !shelter && !s.track) {
          s.timer -= dt
          if (s.timer <= 0) {
            const pitch = roadsideStall(map, s, s.progress, s.direction, -cartOffset(cartLoadout(s.id).puller) * characterScale, characterScale, cartLoadout(s.id).puller)
            if (pitch) {
              s.stallRoute = pitch
              s.spot = { ...pitch.park, y: surfaceHeight(map, worldToTileX(map, pitch.park.x), worldToTileZ(map, pitch.park.z)) }
              startOffRoadWalk(s, "toShop")
              break
            }
            s.timer = 5
          }
        }
        // Nobody goes shopping from the middle of the dark forest: on a track
        // they trudge on hungry until they rejoin the road.
        if (s.activity === "walking" && !shelter && !isVendor && !s.track && (s.hunger <= 0 || s.thirst <= 0)) {
          s.activity = "seeking"
          s.targetId = null
        }

        let direction = s.direction
        let haste = s.activity === "fleeing" ? FLEE_HASTE : 1
        if (s.activity === "seeking" && !shelter) {
          // (Re)acquire the nearest vendor who isn't off camping somewhere.
          const vendor = travelers
            .filter((v) => v.type.id === "vendor")
            .map((v) => sim.travelers.get(v.id))
            .filter(
              (v): v is SimTraveler =>
                !!v && v.activity !== "openingShop" && v.activity !== "packingShop" && !CAMP_ACTIVITIES.includes(v.activity) && v.activity !== "fromCamp",
            )
            .sort((a, b) => Math.abs(a.progress - s.progress) - Math.abs(b.progress - s.progress))[0]

          if (vendor) {
            s.targetId = vendor.id
            if (vendor.activity === "vending" && vendor.stallRoute && !s.track) {
              const entrance = vendor.stallRoute.entranceProgress
              const remaining = entrance - s.progress, step = worldSpeed * SEEK_HASTE * dt
              s.progress += Math.sign(remaining) * Math.min(Math.abs(remaining), step)
              const at = currentRoutePoint(map, s)
              s.x = at.x; s.y = at.y; s.z = at.z
              if (Math.abs(remaining) <= step) {
                const front = vendor.stallRoute.frontage
                s.customerVisit = { vendorId: vendor.id, road: at, frontage: { ...front, y: surfaceHeight(map, worldToTileX(map, front.x), worldToTileZ(map, front.z)) } }
                startCustomerWalk(s, "toStall")
              }
              break
            }
            const range = vendor.activity === "vending" ? STALL_TRADE_RANGE : TRADE_RANGE
            if (Math.hypot(vendor.x - s.x, vendor.z - s.z) <= range) {
              if (s.hunger <= BUY_THRESHOLD) {
                pay(s, vendor, FOOD_PRICE)
                s.hunger = 100
              }
              if (s.thirst <= BUY_THRESHOLD) {
                pay(s, vendor, WINE_PRICE)
                s.thirst = 100
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
          stepLane(s, s.activity === "fleeing" ? s.direction : direction, worldSpeed * haste * dt)
          const at = currentRoutePoint(map, s)
          s.x = at.x
          s.y = at.y
          s.z = at.z
          break
        }

        const site = map.site
        if (site && site.branch.length >= 2 && s.activity !== "fleeing" && s.visitCooldown <= 0) {
          const distance = ((direction * (site.junction - s.progress)) % length + length) % length
          if (distance <= worldSpeed * haste * dt) {
            const chance = visitChance({ ...t.attributes, piety: s.piety,
              hunger: s.hunger, thirst: s.thirst, stamina: s.stamina }, sim.relic, renown, sim.balance)
            s.visitCooldown = 5
            const wantsVisit = nextRoll(s) < chance && s.gold >= admissionFee(map)
            const visitRoute = wantsVisit ? shrineVisitRoute(map, s.id, s.visits) : null
            if (visitRoute) {
              s.progress = site.junction
              s.branchProgress = 0
              s.shrineRoute = visitRoute
              s.admissionPaid = 0
              s.activity = "toRelic"
              s.targetId = null
              s.branchEntryLane = s.lane
              s.lane = s.laneOffset
              const at = shrineWorldPoint(map, s)
              s.x = at.x
              s.y = at.y
              s.z = at.z
              break
            }
          }
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
        stepLane(s, s.activity === "fleeing" ? s.direction : direction, worldSpeed * haste * dt)
        const at = currentRoutePoint(map, s)
        s.x = at.x
        s.y = at.y
        s.z = at.z
        break
      }

      case "toStall": {
        const visit = s.customerVisit!, vendor = sim.travelers.get(visit.vendorId)
        if (!vendor || vendor.activity !== "vending") { startCustomerWalk(s, "fromStall"); break }
        if (stepOffRoadWalk(s, visit.frontage, worldSpeed, dt, map)) { s.activity = "browsing"; s.timer = 2 }
        break
      }
      case "browsing": {
        const vendor = sim.travelers.get(s.customerVisit!.vendorId)
        s.timer = Math.max(0, s.timer - dt)
        if (s.timer === 0 || !vendor || vendor.activity !== "vending") {
          if (vendor?.activity === "vending") {
            if (s.hunger <= BUY_THRESHOLD) { pay(s, vendor, FOOD_PRICE); s.hunger = 100 }
            if (s.thirst <= BUY_THRESHOLD) { pay(s, vendor, WINE_PRICE); s.thirst = 100 }
          }
          startCustomerWalk(s, "fromStall")
        }
        break
      }
      case "fromStall": {
        if (stepOffRoadWalk(s, s.customerVisit!.road, worldSpeed, dt, map)) {
          s.activity = "walking"; s.customerVisit = undefined; s.walkFrom = null
        }
        break
      }

      case "toShop": {
        if (stepStallWalk(map, s, false, worldSpeed * dt)) {
          s.activity = "openingShop"
          s.timer = SHOP_SECONDS
          if (cartLoadout(s.id).puller !== "hand") s.pasture = createPasture(s, s.stallRoute?.obstacles, animalClearance(cartLoadout(s.id).puller, characterScale))

        }
        break
      }

      case "openingShop": {
        s.timer = Math.max(0, s.timer - dt)
        if (s.timer === 0) { s.activity = "vending"; s.keeperTime = 0; s.timer = vendShopSeconds(s.id, s.cycle) }
        break
      }
      case "packingShop": {
        s.timer = Math.max(0, s.timer - dt)
        if (s.timer === 0 && (!s.pasture || s.pasture.ready)) {
          s.pasture = undefined
          startOffRoadWalk(s, "fromShop")
        }
        break
      }
      case "vending": {
        // Finish the keeper's short return walk before unloading the site.
        s.keeperTime = (s.keeperTime ?? 0) + dt
        s.timer -= dt
        const keeperHome = keeperRoutine(s.keeperTime, cartLoadout(s.id).puller, characterScale, personWalkStride(populationDesign(t.type, travelerAppearance(map.seed ?? 0, t.id).variant)) * characterScale).atHome
        if (s.timer <= 0 && keeperHome) {
          s.cycle++
          if (s.spot) {
            s.activity = "packingShop"
            s.timer = SHOP_SECONDS
          } else {
            s.timer = vendWalkSeconds(s.id, s.cycle)
            s.activity = "walking"
          }
        }
        break
      }

      case "fromShop": {
        if (stepStallWalk(map, s, true, worldSpeed * dt)) {
          if (s.stallRoute) s.progress = s.stallRoute.returnProgress
          s.stallRoute = undefined
          s.activity = "walking"
          s.spot = null
          s.walkFrom = null
          s.timer = vendWalkSeconds(s.id, s.cycle)
        }
        break
      }

      case "toCamp": {
        if (stepOffRoadWalk(s, s.spot!, worldSpeed, dt, map)) s.activity = "camping"
        break
      }

      case "camping": {
        if (s.stamina >= 100) startOffRoadWalk(s, "fromCamp")
        break
      }

      case "fromCamp": {
        const back = currentRoutePoint(map, s)
        if (stepOffRoadWalk(s, back, worldSpeed, dt, map)) {
          s.activity = "walking"
          s.spot = null
          s.walkFrom = null
        }
        break
      }
    }
  }
}
