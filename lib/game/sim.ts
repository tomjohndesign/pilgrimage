import { ensurePartyTransport, stepPartyPacks, seatParty, parkParty, movePartyCart, turnPartyCart } from "./transport/party"
import { seatPoint } from "./transport/party-assets"
import { animalWalkSpeed } from "./transport/assets"
import { stepDevotion, HAPPINESS_THRESHOLD, TAVERN_HAPPINESS_GAIN } from "./wellbeing"
import { isWaterSource, waterVisitPlan, WATER_SEEK_THRESHOLD, WATER_SEEK_RADIUS, WATER_VISIT_SECONDS, type WaterVisit } from "./water-sources/navigation"
import { naturalWaterStop, WATER_THIRST_THRESHOLD, WATER_DRINK_SECONDS } from "./natural-water"
import { tavernWalkingRoute } from "./tavern-navigation"
import { townResidents } from "./town-residents"
import { placeResident } from "./jobs/residents"
import { GAME_DAY_SECONDS, GAME_HOUR_SECONDS, START_TIME } from "./calendar"
import { wearySpeedScale } from "./traveler-weariness"
import { cachedFormation, diversionPoints, partyRoadDelta, sharePartyNeeds, partySlots, pruneTravelParties, regroupParty, syncTravelParties, type TravelParty } from "./travel-parties"
import { housingBeds, vacantMonkBed } from "./housing"
import { MONK_COUNT, MONK_JOIN_CHANCE, type Monk } from "./monks"
import { monkWalkSpeed } from "./base-person/monk-assets"
import { withTerrainCornerQueries } from "./map/cliff-corners"
import { buildingSpatialQuery } from "./building-spatial"
import { settlementJob, jobSpeedScale } from "./jobs/design"
import { seekSheep, stepShepherd, releaseSheep, type HerdingTask } from "./herding"
import type { WildlifeWorld } from "./wildlife/simulation"
import { cartPath, driveSegment, driveRouteSegment, marketParking, type MarketParking } from "./transport/building-parking"
import { roadCartPose } from "./transport/bridge-guide"
import { cartRoadDiversion } from "./transport/road-diversion"
import { blockedRoad, findRoadDiversion, takeRoadShortcut, retireBypassedRoad, exploresRoadShortcut, type WalkingShortcut } from "./walking-shortcuts"
import { createFootpaths, HEAVY_PATH_WEAR, recordWalkingPath, regrowFootpaths, type Footpaths } from "./footpaths"
import { knightMounted, knightLoadout, knightTravelSpeed, knightWalkStride, type HorseRest } from "./knights"
import { DEFAULT_WALK_SPEED, DEFAULT_WALK_CADENCE, personWalkStride } from "./base-person/gait"
import { assignBuildingTask, buildingEntrance, stepBuildingTask, walkWorker, workerRoute, type BuildingTask } from "./construction"
import { buildingEntry } from "./building-rotation"
import { timberDestination, type FoodStock } from "./storage"
import { blessByProcession, nearProcession, type RelicProcession } from "./relic-procession"
import { routePoint, routeLength, type StallRoute } from "./transport/roadside"
import { advanceCartProgress } from "./transport/route"
import { roadLanePoint } from "./map/road-lane"
import { treeSpatialIndex } from "./trees/spatial"
import { RoadsideReservations } from "./roadside-reservations"
import { SpatialPoints } from "./spatial-points"
import { walkingSurface } from "./map/walking-surface"
import { convoyPoint, convoyBounds, convoyBuildingsClear, stallParking, shrineParking, type ParkingContext, type ShrineParking } from "./transport/navigation"
import { alignCart, followCart, type CartPose } from "./transport/follow"
import { keeperRoutine } from "./transport/keeper"
import { populationDesign, travelerAppearance } from "./base-person/population"
import { animalClearance } from "./transport/stall"
import { BASE_CHARACTER_SCALE } from "./base-person/gait"
import { cartOffset, SHOP_SECONDS, cartLoadout } from "./transport/assets"
import { createPasture, stepPasture, type PastureAnimal } from "./transport/pasture"
import { LINEAR_MOVEMENT, easeSpeed, paceVariation, type MovementTuning } from "./motion"
import { DEFAULT_BALANCE, type GameBalance } from "./balance"
import { roadsideEvangelism } from "./monk-evangelism"
import { buildingAt, jobBuildings } from "./settlement"
import { isComplete, isHouse } from "./construction"
import { AXE_DAMAGE_PER_HOUR, STUMP_LIFETIME_DAYS, TIMBER_LOAD, stackWood, treeResource, type TreeResource, type WoodPile } from "./trees/timber"
import { BUILDING_KINDS, buildingCentre, isPostedWork, type PlacedBuilding } from "./buildings"
import { DRINK_PRICE, MEAL_PRICE, SERVING_THRESHOLD, SEAT_REST_THRESHOLD, SEAT_STAMINA_PER_HOUR, TABLE_HOURS, servingHouses, tavernVisitPlan, seatRestPlan, type TavernPlan } from "./tavern"
import { generateRelic, hospitalityNeedThreshold, visitChance, type RelicStats } from "./relic"
import { settlementRoute } from "./settlement-route"
import { shrineDonation, shrineExitPlan, shrineVisitPlan } from "./shrine-visit"
import type { TreePlacement } from "./trees/placement"
import { TREE_SPECIES } from "./trees/species"
import type { TilePos } from "./map/types"
import { computeDangerField, encounterChance, type ThreatSource } from "./map/danger"
import { surfaceHeight, bridgeLayout } from "./map/bridges"
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
import { TRAVELER_TYPES, type Traveler } from "./travelers"

/**
 * The living layer on top of traveler identity: a game clock ticks, needs decay
 * with it, and activities answer them. Pure data and functions — no three.js,
 * no React — the canvas calls `stepSim` each frame and draws whatever positions
 * come out.
 *
 * The loop per traveler:
 *  - Walking wears them down: stamina, hunger, and thirst all fall.
 *  - At the shrine junction, faith, hospitality and evangelism draw visitors
 *    down the branch. The brothers restore their needs and bestow piety before
 *    they return to the road; each visit spreads the shrine's renown.
 *  - Jobless visitors may settle into a woodcutter hut slot, walk to a reserved
 *    tree, fell it and haul logs home. Legs never tire on the road.
 *  - Stamina below 20 → leave the road for the nearest open ground (grass, dirt,
 *    or a forest-floor clearing — never solid woods or the road itself) and
 *    camp until rested. A roadside stall is
 *    the favourite pitch for anyone; pilgrims will otherwise join an existing
 *    camp rather than camp alone.
 *  - Hunger or thirst at 0 → chase down a vendor and buy: food refills hunger,
 *    wine refills thirst. Energy returns through rest. Gold changes hands.
 *  - Vendors walk a stretch, then pull the cart off to the side of the path and
 *    keep shop for a full day before moving on. They eat their own stock free.
 *  - Danger (see map/danger.ts) is met tile by tile: each new tile rolls for
 *    trouble against its danger, and trouble rolls against the traveler's
 *    nerve. Lose it and they turn back — direction flips and they hurry the
 *    way they came for a while. At the mouth of a track through the dark
 *    forest, who they are decides whether they take it (see route-choice.ts).
 *    Dice are hashed from (id, roll count), so no RNG plumbing is needed and
 *    every journey replays identically.
 */

export type Activity =
  | "toWater" | "drinking" | "drinkingLow" | "fromWater"
  | "toParking"
  | "fromParking"
  | "toRelic"
  | "visiting"
  | "offering"
  | "fromRelic"
  | "toWork"
  | "toSheep"
  | "herding"
  | "toPost"
  | "posted"
  | "toHome"
  | "sleeping"
  | "fromHome"
  | "toTavern"
  | "buying"
  | "sitting"
  | "fromTavern"
  | "working"
  | "gathering"
  | "hauling"
  | "idle"
  | "fromBuild"
  | "toBuild"
  | "building"
  | "walking"
  | "seeking"
  | "toBegging"
  | "begging"
  | "fromBegging"
  | "toAlms"
  | "givingAlms"
  | "fromAlms"
  | "toPerformance"
  | "performing"
  | "fromPerformance"
  | "toListen"
  | "listening"
  | "fromListening"
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
  toWater: "Going to drink water", drinking: "Drinking at the well", drinkingLow: "Drinking at the water’s edge", fromWater: "Returning from water",
  toParking: "Parking outside the shrine",
  fromParking: "Returning the wagon to the road",
  toRelic: "Entering the shrine or waiting for the relic",
  visiting: "Praying in the shrine",
  offering: "At the offering box",
  fromRelic: "Returning from the shrine",
  toWork: "Walking to work",
  toSheep: "Going to gather a sheep",
  herding: "Leading a sheep back to the pen",
  toPost: "Going to their post",
  posted: "At work",
  toHome: "Tired — going home",
  sleeping: "Asleep at home",
  fromHome: "Leaving home for work",
  toTavern: "Going to the tavern",
  buying: "Paying at the counter",
  sitting: "Resting at a seat",
  fromTavern: "Leaving the tavern",
  working: "Felling a tree",
  gathering: "Cutting & gathering fallen timber",
  hauling: "Carrying logs to storage",
  idle: "Resting from woodcutting",
  fromBuild: "Returning to the woodcutter hut",
  toBuild: "Going to a construction site",
  building: "Building a structure",
  walking: "On the road",
  seeking: "Seeking food & drink",
  toBegging: "Finding a place to ask for alms",
  begging: "Sitting beside the road, asking for alms",
  fromBegging: "Returning to the road",
  toAlms: "Approaching to give alms",
  givingAlms: "Giving alms",
  fromAlms: "Returning to the road",
  toPerformance: "Finding a place to play",
  performing: "Playing music beside the road",
  fromPerformance: "Continuing after a performance",
  toListen: "Gathering to hear the minstrel",
  listening: "Listening to music",
  fromListening: "Returning to the road",
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

export { GAME_DAY_SECONDS, formatGameTime } from "./calendar"

// --- Tuning ------------------------------------------------------------------
// Need rates are per game hour and read from the live balance below. A camp
// is a few hours' rest — watchable at the default day length.

export const CAMP_STAMINA_REGEN = 60
/** Tired travelers start looking for a pitch here, rather than walking to zero. */
export const CAMP_STAMINA_THRESHOLD = 20
/** Resting slows the need for food and drink but doesn't stop it. */
const CAMP_NEED_FACTOR = 0.5

export const FOOD_PRICE = 2
export const WINE_PRICE = 3
/** Top up near-empty needs, so each drink doesn't also become a half-full meal. */
const BUY_THRESHOLD = 10
/** Close enough to trade, in tiles; a parked stall serves a wider reach. */
const TRADE_RANGE = 1.2
const STALL_TRADE_RANGE = 2.6
/** Settlers knock off to sleep below this stamina, and rise again above it. */
const SETTLER_TIRED_AT = 25
const SETTLER_WAKE_AT = 95
/**
 * A household keeps its own hearth, bread and small beer: sleeping at home
 * restores a settler slowly and for nothing. The counter is the quick answer,
 * and the only one open to a traveler off the road — for coin.
 */
const HOME_MEAL_PER_HOUR = 30
const HOME_DRINK_PER_HOUR = 40
/** Rested and fed enough to go back to work. */
const SETTLER_FED_AT = 80
/** An exhausted traveler anchors to a stall or camp within this many tiles. */
const CAMP_JOIN_RADIUS = 10
/** On the road, on a track or hurrying away: the journey itself never tires anyone. */
const TRAVEL_ACTIVITIES: readonly Activity[] = ["walking", "seeking", "fleeing"]
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
  return (24 + ((id * 13 + cycle * 7) % 5)) * GAME_HOUR_SECONDS
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

function beggarWalkSeconds(id: number, cycle: number): number {
  return (0.5 + roll(id, cycle + 900)) * GAME_HOUR_SECONDS
}

function minstrelWalkSeconds(id: number, cycle: number): number {
  return (3 + ((id * 19 + cycle * 11) % 5)) * GAME_HOUR_SECONDS
}

/** Continuous time without coin before peasants and pilgrims fall into begging. */
export const BEGGAR_DELAY_SECONDS = GAME_DAY_SECONDS
export const BEGGAR_RECOVERY_GOLD = 15

export interface SimTraveler {
  partyId?: number
  partyWaiting?: boolean
  partySpeed?: number
  partyRiding?: boolean
  partyBoarding?: boolean
  /** Placed on the road by the company this step; the personal walking update stands aside. */
  partyCarried?: boolean
  partyVisitAborted?: boolean
  waterVisit?: WaterVisit
  waterRetry?: number
  /** A reversible progression; the original calling and personal attributes stay intact. */
  beggar?: boolean
  goldlessSeconds?: number
  roadShortcut?: WalkingShortcut
  shortcutCheck?: number
  /** Road-tile gate on looking ahead for a footprint blocking the road. */
  diversionCheck?: number
  diversionBuildings?: GameMap["buildings"]
  almsEncounters?: Record<number, number>
  almsVisit?: { beggarId: number; cycle: number; spot: WorldPoint }
  donationUntil?: number
  musicCooldown?: number
  musicVisit?: { performerId: number; cycle: number; spot: WorldPoint }
  /** Horse waits on a reserved verge beside a tree until its rider returns. */
  horseRest?: HorseRest & { progress: number; lane: number }
  workScale?: number
  workSlot?: number
  buildingTask?: BuildingTask
  constructionReturn?: import("./monk-wander").WanderSpot[]
  /** Prayer interrupts travel/work without discarding its route or reservations. */
  praying?: boolean
  /** Voluntary gift made on departure; zero is a valid donation. */
  admissionPaid: number
  keeperTime?: number
  customerVisit?: { vendorId: number; road: { x: number; y: number; z: number }; frontage: { x: number; y: number; z: number } }
  stallRoute?: StallRoute
  pasture?: PastureAnimal
  shrineParking?: ShrineParking
  marketParking?: MarketParking
  cartPose?: CartPose
  marketCheck?: number
  cartRouteBlocked?: { x: number; z: number; buildings: GameMap["buildings"] }
  /** Wagons use their own road clearance profile instead of pedestrian lanes. */
  convoy: boolean
  convoyScale: number

  id: number
  activity: Activity
  gold: number
  piety: number
  happiness: number
  hoursSinceChurch?: number
  jobless: boolean
  deliveryBuilding?: string | null
  employer: string | null
  herding?: HerdingTask
  herdingRetry?: number
  /** Which of the employer's work slots is theirs; posts are one per slot. */
  jobSlot: number
  /** The house they sleep in. Settlers move in when they take work. */
  home: string | null
  /** Bound repeated searches while passing inaccessible water. */
  naturalWaterRetry?: number
  naturalWaterVisit?: { heading: number; spot: WorldPoint; back: WorldPoint; route: WorldPoint[]; buildings: GameMap["buildings"] }
  seatRestRetry?: number
  /** A trip to a counter: where to pay, where to sit, and where to go after. */
  tavernVisit?: {
    plan: TavernPlan
    served: boolean
    meal?: boolean
    drink?: boolean
    /** Null returns them to their place on the road. */
    returnTo: WorldPoint | null
  }
  branchProgress: number
  shrineRoute: TilePos[] | null
  /** Reserved until the visitor has left the shrine approach. */
  shrineSeat?: string
  shrineQueueOrder?: number
  offeringProgress?: number
  offeringMade?: boolean
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
  /** Seconds left in the current timed activity. */
  timer: number
  /** Completed shop or performance cycles, feeding deterministic durations. */
  cycle: number
}

export interface SimState {
  parties: Map<number, TravelParty>
  wildlife?: WildlifeWorld | null
  footpaths: Footpaths
  procession?: RelicProcession | null
  shrineQueueSequence: number
  /** Scene publishes whether the keeper is at his station. Pure simulations start staffed. */
  shrineKeeperReady: boolean
  admissionSequence: number
  admissionPayments: AdmissionPayment[]
  seed: number
  travelers: Map<number, SimTraveler>
  joinedMonks: Map<number, Monk>
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
  /** Cumulative voluntary donations; the economy credits each payment once. */
  shrineGold: number
  /** Cumulative counter takings from the tavern and any kept market stall. */
  tradeGold: number
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
 * Bridge height follows the rendered ramp at the actual lane point; ground
 * routes retain their tile-centre interpolation.
 */
// Surface heights and bridge proximity per route vertex never change for a map;
// every walker samples them each step, so they are resolved once per vertex.
const routeSurfaces = new WeakMap<ReadonlyArray<{ x: number; z: number }>, { map: GameMap; heights: Float64Array; nearBridge: Uint8Array }>()
function routeSurface(map: GameMap, route: ReadonlyArray<{ x: number; z: number }>) {
  let cache = routeSurfaces.get(route)
  if (!cache || cache.map !== map) {
    cache = { map, heights: new Float64Array(route.length).fill(NaN), nearBridge: new Uint8Array(route.length) }
    routeSurfaces.set(route, cache)
  }
  return cache
}
function routeHeight(map: GameMap, route: ReadonlyArray<{ x: number; z: number }>, i: number, cache = routeSurface(map, route)): number {
  let height = cache.heights[i]
  if (Number.isNaN(height)) {
    height = cache.heights[i] = surfaceHeight(map, route[i].x, route[i].z)
    cache.nearBridge[i] = bridgeLayout(map).rise[route[i].z * map.width + route[i].x] > 0 ? 2 : 1
  }
  return height
}

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
  const surfaces = routeSurface(map, route)
  const ay = routeHeight(map, route, i0, surfaces)
  const by = routeHeight(map, route, i0 + 1, surfaces)
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
  let tx: number, tz: number
  if (curved) { tx = curved.x; tz = curved.z }
  else {
    const a = vertex(i0), b = vertex(i0 + 1)
    tx = a.x + (b.x - a.x) * frac; tz = a.z + (b.z - a.z) * frac
  }
  const x = tileToWorldX(map, tx), z = tileToWorldZ(map, tz)
  const nearBridge = surfaces.nearBridge[i0] === 2 || surfaces.nearBridge[i0 + 1] === 2
  const point = { x, z, y: nearBridge ? walkingSurface(map,x,z).height : ay + (by-ay)*frac }
  return point
}

function roadWorldPoint(map: GameMap, p: number, lane: number): WorldPoint {
  return routeWorldPoint(map, map.road!, p, lane)
}

/** Where someone stands when set down on the road at `progress`; wagons keep to the cart line. */
export function roadPosition(map: GameMap, t: Pick<Traveler, "type">, progress: number, lane: number): WorldPoint {
  const at = roadWorldPoint(map, progress, lane)
  if (t.type.id === "vendor") {
    Object.assign(at, convoyPoint(map, progress))
    at.y = walkingSurface(map, at.x, at.z).height
  }
  return at
}

/** A cut spends real walking distance while retaining the road's logical progress.
 * A straight chord and a detour bent around a footprint are walked the same way. */
function stepRoadShortcut(s: SimTraveler, map: GameMap, distance: number): void {
  const cut = s.roadShortcut!
  cut.distance = Math.min(cut.length, cut.distance + Math.max(0, distance))
  const t = cut.distance / cut.length
  const at = cut.via?.length ? routePoint([cut.from, ...cut.via, cut.to], cut.distance) : {
    x: cut.from.x + (cut.to.x - cut.from.x) * t,
    z: cut.from.z + (cut.to.z - cut.from.z) * t,
  }
  s.x = at.x
  s.z = at.z
  s.y = walkingSurface(map, s.x, s.z).height
  s.progress = cut.start + (cut.end - cut.start) * t
  if (cut.distance >= cut.length) {
    retireBypassedRoad(map, cut)
    s.roadShortcut = undefined
  }
}

/** Commit only a swept, building-free transport move. Pedestrian task state
 * cannot drag a wagon through a doorway, even during a large time step. */
function finishConvoyMove(s: SimTraveler, transportBefore: SimTraveler | null, map: GameMap, characterScale: number) {
  if (!transportBefore) return
  const length = map.road!.length - 1
  const puller = cartLoadout(s.id).puller, wheelbase = -cartOffset(puller) * characterScale
  const previous = transportBefore.cartPose ?? roadCartPose(map, transportBefore.progress, s.direction, wheelbase, characterScale)
  const wrapped = Math.abs(s.progress - transportBefore.progress) > length / 2 && !s.track && !transportBefore.track
  const parking = s.marketParking ?? s.shrineParking
  const cut = transportBefore.roadShortcut ?? s.roadShortcut
  let pose: CartPose | null
  if (wrapped) pose = roadCartPose(map, s.progress, s.direction, wheelbase, characterScale)
  else if (parking && !parking.walking) pose = parking.pose
  else if (cut) pose = driveRouteSegment(previous, [cut.from, ...(cut.via ?? []), cut.to],
    transportBefore.roadShortcut?.distance ?? 0, s.roadShortcut?.distance ?? cut.length, wheelbase,
    (p, heading) => convoyBuildingsClear(map, p, puller, characterScale, heading))
  else {
    pose = driveSegment(previous, s, wheelbase, (p, heading) => convoyBuildingsClear(map, p, puller, characterScale, heading))
    if (pose && !parking && !s.track && !s.roadShortcut && !transportBefore.roadShortcut &&
      ["walking", "seeking", "fleeing"].includes(s.activity)) {
      pose = roadCartPose(map, s.progress, s.direction, wheelbase, characterScale, previous)
    }
  }
  if (pose && convoyBuildingsClear(map, pose, puller, characterScale)) s.cartPose = { ...pose, distance: 0 }
  else {
    const check = s.diversionCheck, buildings = s.diversionBuildings
    Object.assign(s, transportBefore)
    s.moveSpeed = 0; s.diversionCheck = check; s.diversionBuildings = buildings
  }
}

/** Where on their route — road or track — the traveler currently belongs. */
function currentRoutePoint(map: GameMap, s: SimTraveler): WorldPoint {
  if (s.track) {
    const track = map.shortcuts![s.track.index]
    return routeWorldPoint(map, track.tiles, s.track.progress, s.lane, track)
  }
  const point = roadWorldPoint(map, s.progress, s.lane)
  if (!s.convoy) return point
  const cart = convoyPoint(map, s.progress, s.convoyScale)
  return { ...cart, y: walkingSurface(map, cart.x, cart.z).height }
}

/** Join the shrine's walking lanes to the traveler's road lane over the first tile. */
function shrineWorldPoint(map: GameMap, s: SimTraveler): WorldPoint {
  const site = map.site!
  const route = s.shrineRoute ?? site.branch
  if (s.shrineParking) {
    const point = routeWorldPoint(map, route, s.branchProgress, 0)
    if (s.branchProgress < 1) {
      const start = routeWorldPoint(map, route, 0, 0), park = s.shrineParking.parked.hitch
      point.x += (park.x - start.x) * (1 - s.branchProgress)
      point.z += (park.z - start.z) * (1 - s.branchProgress)
    }
    return point
  }
  // Leave the walking lane before reaching the grounds; cross gates centrally.
  const laneBlend = s.shrineRoute ? Math.max(0, Math.min(1, site.branch.length - 1 - s.branchProgress)) : 1
  // A departure before a blocked junction uses a routed approach around walls.
  // Keep that route centred; an offset lane can clip the inside of its bends.
  const diverted = route[0].x !== site.branch[0].x || route[0].z !== site.branch[0].z
  const lane = diverted ? 0 : s.lane * laneBlend
  const point = routeWorldPoint(map, route, s.branchProgress, lane)
  if (s.branchProgress < 1) {
    const start = routeWorldPoint(map, route, 0, lane)
    const roadLane = s.activity === "toRelic" ? s.branchEntryLane : s.direction * s.laneOffset
    const road = roadWorldPoint(map, s.progress, roadLane)
    const blend = 1 - s.branchProgress
    point.x += (road.x - start.x) * blend
    point.y += (road.y - start.y) * blend
    point.z += (road.z - start.z) * blend
  }
  return point
}

/** Nearby live obstacles and reservations are shared by shrine and market parking. */
function parkingContext(sim: SimState, s: SimTraveler, scale: number): ParkingContext {
  const nearby = (p: { x: number; z: number }) => Math.hypot(p.x - s.x, p.z - s.z) < 16 + scale * 4
  const trees: Array<{ tree: TreePlacement; index: number }> = []
  treeSpatialIndex(sim.trees).forEachWithin(s.x, s.z, 16 + scale * 4, (tree, index) => {
    if (!sim.felled.has(index) && !tree.walking) trees.push({ tree, index })
  })
  const obstacles: StallRoute["obstacles"] = [], people: SimTraveler[] = []
  const add = (items: NonNullable<ParkingContext["obstacles"]>) => { for (const obstacle of items) if (nearby(obstacle)) obstacles.push(obstacle) }
  for (const other of sim.travelers.values()) {
    if (other.id === s.id) continue
    if (nearby(other)) people.push(other)
    if (other.stallRoute) {
      add(other.stallRoute.obstacles)
      const puller = cartLoadout(other.id).puller
      if (puller !== "hand") add(convoyBounds(alignCart(other.stallRoute.park, other.stallRoute.heading, 0), puller, scale))
    }
    if (other.shrineParking) add(convoyBounds(other.shrineParking.parked, other.convoy ? cartLoadout(other.id).puller : "horse", scale))
    if (other.marketParking) add(convoyBounds(other.marketParking.parked, cartLoadout(other.id).puller, scale))
  }
  return { trees: trees.sort((a, b) => a.index - b.index).map(entry => entry.tree), obstacles, people }
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
    parties: new Map(),
    footpaths: map.footpaths ?? createFootpaths(map),
    shrineQueueSequence: 0,
    shrineKeeperReady: true,
    admissionSequence: 0,
    admissionPayments: [],
    seed: map.seed ?? 0,
    travelers: new Map(),
    time: START_TIME,
    danger: computeDangerField(map, threats),
    relic: { ...relic },
    world: map,
    joinedMonks: new Map(),
    shrineRenown: 0,
    balance: DEFAULT_BALANCE,
    visits: 0,
    wood: 0,
    shrineGold: 0,
    tradeGold: 0,
    constructionWood: 0,
    felled: new Set(),
    treeResources: new Map(),
    foodStores: new Map(),
    piles: new Map(),
    resourceRevision: 0,
    buildings: jobBuildings(map, true),
    trees: [],
  }
  if (!map.road || map.road.length < 2) return sim
  const length = map.road.length - 1
  for (const t of travelers) {
    const progress = t.offset * length
    // A separate, per-id stream preserves the cast and survives reordering.
    const laneRng = makeRng(deriveSeed(deriveSeed(map.seed ?? 0, SEED_STREAM.lanes), t.id))
    const laneOffset = t.type.id === "vendor" ? 0 : 0.18 + laneRng() * 0.1
    const lane = t.direction * laneOffset
    const at = roadPosition(map, t, progress, lane)
    sim.travelers.set(t.id, {
      admissionPaid: 0,
      convoy: t.type.id === "vendor",
      convoyScale: BASE_CHARACTER_SCALE,
      id: t.id,
      activity: "walking",
      gold: t.attributes.gold,
      piety: t.attributes.piety,
      happiness: t.attributes.happiness,
      jobless: t.attributes.jobless,
      employer: null,
      jobSlot: 0,
      home: null,
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
      timer: t.type.id === "vendor" ? vendWalkSeconds(t.id, 0) : t.type.id === "minstrel" ? minstrelWalkSeconds(t.id, 0) : 0,
      cycle: 0,
    })
  }
  syncTravelParties(sim.parties, travelers, sim.travelers)
  for (const party of sim.parties.values()) {
    const leader = sim.travelers.get(party.members[0])!
    const origin = leader.progress
    const slots = partySlots(party.id, false, length, party.members.length, sim.time * GAME_DAY_SECONDS)
    for (let slot = 0; slot < party.members.length; slot++) {
      const member = sim.travelers.get(party.members[slot])!
      const place = slots[slot]
      member.progress = ((origin - party.direction * place.behind) % length + length) % length
      member.direction = party.direction
      member.laneOffset = place.lane
      member.lane = party.direction * place.lane
      Object.assign(member, roadWorldPoint(map, member.progress, member.lane))
    }
    party.formed = true
  }
  for (const resident of townResidents(map)) {
    const actor = sim.travelers.get(resident.traveler.id)
    if (actor) placeResident(actor, map, resident)
  }
  return sim
}

/**
 * Nearest open tile to a world point: grass, dirt, or a forest-floor clearing —
 * never solid woods or the road itself.
 */
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
/** Activities that hold someone in place; their speed stays at zero. */
const STILL_ACTIVITIES: readonly Activity[] = ["offering", "working", "building", "browsing", "performing", "listening", "begging", "givingAlms",
  "openingShop", "packingShop", "vending", "idle", "posted", "sleeping", "buying", "sitting", "drinking", "drinkingLow"]

function startOffRoadWalk(s: SimTraveler, activity: Activity): void {
  s.walkFrom = { x: s.x, y: s.y, z: s.z }
  s.walkT = 0
  s.offRoadRoute = null
  s.activity = activity
  s.targetId = null
}

/** Reserve reachable open ground beside the road, keeping the performers and
 * their audience apart from each other, camps, and deployed stalls. */
function roadsideSpot(sim: SimState, s: SimTraveler, map: GameMap, reservations: RoadsideReservations, performer?: SimTraveler): WorldPoint | null {
  const anchor = performer ?? s
  const cx = worldToTileX(map, anchor.x), cz = worldToTileZ(map, anchor.z)
  const start = { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) }
  const candidates: WorldPoint[] = []
  const roads = performer ? [] : map.road!.filter(tile => Math.abs(tile.x - cx) <= 4 && Math.abs(tile.z - cz) <= 4)
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const x = cx + dx, z = cz + dz
    if (!["grass", "dirt", "clearing"].includes(tileAt(map, x, z) ?? "") || buildingAt(map, x, z)) continue
    const point = { x: tileToWorldX(map, x), y: surfaceHeight(map, x, z), z: tileToWorldZ(map, z) }
    const distance = Math.hypot(point.x - anchor.x, point.z - anchor.z)
    if (performer && (distance < 0.9 || distance > 2.3)) continue
    if (!performer && !roads.some(tile => (tile.x - x) ** 2 + (tile.z - z) ** 2 <= 4)) continue
    if (treeSpatialIndex(sim.trees).firstWithin(point.x, point.z, .8, (_, index) => !sim.felled.has(index))) continue
    if (reservations.occupied(point, s.id)) continue
    candidates.push(point)
  }
  candidates.sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))
  return candidates.find(point => settlementRoute(map, map.buildings, start,
    { x: worldToTileX(map, point.x), z: worldToTileZ(map, point.z) })) ?? null
}

function availableBeggar(sim: SimState, s: SimTraveler): SimTraveler | undefined {
  const visit = s.almsVisit, beggar = visit && sim.travelers.get(visit.beggarId)
  return beggar?.beggar && beggar.activity === "begging" && !beggar.praying && beggar.cycle === visit?.cycle ? beggar : undefined
}

function recoverFromBegging(s: SimTraveler): void {
  if (!s.beggar || s.gold < BEGGAR_RECOVERY_GOLD) return
  s.beggar = false
  s.goldlessSeconds = 0
  if (s.activity === "toBegging" || s.activity === "begging") {
    s.cycle++
    startOffRoadWalk(s, "fromBegging")
  }
}

function stepPoverty(s: SimTraveler, t: Traveler, dt: number): void {
  recoverFromBegging(s)
  if (s.beggar) return
  if (t.type.id !== "peasant" && t.type.id !== "pilgrim") return
  s.goldlessSeconds = s.gold > 0 ? 0 : (s.goldlessSeconds ?? 0) + Math.max(0, dt)
  if (s.goldlessSeconds >= BEGGAR_DELAY_SECONDS) {
    s.beggar = true
    // Do not overwrite a rest, work or visit timer. Begging starts back on the road.
    if (s.activity === "walking" || s.activity === "seeking") {
      s.activity = "walking"
      s.targetId = null
      s.timer = 0
    }
  }
}

function donate(sim: SimState, giver: SimTraveler, recipient: SimTraveler): void {
  if (giver.gold < 1) return
  pay(giver, recipient, 1)
  recipient.donationUntil = sim.time * GAME_DAY_SECONDS + 1.5
}

function finishPerformance(s: SimTraveler): void {
  s.cycle++
  startOffRoadWalk(s, "fromPerformance")
}

function availablePerformance(sim: SimState, s: SimTraveler): SimTraveler | undefined {
  const visit = s.musicVisit
  const performer = visit && sim.travelers.get(visit.performerId)
  return performer?.activity === "performing" && !performer.praying && performer.cycle === visit?.cycle ? performer : undefined
}

/** Keep the exact departure point and return route, including a track's lane. */
function startNaturalWaterTrip(s: SimTraveler, map: GameMap): boolean {
  if (s.thirst > WATER_THIRST_THRESHOLD || (s.naturalWaterRetry ?? 0) > 0) return false
  s.naturalWaterRetry = 2
  const stop = naturalWaterStop(map, s)
  if (!stop) return false
  const back = { x: s.x, y: s.y, z: s.z }
  const bank = stop.route.at(-2) ?? s
  s.naturalWaterVisit = { heading: Math.atan2(stop.spot.x - bank.x, stop.spot.z - bank.z), spot: stop.spot, back, route: [back, ...stop.route].reverse(), buildings: map.buildings }
  startOffRoadWalk(s, "toWater")
  s.offRoadRoute = stop.route
  return true
}

/** Camps and stalls use the same four-neighbour routing as settlement work. */
function stepOffRoadWalk(
  s: SimTraveler,
  to: WorldPoint,
  worldSpeed: number,
  dt: number,
  map: GameMap,
): boolean {
  if (!s.offRoadRoute && s.convoy && !s.shrineParking?.walking) {
    if (s.cartRouteBlocked?.x === to.x && s.cartRouteBlocked.z === to.z && s.cartRouteBlocked.buildings === map.buildings) return false
    const puller = cartLoadout(s.id).puller, scale = s.convoyScale
    const initial = s.cartPose ?? roadCartPose(map, s.progress, s.direction, -cartOffset(puller) * scale, scale)
    const drive = cartPath(map, initial, to, puller, scale, { trees: [] })
    if (!drive) { s.cartRouteBlocked = { ...to, buildings: map.buildings }; return false }
    s.cartRouteBlocked = undefined
    s.offRoadRoute = drive.entry.slice(1).map(p => ({ ...p, y: walkingSurface(map, p.x, p.z).height }))
  }
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
    // Render the corner before continuing, so a frame cannot cut across furniture.
    if (length > 1e-6 && s.offRoadRoute.length && (s.activity === "toTavern" || s.activity === "fromTavern")) return false
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
  return { type: s.beggar ? "beggar" : t.type.id, piety: s.piety, stamina: s.stamina }
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
  if (paid > 0) vendor.goldlessSeconds = 0
  recoverFromBegging(vendor)
}

function staffOf(sim: SimState, buildingId: string): SimTraveler[] {
  return [...sim.travelers.values()].filter(worker => worker.employer === buildingId)
}

/** The lowest work slot nobody holds, or null when the place is fully manned. */
function openSlot(sim: SimState, building: PlacedBuilding): number | null {
  const taken = new Set(staffOf(sim, building.id).map(worker => worker.jobSlot))
  for (let slot = 0; slot < BUILDING_KINDS[building.kind].jobs; slot++) if (!taken.has(slot)) return slot
  return null
}

/** Unskilled applicants can fill any open slot; only a vendor keeps a stall. */
function findJob(sim: SimState, s: SimTraveler, map: GameMap): { building: PlacedBuilding; slot: number } | undefined {
  if (!s.jobless || s.employer) return undefined
  for (const building of sim.buildings) {
    if (building.owner === "independent") continue
    const def = BUILDING_KINDS[building.kind]
    if (def.vendorKept) continue
    const slot = openSlot(sim, building)
    if (slot === null) continue
    if (def.workRadius > 0) {
      const centre = buildingCentre(map, building)
      if (!sim.trees.some((tree, index) => (sim.treeResources.get(index)?.remainingWood ?? 1) > 0 &&
        Math.hypot(tree.x - centre.x, tree.z - centre.z) <= def.workRadius)) continue
    }
    return { building, slot }
  }
  return undefined
}

/** Sleeping places actually built into the house; the artwork sets the capacity. */
const houseBeds = housingBeds

/** A new settler moves into the nearest house that still has a bed to spare. */
function findHome(sim: SimState, s: SimTraveler, map: GameMap, beds = 1): string | null {
  const houses = map.buildings.filter(b => b.owner !== "independent" && isHouse(b) && isComplete(b))
    .sort((a, b) => Math.hypot(tileToWorldX(map, a.x) - s.x, tileToWorldZ(map, a.z) - s.z)
      - Math.hypot(tileToWorldX(map, b.x) - s.x, tileToWorldZ(map, b.z) - s.z))
  for (const house of houses) {
    if ([...sim.travelers.values()].filter(other => other.home === house.id).length + beds <= houseBeds(house)) return house.id
  }
  return null
}

/** Housemates take the beds in a settled order, so two never share one. */
function homeBedSlot(sim: SimState, s: SimTraveler): number {
  const housemates = [...sim.travelers.values()].filter(other => other.home === s.home)
    .map(other => other.id).sort((a, b) => a - b)
  return Math.max(0, housemates.indexOf(s.id))
}

/** Complete counters with a keeper working, including patrols inside a tavern. */
function openCounters(sim: SimState, map: GameMap) {
  const staffed = new Set<string>()
  for (const worker of sim.travelers.values()) if (worker.employer !== null && (worker.activity === "posted" ||
    (worker.activity === "toPost" && worker.buildingTask?.purpose === "work" && map.buildings.some(b =>
      b.id === worker.employer && b.buildType === "tavern" &&
      worker.x >= tileToWorldX(map, b.x) - .5 && worker.x < tileToWorldX(map, b.x) + b.w - .5 &&
      worker.z >= tileToWorldZ(map, b.z) - .5 && worker.z < tileToWorldZ(map, b.z) + b.d - .5)))) staffed.add(worker.employer)
  return servingHouses(map, building => staffed.has(building.id))
}

/** Walk a pre-planned tile route, keeping the off-road walker's tile alignment. */
function routeWalk(s: SimTraveler, map: GameMap, route: readonly TilePos[], to: WorldPoint): void {
  const points = route.map(p => ({ x: tileToWorldX(map, p.x), y: surfaceHeight(map, p.x, p.z), z: tileToWorldZ(map, p.z) }))
  s.walkFrom = { x: s.x, y: s.y, z: s.z }
  s.walkT = 0
  s.targetId = null
  s.offRoadRoute = [{ x: points[0].x, y: s.y, z: s.z }, ...points, { ...to }]
}

/**
 * Set out for the nearest reachable counter. `returnTo` is where they
 * belong afterwards — a settler's workplace, or null for their place on the road.
 */
function startTavernTrip(sim: SimState, s: SimTraveler, map: GameMap,
  counters: readonly { id: string; x: number; z: number; w: number; d: number }[], returnTo: WorldPoint | null): boolean {
  if (!counters.length || !((s.hunger < SERVING_THRESHOLD && s.gold >= MEAL_PRICE)
    || ((s.thirst < SERVING_THRESHOLD || s.happiness < HAPPINESS_THRESHOLD) && s.gold >= DRINK_PRICE))) return false
  const from = { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) }
  const occupied = new Set([...sim.travelers.values()].flatMap(other => other.tavernVisit?.plan.seat
    ? [`${other.tavernVisit.plan.buildingId}:${other.tavernVisit.plan.seat.id}`] : []))
  const nearest = [...counters].sort((a, b) => Math.hypot(tileToWorldX(map, a.x) - s.x, tileToWorldZ(map, a.z) - s.z)
    - Math.hypot(tileToWorldX(map, b.x) - s.x, tileToWorldZ(map, b.z) - s.z))
  for (const house of nearest) {
    const building = map.buildings.find(b => b.id === house.id)
    const physicalNeed = (s.hunger < SERVING_THRESHOLD && s.gold >= MEAL_PRICE)
      || (s.thirst < SERVING_THRESHOLD && s.gold >= DRINK_PRICE)
    if (!physicalNeed && building?.buildType !== "tavern") continue
    const plan = building && tavernVisitPlan(map, building, from, occupied, s)
    if (!plan) continue
    s.tavernVisit = { plan, served: false, returnTo }
    s.walkFrom = { x: s.x, y: s.y, z: s.z }; s.walkT = 0; s.targetId = null
    s.offRoadRoute = [...plan.route, plan.counter.point]
    s.activity = "toTavern"
    return true
  }
  return false
}

/** Reserve the furniture while walking there, resting, and leaving. */
function startSeatRest(sim: SimState, s: SimTraveler, map: GameMap, returnTo: WorldPoint | null): boolean {
  if (s.stamina > SEAT_REST_THRESHOLD || s.visitCooldown > 0 || (s.seatRestRetry ?? 0) > 0) return false
  s.seatRestRetry = 5
  const occupied = new Set([...sim.travelers.values()].flatMap(other => other.tavernVisit?.plan.seat
    ? [`${other.tavernVisit.plan.buildingId}:${other.tavernVisit.plan.seat.id}`] : []))
  const nearby = map.buildings.filter(b => ["tavern", "house", "shelter", "monk-shelter", "hall"].includes(b.buildType ?? "") &&
    Math.hypot(tileToWorldX(map, b.x) - s.x, tileToWorldZ(map, b.z) - s.z) < 6)
    .sort((a, b) => Math.hypot(tileToWorldX(map, a.x) - s.x, tileToWorldZ(map, a.z) - s.z)
      - Math.hypot(tileToWorldX(map, b.x) - s.x, tileToWorldZ(map, b.z) - s.z))
  if (!nearby.length) return false
  for (const building of nearby) {
    const plan = seatRestPlan(map, building, s, occupied)
    if (!plan) continue
    s.tavernVisit = { plan, served: true, returnTo }
    s.walkFrom = { x: s.x, y: s.y, z: s.z }; s.walkT = 0; s.targetId = null
    s.offRoadRoute = plan.route
    s.activity = "toTavern"
    return true
  }
  return false
}

/** Thirsty pedestrians reserve one source; failed searches retry on a bounded timer. */
function startWaterTrip(sim: SimState, s: SimTraveler, map: GameMap,
  sources: readonly import("./map/types").BuildingDef[], back: WorldPoint): boolean {
  if (s.thirst >= WATER_SEEK_THRESHOLD || s.waterRetry || s.convoy || s.carrying > 0 || !sources.length) return false
  s.waterRetry = 5
  const reserved = new Set([...sim.travelers.values()].flatMap(other =>
    other.waterVisit && (other.activity !== "fromWater" || !other.waterVisit.exitCleared) ? [other.waterVisit.sourceId] : []))
  const nearby = sources.filter(b => !reserved.has(b.id) && Math.hypot(buildingCentre(map, b).x - s.x, buildingCentre(map, b).z - s.z) <= WATER_SEEK_RADIUS)
    .sort((a, b) => Math.hypot(buildingCentre(map, a).x - s.x, buildingCentre(map, a).z - s.z)
      - Math.hypot(buildingCentre(map, b).x - s.x, buildingCentre(map, b).z - s.z) || a.id.localeCompare(b.id))
  for (const source of nearby) {
    const plan = waterVisitPlan(map, source, s, back)
    if (!plan) continue
    if (s.activity === "toRelic" || s.activity === "fromRelic") plan.visit.resumeActivity = s.activity
    s.waterVisit = plan.visit; s.offRoadRoute = plan.route; s.walkT = 0; s.targetId = null
    s.activity = "toWater"
    return true
  }
  return false
}

function leaveWater(s: SimTraveler) {
  // Retrace the clear strip before asking the ordinary router to return home.
  const visit = s.waterVisit
  if (visit && ["drinking", "drinkingLow"].includes(s.activity)) s.offRoadRoute = [...visit.approach].reverse()
  else if (visit && s.activity === "toWater" && s.offRoadRoute && s.offRoadRoute.length <= visit.approach.length) {
    // Already inside the reserved front strip: leave along its clear segments,
    // instead of asking the tile router to start inside a closed footprint.
    s.offRoadRoute = s.offRoadRoute.length === 1 ? [visit.approach[1], visit.approach[0]] : [visit.approach[0]]
  } else s.offRoadRoute = null
  s.activity = "fromWater"
}

/** Only player counters credit the settlement; independent towns keep their takings. */
function buyRefreshment(sim: SimState, s: SimTraveler, map: GameMap): void {
  const independent = map.buildings.find(b => b.id === s.tavernVisit?.plan.buildingId)?.owner === "independent"
  const take = (price: number) => {
    s.gold -= price
    if (!independent) sim.tradeGold += price
  }
  const socialDrink = !!s.tavernVisit?.plan.seat && s.happiness < HAPPINESS_THRESHOLD
  let purchased = false
  // When coin cannot cover both, answer the most urgent need first.
  const needs = s.thirst <= s.hunger ? ["thirst", "hunger"] as const : ["hunger", "thirst"] as const
  for (const need of needs) {
    const price = need === "thirst" ? DRINK_PRICE : MEAL_PRICE
    if (s[need] < SERVING_THRESHOLD && s.gold >= price) {
      take(price); s[need] = 100; purchased = true
      if (s.tavernVisit) s.tavernVisit[need === "hunger" ? "meal" : "drink"] = true
    }
  }
  if (!purchased && socialDrink && s.gold >= DRINK_PRICE) {
    take(DRINK_PRICE); s.thirst = 100
    if (s.tavernVisit) s.tavernVisit.drink = true
  }
}

/** A settler's own doorstep: where they wait for work between errands. */
function workplaceReturn(sim: SimState, s: SimTraveler, map: GameMap): WorldPoint | null {
  const workplace = sim.buildings.find(b => b.id === s.employer)
  if (!workplace) return null
  const entry = buildingEntry(workplace)
  return { x: tileToWorldX(map, entry.x), y: surfaceHeight(map, entry.x, entry.z), z: tileToWorldZ(map, entry.z) }
}

/** Rest and meals return settlers to work and passing travelers to their journey. */
function finishErrand(s: SimTraveler): void {
  s.walkFrom = null
  s.offRoadRoute = null
  s.diversionCheck = undefined
  s.activity = s.employer || s.home ? "idle" : "walking"
  if (s.employer || s.home) s.timer = GAME_HOUR_SECONDS
}

function finishWaterTrip(s: SimTraveler): void {
  const resume = s.waterVisit?.resumeActivity
  s.waterVisit = undefined
  s.waterRetry = 5
  finishErrand(s)
  if (resume) s.activity = resume
}

/** Head back out of the door to the road, or to the work they left. */
function leaveTavern(s: SimTraveler, map: GameMap, back: WorldPoint): void {
  const fine = tavernWalkingRoute(map, s, back)
  if (fine !== undefined) {
    if (!fine) return
    s.offRoadRoute = fine
  } else {
    const route = settlementRoute(map, map.buildings, { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) },
      { x: worldToTileX(map, back.x), z: worldToTileZ(map, back.z) }, false, true)
    if (!route) return
    routeWalk(s, map, route, back)
  }
  s.activity = "fromTavern"
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

function finishVisit(sim: SimState, s: SimTraveler, map: GameMap): void {
  const exit = shrineExitPlan(map, { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) }, s.shrineRoute ?? map.site!.branch)
  if (!exit) return
  s.hoursSinceChurch = 0
  s.visits++
  sim.visits++
  s.piety = Math.min(100, s.piety + 4 + sim.relic.sanctity / 25)
  s.shrineRoute = exit.route
  s.branchProgress = exit.route.length - 1
  s.offeringProgress = exit.offeringProgress
  s.activity = "fromRelic"
}

function settleAfterVisit(sim: SimState, s: SimTraveler, t: Traveler, map: GameMap,
  travelers: readonly Traveler[] = [], householdHome?: string): void {
  if (!householdHome && t.party?.partnerId !== undefined && s.partyId !== undefined) {
    const partner = sim.travelers.get(t.party.partnerId)
    const identity = travelers.find(other => other.id === t.party!.partnerId)
    const party = sim.parties.get(s.partyId)
    if (!partner || !identity || partner.activity !== "walking" || partner.partyVisitAborted ||
      !party?.visitStarted.includes(partner.id)) return
    const home = findHome(sim, s, map, 2)
    const house = map.buildings.find(b => b.id === home)
    if (!home || !house || ![s, partner].every(person => settlementRoute(map, map.buildings,
      { x: worldToTileX(map, person.x), z: worldToTileZ(map, person.z) }, buildingEntry(house), false, true))) return
    // Check both people's opportunities; either partner can get the first job.
    for (const [applicant, person, companion] of [[s, t, partner], [partner, identity, s]] as const) {
      settleAfterVisit(sim, applicant, person, map, travelers, home)
      if (!applicant.employer) continue
      companion.home = home; companion.jobless = true; companion.activity = "idle"; companion.timer = 0
      for (const member of [applicant, companion]) { member.partyId = undefined; member.partyWaiting = false; member.partySpeed = undefined }
      return
    }
    return
  }
  if (t.type.id === "friar") {
    const bed = vacantMonkBed(map, sim.joinedMonks.values())
    if (bed && nextRoll(s) < MONK_JOIN_CHANCE) {
      sim.joinedMonks.set(t.id, {
        id: MONK_COUNT + t.id, name: t.name, duty: "Brother of the enclave",
        complexion: travelerAppearance(map.seed ?? 0, t.id).complexion,
        attributes: { age: t.attributes.age, piety: s.piety, happiness: s.happiness, skills: [...t.attributes.skills] },
        home: bed.home, bedSlot: bed.slot,
        arrival: { x: s.x, y: s.y, z: s.z, stamina: s.stamina },
      })
      s.shrineSeat = undefined
      s.moveSpeed = 0
      sim.travelers.delete(t.id)
      return
    }
    return
  }
  const home = householdHome ?? s.home ?? findHome(sim, s, map)
  const job = s.shrineParking || !home ? undefined : findJob(sim, s, map)
  if (job && nextRoll(s) < (t.attributes.skills.some((skill) => BUILDING_KINDS[job.building.kind].trades.includes(skill)) ? 0.9 : 0.65)) {
    const route = settlementRoute(map, [...map.buildings, ...sim.buildings],
      { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) },
      buildingEntry(job.building), false, true, s.shrineSeat)
    if (route) {
      s.employer = job.building.id
      s.jobSlot = job.slot
      s.shrineSeat = undefined
      s.jobless = false
      s.home = home
      startWorkRoute(s, route, "hauling")
      return
    }
  }
}

/** Formation places within this much of their target count as taken. */
const FORMATION_TOLERANCE = .05
/** Bound each person's camp or seat route; a stranded companion keeps the company on the road. */
const PARTY_ROUTE_LIMIT = 1500

// Identities keyed by ID, reused across steps while the cast is unchanged.
const identityIndexes = new WeakMap<readonly Traveler[], Map<number, Traveler>>()
const syncedCasts = new WeakSet<readonly Traveler[]>()
function travelerIdentities(travelers: readonly Traveler[]): Map<number, Traveler> {
  let index = identityIndexes.get(travelers)
  if (!index) { index = new Map(travelers.map(t => [t.id, t])); identityIndexes.set(travelers, index) }
  return index
}

/** Road progress to a world point on the company's shared path: the road lane, or
 * the shared detour while the road ahead is covered by a footprint. */
function partyPathPoint(map: GameMap, party: TravelParty, progress: number, lane: number, length: number): WorldPoint {
  const cut = party.diversion
  if (cut) {
    const span = party.direction * (cut.end - cut.start)
    const t = span > 0 ? party.direction * partyRoadDelta(progress, cut.start, length) / span : -1
    if (t >= 0 && t <= 1) {
      const at = routePoint(diversionPoints(cut), t * cut.length)
      return { x: at.x, y: walkingSurface(map, at.x, at.z).height, z: at.z }
    }
  }
  return roadWorldPoint(map, progress, lane)
}

/** Collapse before the head reaches a bridge; expand once the tail has cleared it. */
function bridgeInColumn(map: GameMap, head: number, direction: 1 | -1, span: number, length: number): boolean {
  for (let d = -Math.ceil(span) - 2; d <= 5; d++) {
    const p = map.road![Math.round(((head + direction * d) % length + length) % length)]
    if (p && tileAt(map, p.x, p.z) === "bridge") return true
  }
  return false
}

/** The slowest walker or animal sets the pace; riders rest. Members are re-read a
 * few times per game second; the eased company speed hides the steps. */
function companyPace(party: TravelParty, members: readonly SimTraveler[], naturalSpeed: (s: SimTraveler) => number, scale: number, seconds = -Infinity): number {
  if (seconds - party.paceAt < .25) return party.pace
  let pace = Infinity
  for (const s of members) if (!s.partyRiding) pace = Math.min(pace, naturalSpeed(s))
  if (party.transport) pace = Math.min(pace, animalWalkSpeed(party.transport.animal, scale))
  for (const pack of party.packs ?? []) pace = Math.min(pace, animalWalkSpeed(pack.kind, scale))
  party.pace = Number.isFinite(pace) ? pace * .85 : 0
  party.paceAt = seconds
  return party.pace
}

/** Shared decisions and shared movement run before the personal update. A company
 * has one path and one pace: only the head's road progress moves, and every
 * walker, rider, wagon and pack animal takes its place from it. Visits,
 * boarding and regrouping after a stop still walk each person through the
 * existing individual systems, with bounded route planning. */
function stepTravelParties(sim: SimState, travelers: Traveler[], map: GameMap, dt: number,
  counters: ReturnType<typeof openCounters>, naturalSpeed: (s: SimTraveler) => number, characterScale: number, movement: MovementTuning) {
  // The game adds its cast to an empty simulation and restores saves after
  // creation, so companies are formed once per cast here, not only in createSim.
  if (!syncedCasts.has(travelers)) { syncedCasts.add(travelers); syncTravelParties(sim.parties, travelers, sim.travelers) }
  pruneTravelParties(sim.parties, sim.travelers, sim.joinedMonks)
  if (dt <= 0) return
  const identities = travelerIdentities(travelers)
  const length = map.road!.length - 1
  const seconds = sim.time * GAME_DAY_SECONDS
  const wrap = (p: number) => ((p % length) + length) % length
  // Standing on the road for the company this step: no personal errands, no movement.
  const hold = (s: SimTraveler) => { s.partyWaiting = true; s.partyCarried = true; s.partySpeed = 0 }
  // Vendors at their stalls, read once and only when a camping company is hungry.
  let vending: SimTraveler[] | undefined
  for (const party of sim.parties.values()) {
    const members: SimTraveler[] = []
    for (const id of party.members) { const s = sim.travelers.get(id); if (s) members.push(s) }
    if (!members.length) continue
    party.cooldown = Math.max(0, party.cooldown - dt)
    party.retry = Math.max(0, party.retry - dt)
    party.elapsed += dt
    party.carried = 0
    for (const s of members) { s.partyCarried = false; s.partyWaiting = false; s.partySpeed = 0 }
    sharePartyNeeds(party, members, sim.balance.rules.hungerDecay, sim.balance.rules.thirstDecay, 1, dt / GAME_HOUR_SECONDS)
    if (!party.transportInitialized) {
      ensurePartyTransport(party, members, map, characterScale)
      // A wagon or pack animal changes everyone's place; walk into the new formation.
      if (party.transport || party.packs?.length) party.formed = false
    }
    const cart = party.transport
    if (cart) {
      cart.distance = cart.animalDistance = 0
      cart.retry = Math.max(0, cart.retry - dt)
      if (cart.seats.some(id => !party.members.includes(id))) cart.seats = cart.seats.filter(id => party.members.includes(id))
      if (!cart.seats.length) cart.seats = [members[0].id]
      if (cart.phase === "parking" || cart.phase === "leaving") {
        const parking = cart.phase === "parking"
        for (const s of members) hold(s)
        const done = movePartyCart(party, map, characterScale, companyPace(party, members, naturalSpeed, characterScale), dt)
        seatParty(party, members, characterScale)
        if (done && parking) for (const s of members) s.partyRiding = false
        if (done && !parking) regroupParty(party, members, length, seconds, characterScale)
        continue
      }
      if (cart.phase === "parked" && cart.intent) {
        party.stage = "visiting"; party.elapsed = 0; party.retry = 0
        party.visitPending = [...party.members]; party.visitStarted = []; cart.intent = undefined
      }
      if ((cart.phase === "parked" && !cart.intent && party.stage === "traveling") || cart.phase === "boarding") {
        if (cart.phase === "parked" && party.retry <= 0) {
          party.retry = 4
          const plans = cart.seats.map((id, seat) => {
            const s = sim.travelers.get(id)!, target = seatPoint(seat, cart.pose, characterScale)
            const route = settlementRoute(map, map.buildings, { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) },
              { x: worldToTileX(map, target.x), z: worldToTileZ(map, target.z) }, false, false, undefined, PARTY_ROUTE_LIMIT)
            return { s, target: { ...target, y: walkingSurface(map, target.x, target.z).height }, route }
          })
          if (plans.every(p => p.route)) {
            for (const p of plans) { routeWalk(p.s, map, p.route!, p.target); p.s.partyBoarding = true }
            cart.phase = "boarding"
          }
        }
        for (const s of members) hold(s)
        if (cart.phase === "boarding") {
          for (const [seat, id] of cart.seats.entries()) {
            const s = sim.travelers.get(id)!
            if (!s.partyBoarding) continue
            const target = seatPoint(seat, cart.pose, characterScale)
            if (stepOffRoadWalk(s, { ...target, y: walkingSurface(map, target.x, target.z).height }, naturalSpeed(s), dt, map)) {
              s.partyBoarding = false; s.partyRiding = true; s.offRoadRoute = null; s.walkFrom = null
            }
          }
          seatParty(party, members, characterScale)
          if (cart.seats.every(id => sim.travelers.get(id)!.partyRiding)) { cart.phase = "leaving"; cart.parking!.distance = 0 }
        }
        party.reason = "Waiting for companions to board"
        continue
      }
    }
    if (party.stage === "visiting") {
      if (party.visitPending.some(id => !party.members.includes(id))) party.visitPending = party.visitPending.filter(id => party.members.includes(id))
      // Admission is asked for a few companions at a time; every attempt plans
      // real routes, so a large company files in over several seconds.
      if (party.retry <= 0 && party.visitPending.length) {
        party.retry = 2
        for (const id of party.visitPending.slice(0, 3)) {
          const s = sim.travelers.get(id)!
          if (tryRoadVisit(sim, s, identities.get(id)!, map, counters, s.direction, s.progress, characterScale,
            { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) }, true)) {
            party.visitPending = party.visitPending.filter(other => other !== id)
            party.visitStarted.push(id)
            party.elapsed = 0
          }
        }
      }
      // A closed or saturated enclave cannot keep unadmitted companions forever.
      if (party.elapsed > 120) {
        party.visitPending = []
        // A missing keeper must not strand a party inside the queue. Walk back
        // along the already validated arrival route, without counting a visit.
        for (const s of members) if (s.shrineRoute && ["toRelic", "visiting"].includes(s.activity)) {
          s.activity = "fromRelic"; s.offeringMade = true; s.offeringProgress = undefined; s.partyVisitAborted = true
        }
      }
      for (const s of members) if (s.activity === "walking") hold(s)
      if (!party.visitPending.length && members.every(s => s.activity === "walking")) {
        const considered = new Set<number>()
        for (const s of members) {
          if (considered.has(s.id) || s.home || s.employer || s.partyVisitAborted || !party.visitStarted.includes(s.id)) continue
          const t = identities.get(s.id)!
          considered.add(s.id)
          if (t.party?.partnerId !== undefined) considered.add(t.party.partnerId)
          settleAfterVisit(sim, s, t, map, travelers)
        }
        // Recruitment may convert a traveler to a monk or admit a household.
        syncTravelParties(sim.parties, travelers, sim.travelers)
        if (!sim.parties.has(party.id)) continue
        party.stage = "traveling"; party.cooldown = 45; party.elapsed = 0
        party.reason = "Regrouping after the visit"
        for (const s of members) { s.visitCooldown = 45; s.partyWaiting = false }
        regroupParty(party, members.filter(s => s.partyId === party.id), length, seconds, characterScale)
        continue
      } else { party.reason = party.visitPending.length ? "Waiting for room at the enclave" : "Waiting for companions to finish visiting"; continue }
    }
    const onRoad = members.every(s => s.partyRiding || (s.activity === "walking" && !s.roadShortcut && !s.track))
    if (!onRoad) {
      // Someone was drawn aside by another system; the rest stand and wait.
      for (const s of members) if (s.activity === "walking") hold(s)
      party.reason = "Regrouping with companions"
      continue
    }
    const head = members[0]
    const ahead = map.site ? party.direction * partyRoadDelta(map.site.junction, party.progress, length) : Infinity
    if (party.formed && party.cooldown <= 0 && ahead >= 0 && ahead <= 7) {
      party.cooldown = 45; party.decisions++
      const renown = sim.shrineRenown + sim.visits * sim.balance.rules.visitRenown
      const chance = members.reduce((sum, s) => sum + visitChance({ ...identities.get(s.id)!.attributes,
        piety: s.piety, hunger: counters.length ? s.hunger : 100, thirst: counters.length ? s.thirst : 100, stamina: s.stamina },
        sim.relic, renown, sim.balance, 0, identities.get(s.id)!.type.id), 0) / members.length
      const rng = makeRng(deriveSeed(sim.seed ^ party.id, 0x56495349 + party.decisions))
      const persuaded = chance + (1 - chance) * roadsideEvangelism(map)
      if (rng() < persuaded) {
        if (cart && cart.phase === "road") {
          const occupied = [...sim.parties.values()].filter(p => p.id !== party.id && p.transport).map(p => p.transport!.pose)
          const driver = members.find(s => s.id === cart.seats[0]) ?? head
          // Companions walking behind the wagon are not obstacles to its own parking.
          const context = parkingContext(sim, driver, characterScale)
          context.people = context.people?.filter(person => !party.members.includes((person as { id?: number }).id ?? -1))
          if (!parkParty(party, map, characterScale, context, occupied, "visit")) party.cooldown = 8
          for (const s of members) hold(s)
          continue
        }
        party.stage = "visiting"; party.elapsed = 0; party.retry = 0
        party.visitPending = [...party.members]; party.visitStarted = []
        party.reason = "Visiting the enclave together"
        for (const s of members) hold(s)
        continue
      }
    }
    // --- Shared movement: the head advances, everyone else derives from it. ---
    // Riders take no place in the column; the wagon's driver stands for its head.
    const column = cart ? [members.find(s => s.id === cart.seats[0]) ?? head, ...members.filter(s => !s.partyRiding && s.id !== cart.seats[0])] : members
    const slots = cachedFormation(party, column.map(s => s.id), length, seconds, characterScale)
    const span = slots[slots.length - 1].behind
    // After a stop the head waits while anyone is behind their place, then
    // advances past those standing ahead of theirs, until everyone is in formation.
    let lagging = false, passing = false
    if (!party.formed) {
      for (let i = 0; i < column.length; i++) {
        if (column[i].partyRiding) continue
        const gap = party.direction * partyRoadDelta(wrap(party.progress - party.direction * slots[i].behind), column[i].progress, length)
        if (gap > FORMATION_TOLERANCE) lagging = true
        else if (gap < -FORMATION_TOLERANCE) passing = true
      }
      if (!lagging && !passing) party.formed = true
    }
    const tail = column[column.length - 1]
    const paused = nearProcession(sim.procession, head, false) || nearProcession(sim.procession, tail, false)
    const target = paused || lagging ? 0 : companyPace(party, members, naturalSpeed, characterScale, seconds)
    party.speed = easeSpeed(party.speed, target, dt, movement.acceleration)
    if (party.speed < 1e-6) party.speed = 0
    let blocked = false
    if (cart) {
      if (party.speed > 0 && !movePartyCart(party, map, characterScale, party.speed, dt)) { blocked = true; party.speed = 0 }
      party.progress = cart.progress
    } else party.progress = wrap(party.progress + party.direction * party.speed * dt)
    // Once per road tile: trouble for the head, bridges along the column, and a
    // footprint covering the road ahead, which the whole company walks around.
    const tile = Math.floor(party.progress)
    if (tile !== party.headTile) {
      party.headTile = tile
      if (!party.diversion && map.road![tile]) meetTrouble(sim, head, identities.get(head.id)!, map, map.road![tile])
      if (head.activity === "fleeing") {
        // The old tail leads the way back; a wagon turns where it stands.
        head.activity = "walking"; head.fleeTimer = 0
        const previous = party.direction
        party.direction = head.direction
        for (const s of members) s.direction = party.direction
        party.progress = cart ? cart.progress : wrap(party.progress - previous * span)
        party.formed = false; party.speed = 0; party.diversion = undefined
        party.headTile = Math.floor(party.progress)
        turnPartyCart(party, map, characterScale)
        party.reason = "Turning back together"
      }
      party.singleFile = bridgeInColumn(map, party.progress, party.direction, span, length)
      if (!party.diversion) party.diversion = findRoadDiversion(map, blockedRoad(map), head, party.progress, party.direction,
        p => roadWorldPoint(map, p, 0)) ?? undefined
    }
    const direction = party.direction, travel = party.speed * dt
    for (const s of members) if (s.partyRiding) { s.partyCarried = true; s.partySpeed = party.speed; party.carried++ }
    for (let i = 0; i < column.length; i++) {
      const s = column[i]
      if (s.partyRiding) continue
      s.partyCarried = true; party.carried++
      const place = wrap(party.progress - direction * slots[i].behind)
      let moved = 0
      if (party.formed) { moved = Math.abs(partyRoadDelta(place, s.progress, length)); s.progress = place }
      else {
        const gap = direction * partyRoadDelta(place, s.progress, length)
        if (gap > 0) { moved = Math.min(gap, naturalSpeed(s) * dt); s.progress = gap - moved <= 1e-9 ? place : wrap(s.progress + direction * moved) }
      }
      s.direction = direction
      s.laneOffset = slots[i].lane
      stepLane(s, direction, Math.max(moved, travel))
      s.partySpeed = moved / dt
      s.partyWaiting = !party.formed && moved <= 1e-9
      const at = partyPathPoint(map, party, s.progress, s.lane, length)
      s.x = at.x; s.y = at.y; s.z = at.z
    }
    if (cart) seatParty(party, members, characterScale)
    stepPartyPacks(party, sim.travelers, map, characterScale, dt)
    // The detour is over once the last walker has rejoined the road behind it.
    if (party.diversion && direction * partyRoadDelta(wrap(party.progress - direction * span), party.diversion.end, length) >= 0) party.diversion = undefined
    party.reason = blocked ? "Waiting for the road to clear" : party.formed ? "Traveling together" : "Regrouping with companions"
  }
}

// Reuse position snapshots instead of allocating several objects and Map entries
// per traveler and simulation tick. Paths only read the scratch point.
const tickPositions = new WeakMap<SimState, Float64Array>()
/** Offer one shrine or meal visit before crossing its junction, including a diversion across it. */
function tryRoadVisit(sim: SimState, s: SimTraveler, t: Traveler, map: GameMap,
  counters: ReturnType<typeof openCounters>, direction: 1 | -1, parkingProgress: number,
  characterScale: number, from?: TilePos, partyVisit = false): boolean {
  const isVendor = t.type.id === "vendor", needsParking = isVendor || t.type.id === "knight"
  const renown = sim.shrineRenown + sim.visits * sim.balance.rules.visitRenown
  // Hunger and thirst only draw anyone in while a counter is open:
  // the shrine itself keeps no table (see the tavern and the stall).
  const shrineCounters = counters.filter(b => b.owner !== "independent")
  const served = shrineCounters.length > 0
  const socialNeed = !needsParking && shrineCounters.some(b => b.buildType === "tavern") && s.gold >= DRINK_PRICE
    && s.happiness < HAPPINESS_THRESHOLD
  const socialChance = socialNeed ? (HAPPINESS_THRESHOLD - s.happiness) / HAPPINESS_THRESHOLD : 0
  const ordinaryChance = visitChance({ ...t.attributes, piety: s.piety,
    hunger: served ? s.hunger : 100, thirst: served ? s.thirst : 100, stamina: s.stamina },
    sim.relic, renown, sim.balance, 0, t.type.id)
  s.visitCooldown = 5
  const decision = nextRoll(s)
  const ordinaryVisit = partyVisit || decision < Math.max(socialChance, ordinaryChance)
  const evangelism = ordinaryVisit ? 0 : roadsideEvangelism(map)
  const persuaded = evangelism > 0 && nextRoll(s) < evangelism
  // A traveler drawn by need heads for the counter, not the relic.
  // Wagons and horses stay on the road; only walkers turn aside for a meal.
  if ((ordinaryVisit || persuaded) && served && !needsParking &&
    (socialNeed || Math.min(s.hunger, s.thirst) < hospitalityNeedThreshold(renown, sim.balance)) &&
    startTavernTrip(sim, s, map, shrineCounters, null)) {
    s.partyVisitAborted = false
    return true
  }
  const wantsVisit = partyVisit || decision < ordinaryChance || persuaded
  const occupiedSeats = new Set([...sim.travelers.values()].flatMap(other =>
    other.shrineSeat && (["toParking","toRelic","visiting","fromRelic","offering"].includes(other.activity) ||
      other.waterVisit?.resumeActivity) ? [other.shrineSeat] : []))
  const visit = wantsVisit ? shrineVisitPlan(map, s.id, s.visits, occupiedSeats, from) : null
  let visitRoute = visit?.route ?? null
  let parking: ShrineParking | null = null
  if (visitRoute && needsParking) {
    const puller = isVendor ? cartLoadout(s.id).puller : "horse"
    parking = shrineParking(map, parkingProgress, direction, isVendor ? -cartOffset(puller) * characterScale : 0, puller, characterScale,
      [...sim.travelers.values()].flatMap(other => other.shrineParking ? [other.shrineParking.parked] : []), parkingContext(sim, s, characterScale))
    const footRoute = parking ? settlementRoute(map, map.buildings,
      { x: worldToTileX(map, parking.parked.hitch.x), z: worldToTileZ(map, parking.parked.hitch.z) }, visitRoute.at(-1)!, false, true, visit!.seat) : null
    visitRoute = footRoute
  }
  if (visitRoute) {
    s.progress = parkingProgress
    s.branchProgress = 0
    s.shrineRoute = visitRoute
    s.shrineSeat = visit!.seat
    s.admissionPaid = 0
    s.offeringMade = false
    s.offeringProgress = undefined
    s.shrineQueueOrder = ++sim.shrineQueueSequence
    if (parking) s.direction = direction
    s.shrineParking = parking ?? undefined
    s.activity = parking ? "toParking" : "toRelic"
    s.partyVisitAborted = false
    s.targetId = null
    s.branchEntryLane = s.lane
    s.lane = s.laneOffset
    const at = parking ? { ...parking.entry[0], y: s.y } : shrineWorldPoint(map, s)
    s.x = at.x
    s.y = at.y
    s.z = at.z
    return true
  }
  return false
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
  /** Strides of the beggar outfits, using the same rendered scale and rig. */
  beggarSpeedScales?: ReadonlyMap<number, number>,
): void {
  return withTerrainCornerQueries(map, () => {
  if (!map.road || map.road.length < 2) return
  if (dt > 0) for (const animal of sim.wildlife?.animals ?? []) {
    const shepherd = animal.fold?.shepherd == null ? undefined : sim.travelers.get(animal.fold.shepherd)
    if (animal.fold && !animal.fold.arrived && (!shepherd || shepherd.herding?.animalId !== animal.id)) {
      animal.fold = undefined; animal.target = null; animal.rest = 0
    }
  }
  const length = map.road.length - 1
  sim.time += dt / GAME_DAY_SECONDS
  const hours = dt / GAME_HOUR_SECONDS
  let previousPositions = tickPositions.get(sim)
  if (!previousPositions || previousPositions.length < travelers.length * 3) {
    previousPositions = new Float64Array(travelers.length * 3)
    tickPositions.set(sim, previousPositions)
  }
  if (dt > 0) for (let i = 0; i < travelers.length; i++) {
    const state = sim.travelers.get(travelers[i].id)
    previousPositions[i * 3] = state?.x ?? 0
    previousPositions[i * 3 + 1] = state?.z ?? 0
    previousPositions[i * 3 + 2] = state?.cycle ?? NaN
  }
  regrowFootpaths(sim.footpaths, dt / GAME_DAY_SECONDS)
  // One reading of the settlement's open counters, shared by everyone this step.
  const counters = openCounters(sim, map)
  const partyIdentities = travelerIdentities(travelers)
  stepTravelParties(sim, travelers, map, dt, counters, state => {
    const t = partyIdentities.get(state.id)!
    return t.pace * baseSpeed * wearySpeedScale(state)
      * (t.type.id === "friar" ? monkWalkSpeed(characterScale) / DEFAULT_WALK_SPEED : speedScales?.get(t.id) ?? 1)
      * paceVariation(t.id, sim.time * GAME_DAY_SECONDS, movement.variation)
  }, characterScale, movement)
  const waterSources = map.buildings.filter(b => isWaterSource(b) && isComplete(b))
  const roadWalkerCount = travelers.reduce((count, t) => count + (t.type.id !== "vendor" && t.type.id !== "knight" ? 1 : 0), 0)
  let explorerRank = 0
  // Inspect only potential performers and vendors inside each traveler's step.
  // Keep live state references: someone can start/stop performing earlier in
  // this same tick, and insertion order still decides equally near encounters.
  const musicians = new SpatialPoints([...sim.travelers.values()]
    .filter(s => s.activity === "toPerformance" || s.activity === "performing")
    .map(state => {
      // A performer is stationary; someone arriving this tick finishes at their
      // reserved spot. Index that destination while retaining live activity.
      const point = state.activity === "toPerformance" ? state.spot ?? state : state
      return { x: point.x, z: point.z, state }
    }))
  const beggars = new SpatialPoints([...sim.travelers.values()]
    .filter(state => state.activity === "begging" || state.activity === "toBegging")
    .map(state => { const point = state.activity === "toBegging" ? state.spot ?? state : state; return { x: point.x, z: point.z, state } }))
  const reservations = new RoadsideReservations(sim.travelers.values())
  const listeners = new Map<number, number>()
  for (const state of sim.travelers.values()) if (state.musicVisit) {
    const id = state.musicVisit.performerId
    listeners.set(id, (listeners.get(id) ?? 0) + 1)
  }
  const vendors = travelers.filter(t => t.type.id === "vendor").flatMap(t => {
    const state = sim.travelers.get(t.id)
    return state ? [state] : []
  })
  const deployedStall = (state: SimTraveler) => state.stallRoute &&
    (state.activity === "openingShop" || state.activity === "vending" || state.activity === "packingShop") ? state.stallRoute : undefined
  let pastureObstacles: StallRoute["obstacles"] | undefined

  for (const t of travelers) {
    const ordinal = t.type.id !== "vendor" && t.type.id !== "knight" ? explorerRank++ : -1
    const s = sim.travelers.get(t.id)
    if (!s || sim.joinedMonks.has(t.id)) continue
    stepPoverty(s, t, dt)
    const previousStall = deployedStall(s)
    if (s.herding && !["toSheep", "herding"].includes(s.activity)) releaseSheep(s, sim.wildlife)
    s.herdingRetry = Math.max(0, (s.herdingRetry ?? 0) - dt)
    s.convoyScale = characterScale
    // Riders wait for a passing procession; prayer poses begin once on foot.
    // A vendor who has taken over a stall has left the wagon for good.
    const riding = s.partyRiding || (t.type.id === "knight" ? knightMounted(s.activity, s.horseRest) :
      t.type.id === "vendor" && s.convoy && cartLoadout(s.id).puller !== "hand" && !s.shrineParking?.walking && !s.marketParking?.walking &&
      !["openingShop", "vending", "packingShop"].includes(s.activity))
    const processionNearby = nearProcession(sim.procession, s, s.praying)
    s.praying = !riding && processionNearby
    const socialBreak = s.happiness < HAPPINESS_THRESHOLD && s.gold >= DRINK_PRICE
      && counters.some(b => b.buildType === "tavern" && b.id !== s.employer)
    const inChurch = s.activity === "visiting" || s.activity === "offering"
    stepDevotion(s, dt, inChurch, !processionNearby && s.activity === "visiting" && !s.shrineSeat?.startsWith("queue-"), sim.balance)
    const socializing = s.activity === "sitting" && (s.tavernVisit?.meal || s.tavernVisit?.drink)
    if (!socializing) s.happiness = Math.max(0, s.happiness - sim.balance.rules.happinessDecay * hours)
    if (processionNearby) {
      if (dt > 0 && sim.procession) blessByProcession(sim.procession, `traveler:${s.id}`, s)
      s.moveSpeed = 0; continue
    }
    s.naturalWaterRetry = Math.max(0, (s.naturalWaterRetry ?? 0) - dt)
    s.seatRestRetry = Math.max(0, (s.seatRestRetry ?? 0) - dt)
    s.visitCooldown = Math.max(0, s.visitCooldown - dt)
    s.waterRetry = Math.max(0, (s.waterRetry ?? 0) - dt)
    s.musicCooldown = Math.max(0, (s.musicCooldown ?? 0) - dt)
    // Kneeling in the shrine is a rest, not a meal: the brothers keep no table.
    const sheltered = s.activity === "visiting"
    const abed = s.activity === "sleeping"
    const isVendor = t.type.id === "vendor", needsParking = isVendor || t.type.id === "knight"

    // --- Needs march on ------------------------------------------------------
    const needFactor = abed ? CAMP_NEED_FACTOR : 1
    // A company eats and drinks from one shared store, drained by its party step.
    if (s.partyId === undefined) {
      s.hunger = Math.max(0, s.hunger - sim.balance.rules.hungerDecay * needFactor * hours)
      s.thirst = Math.max(0, s.thirst - sim.balance.rules.thirstDecay * needFactor * hours)
    }
    if (abed) s.stamina = Math.min(100, s.stamina + CAMP_STAMINA_REGEN * hours)
    // Travelling on the road costs no stamina, and standing at a stall, a post
    // or a performance neither drains nor restores the legs.
    else if (!s.partyWaiting && !s.partyCarried && !TRAVEL_ACTIVITIES.includes(s.activity) &&
      !["vending", "performing", "listening", "begging", "givingAlms", "posted", "sitting", "buying", "drinking", "drinkingLow"].includes(s.activity)) {
      s.stamina = Math.max(0, s.stamina - sim.balance.rules.staminaDecay * hours)
    }

    if (sheltered) s.stamina = Math.min(100, s.stamina + 65 * hours)
    if (abed) {
      s.hunger = Math.min(100, s.hunger + HOME_MEAL_PER_HOUR * hours)
      s.thirst = Math.min(100, s.thirst + HOME_DRINK_PER_HOUR * hours)
    }

    // Vendors eat and drink from their own stock, on the move.
    if (isVendor) {
      if (s.hunger <= 0) s.hunger = 100
      if (s.thirst <= 0) {
        s.thirst = 100
      }
    }

    const knightSpeed = t.type.id === "knight" ? (knightMounted(s.activity, s.horseRest)
      ? knightTravelSpeed(characterScale, knightLoadout(t.id).squire)
      : knightWalkStride(travelerAppearance(map.seed ?? 0, t.id).variant) * characterScale * DEFAULT_WALK_CADENCE) / DEFAULT_WALK_SPEED : undefined
    const job = settlementJob(s.employer, sim.buildings)
    const residentSpeed = job ? jobSpeedScale(job, travelerAppearance(map.seed ?? 0, t.id).variant, characterScale) : undefined
    const pace = s.beggar ? TRAVELER_TYPES.beggar.paceMin + roll(t.id, 901) * (TRAVELER_TYPES.beggar.paceMax - TRAVELER_TYPES.beggar.paceMin) : t.pace
    const beggarSpeed = s.beggar ? beggarSpeedScales?.get(t.id) ?? 1 : undefined
    // A company sets its members' pace; only everyone else eases toward their own.
    let targetSpeed = 0
    if (s.partyCarried) s.moveSpeed = s.partySpeed ?? 0
    else {
      targetSpeed = pace * baseSpeed * (riding ? 1 : wearySpeedScale(s)) * (beggarSpeed ?? residentSpeed ?? knightSpeed ?? (t.type.id === "friar" ? monkWalkSpeed(characterScale) / DEFAULT_WALK_SPEED : speedScales?.get(t.id) ?? 1)) * paceVariation(t.id, sim.time * GAME_DAY_SECONDS, movement.variation)
      s.moveSpeed = sheltered || STILL_ACTIVITIES.includes(s.activity) ? 0 :
        easeSpeed(s.moveSpeed, targetSpeed, dt, movement.acceleration)
    }
    if (s.partyRiding || s.partyBoarding) continue
    const worldSpeed = s.moveSpeed
    const transportBefore = isVendor && s.convoy && !s.shrineParking?.walking ? {
      ...s, offRoadRoute: s.offRoadRoute ? [...s.offRoadRoute] : null,
      roadShortcut: s.roadShortcut ? { ...s.roadShortcut } : undefined,
      shrineParking: s.shrineParking ? { ...s.shrineParking } : undefined,
      marketParking: s.marketParking ? { ...s.marketParking } : undefined,
    } : null
    if (s.roadShortcut) {
      stepRoadShortcut(s, map, worldSpeed * dt)
      finishConvoyMove(s, transportBefore, map, characterScale)
      continue
    }

    if (s.pasture && (s.activity === "openingShop" || s.activity === "vending" || s.activity === "packingShop")) {
      if (!s.pasture.tether) {
        if (!pastureObstacles) {
          pastureObstacles = []
          for (const other of sim.travelers.values()) {
            const stall = deployedStall(other)
            if (stall) pastureObstacles.push(...stall.obstacles)
          }
        }
        s.pasture.obstacles = pastureObstacles
      }
      stepPasture(map, s.pasture, dt, Math.max(0.01, targetSpeed), s.activity === "packingShop")
    }
    switch (s.activity) {
      case "toParking":
      case "fromParking": {
        const parking = (s.marketParking ?? s.shrineParking)!, inbound = s.activity === "toParking"
        const route = inbound ? parking.entry : parking.exit, length = routeLength(route)
        const wheelbase = isVendor ? -cartOffset(cartLoadout(s.id).puller) * characterScale : 0
        // Follow every bend even when the simulation advances several frames.
        const end = Math.min(length, parking.distance + worldSpeed * dt)
        while (parking.distance < end) {
          parking.distance = Math.min(end, parking.distance + .04)
          const next = followCart(parking.pose, routePoint(route, parking.distance), wheelbase)
          if (isVendor && !convoyBuildingsClear(map, next, cartLoadout(s.id).puller, characterScale)) {
            parking.distance = -1
            break
          }
          parking.pose = next
        }
        if (parking.distance < 0) { Object.assign(s, transportBefore); s.moveSpeed = 0; break }
        const point = parking.pose.hitch
        s.x = point.x; s.z = point.z; s.y = surfaceHeight(map, worldToTileX(map, s.x), worldToTileZ(map, s.z))
        if (parking.distance >= length) {
          if (inbound) {
            if (s.marketParking) parking.parked = parking.pose
            parking.pose = parking.parked; parking.walking = true
            if (t.type.id === "knight") s.horseRest = { ...parking.parked.hitch, y: s.y, heading: parking.parked.heading, tree: parking.tree, progress: 0, lane: s.lane }
            if (s.marketParking) {
              s.convoy = false
              s.activity = "toPost"
            } else { s.activity = "toRelic"; s.branchProgress = 0 }
          } else {
            s.progress = parking.returnProgress; s.shrineParking = undefined; s.shrineRoute = null
            s.activity = "walking"; s.visitCooldown = 30
          }
        }
        break
      }
      case "toRelic":
      case "fromRelic": {
        // Detour on the outdoor approach; finish crossing the chapel gate first.
        if (dt > 0 && !buildingAt(map, worldToTileX(map, s.x), worldToTileZ(map, s.z)) &&
          startWaterTrip(sim, s, map, waterSources, { x: s.x, y: s.y, z: s.z })) break
        const branch = s.shrineRoute ?? map.site!.branch
        const inbound = s.activity === "toRelic"
        let limit = branch.length - 1
        if (inbound && s.shrineSeat?.startsWith("queue-")) {
          const ahead = [...sim.travelers.values()].filter(other => other !== s && other.shrineSeat?.startsWith("queue-")
            && (other.shrineQueueOrder ?? 0) < (s.shrineQueueOrder ?? 0)
            && ["toParking", "toRelic", "visiting"].includes(other.activity))
          limit -= ahead.length * .75
          for (const other of ahead) {
            // Shared approach: a faster walker must never overtake the person ahead.
            if (other.shrineRoute?.length === branch.length && other.shrineRoute.every((p, i) => p.x === branch[i].x && p.z === branch[i].z))
              limit = Math.min(limit, other.branchProgress - .75)
          }
        }
        const previous = s.branchProgress
        s.branchProgress = inbound ? Math.max(previous, Math.min(Math.max(0, limit), previous + worldSpeed * dt))
          : Math.max(!s.offeringMade && s.offeringProgress !== undefined ? s.offeringProgress : 0, previous - worldSpeed * dt)
        if (inbound && s.branchProgress === previous) s.moveSpeed = 0
        stepLane(s, inbound ? 1 : -1, worldSpeed * dt)
        const at = shrineWorldPoint(map, s)
        s.x = at.x
        s.y = at.y
        s.z = at.z
        if (inbound && s.branchProgress >= branch.length - 1) {
          if (!s.shrineSeat?.startsWith("queue-") || (sim.shrineKeeperReady && (!sim.procession || sim.procession.stage === "idle"))) {
            s.activity = "visiting"
            s.timer = s.shrineSeat?.startsWith("queue-") ? 6 : 2 * GAME_HOUR_SECONDS
          }
        } else if (!inbound && !s.offeringMade && s.offeringProgress !== undefined && s.branchProgress <= s.offeringProgress) {
          s.activity = "offering"
          s.timer = 1.5
        } else if (!inbound && s.branchProgress <= 0) {
          s.lane = s.direction * s.laneOffset
          s.horseRest = undefined
          s.shrineSeat = undefined
          if (s.shrineParking) {
            s.shrineParking.walking = false; s.shrineParking.distance = 0
            s.activity = "fromParking"
          } else {
            s.activity = "walking"; s.shrineRoute = null; s.visitCooldown = 30; s.diversionCheck = undefined
            if (!s.partyVisitAborted && s.partyId === undefined) settleAfterVisit(sim, s, t, map, travelers)
          }
        }
        break
      }
      case "visiting": {
        if (s.shrineSeat?.startsWith("queue-") && (!sim.shrineKeeperReady || (sim.procession && sim.procession.stage !== "idle"))) break
        s.timer -= dt
        if (s.timer <= 0) finishVisit(sim, s, map)
        break
      }
      case "offering": {
        if (dt <= 0) break
        s.timer -= dt
        if (s.timer > 0) break
        if (!s.offeringMade) {
          const amount = shrineDonation(s.piety, s.gold, () => nextRoll(s))
          s.gold -= amount
          sim.shrineGold += amount
          s.admissionPaid = amount
          s.offeringMade = true
          if (amount > 0) {
            sim.admissionPayments.push({ id: ++sim.admissionSequence, travelerId: s.id, amount, x: s.x, y: s.y, z: s.z })
            if (sim.admissionPayments.length > 64) sim.admissionPayments.shift()
          }
        }
        s.activity = "fromRelic"
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
      case "toBuild":
      case "building": {
        if (dt <= 0) break
        // Finish the assigned site before returning to camp to recover needs.
        const state = stepBuildingTask(s, map, targetSpeed, dt)
        if (!state) {
          const camp = sim.buildings.find(b => b.id === s.employer)
          s.constructionReturn = camp ? workerRoute(map, s, buildingEntrance(camp)) ?? [] : []
          s.activity = "fromBuild"
        } else s.activity = state === "walking" ? "toBuild" : "building"
        break
      }
      case "fromBuild": {
        if (walkWorker(s, s.constructionReturn ?? [], targetSpeed, dt)) {
          s.activity = "idle"; s.timer = GAME_HOUR_SECONDS; s.constructionReturn = undefined
        }
        break
      }
      case "idle": {
        s.workScale = characterScale
        if (dt > 0 && s.home && !s.employer && s.jobless && s.timer <= 0) {
          settleAfterVisit(sim, s, t, map, travelers, s.home)
          if (s.employer) break
          s.timer = GAME_HOUR_SECONDS
        }
        // Standing behind a counter or in a fold asks little; a settler keeps
        // that post until they are genuinely hungry or tired.
        const hungry = Math.min(s.hunger, s.thirst) < SERVING_THRESHOLD
        const unhappy = socialBreak
        const workplace = sim.buildings.find(b => b.id === s.employer)
        if (workplace && isPostedWork(workplace.kind) && !hungry && !unhappy && s.stamina > SETTLER_TIRED_AT) {
          if (workplace.kind === "sheep-pen" && dt > 0 && !s.herdingRetry) {
            s.herdingRetry = 5
            if (seekSheep(s, sim.wildlife, map, characterScale)) break
          }
          s.workSlot = s.jobSlot
          if (assignBuildingTask(s, map, "work", workplace.id)) { s.activity = "toPost"; break }
        }
        // Company makes a tavern worth paying for; thirst alone favors free water.
        if (unhappy && startTavernTrip(sim, s, map, counters.filter(b => b.buildType === "tavern"), workplaceReturn(sim, s, map))) break
        if (dt > 0 && !isVendor && (startWaterTrip(sim, s, map, waterSources, workplaceReturn(sim, s, map) ?? s) ||
          startNaturalWaterTrip(s, map))) break
        if (hungry && startTavernTrip(sim, s, map, counters, workplaceReturn(sim, s, map))) break
        if (!hungry && startSeatRest(sim, s, map, workplaceReturn(sim, s, map))) break
        if (Math.min(s.hunger, s.thirst, s.stamina) < SETTLER_FED_AT) {
          if (!s.home) s.home = findHome(sim, s, map)
          s.workSlot = homeBedSlot(sim, s)
          if (s.home && assignBuildingTask(s, map, "rest", s.home)) { s.activity = "toHome"; break }
        }
        s.workSlot = s.id
        if (Math.min(s.hunger, s.thirst, s.stamina) >= SETTLER_FED_AT && assignBuildingTask(s, map, "build")) {
          s.activity = "toBuild"
          break
        }
        s.timer -= dt
        if (s.timer <= 0 && Math.min(s.hunger, s.thirst, s.stamina) >= SETTLER_FED_AT) {
          if (!chooseTree(sim, s, map)) s.timer = GAME_HOUR_SECONDS
        }
        break
      }
      case "toHome":
      case "sleeping": {
        if (dt <= 0) break
        const state = stepBuildingTask(s, map, targetSpeed, dt)
        if (!state) { s.activity = "idle"; s.timer = GAME_HOUR_SECONDS; break }
        s.activity = state === "walking" ? "toHome" : "sleeping"
        // Rise fully rested and fed, so a night at home is worth the walk.
        // Step outside before looking for work: routes to a tree or a site
        // cannot cross the house wall.
        if (state === "sleeping" && Math.min(s.stamina, s.hunger, s.thirst) >= SETTLER_WAKE_AT) {
          const home = map.buildings.find(b => b.id === s.buildingTask!.buildingId)
          s.buildingTask = undefined
          s.constructionReturn = home ? workerRoute(map, s, buildingEntrance(home)) ?? [] : []
          s.activity = "fromHome"
        }
        break
      }
      case "fromHome": {
        if (walkWorker(s, s.constructionReturn ?? [], targetSpeed, dt)) {
          s.activity = "idle"; s.timer = 0; s.constructionReturn = undefined
        }
        break
      }
      case "toSheep":
      case "herding": {
        if (dt <= 0) break
        if (s.stamina <= SETTLER_TIRED_AT || Math.min(s.hunger, s.thirst) < SERVING_THRESHOLD
          || socialBreak) {
          releaseSheep(s, sim.wildlife); s.activity = "idle"; s.timer = 0
        } else if (!stepShepherd(s, sim.wildlife, map, targetSpeed, dt, characterScale)) {
          s.activity = "idle"; s.timer = 0
        }
        break
      }
      case "toPost":
      case "posted": {
        if (dt <= 0) break
        const state = stepBuildingTask(s, map, targetSpeed, dt)
        if (!state) { s.activity = "idle"; s.timer = GAME_HOUR_SECONDS; break }
        s.activity = state === "walking" ? "toPost" : "posted"
        // Step away to sleep or eat; the slot stays theirs while they are gone.
        if (state === "posted" && (s.stamina <= SETTLER_TIRED_AT || Math.min(s.hunger, s.thirst) < SERVING_THRESHOLD
          || socialBreak)) {
          s.buildingTask = undefined
          s.activity = "idle"
          s.timer = 0
        } else if (state === "posted" && !s.herdingRetry) {
          s.herdingRetry = 5
          seekSheep(s, sim.wildlife, map, characterScale)
        }
        break
      }
      case "toWater": {
        if (s.naturalWaterVisit) {
          const visit = s.naturalWaterVisit
          if (visit.buildings !== map.buildings) {
            // A new construction site may close the bank during the detour.
            startOffRoadWalk(s, "fromWater")
            break
          }
          if (stepOffRoadWalk(s, visit.spot, worldSpeed, dt, map)) {
            s.activity = "drinkingLow"
            s.timer = WATER_DRINK_SECONDS
          }
          break
        }
        const visit = s.waterVisit
        const source = waterSources.find(b => b.id === visit?.sourceId)
        if (!visit || !source) { leaveWater(s); break }
        if (visit.buildings !== map.buildings && s.offRoadRoute && s.offRoadRoute.length <= visit.approach.length) {
          // Placement protects this source's footprint and approach. Finish the
          // reserved strip rather than routing from inside a closed building.
          visit.buildings = map.buildings
        }
        if (visit.buildings !== map.buildings) {
          // Replan before entering the footprint after a construction change.
          const plan = waterVisitPlan(map, source, s, visit.returnTo)
          if (!plan) { leaveWater(s); break }
          s.waterVisit = plan.visit; s.offRoadRoute = plan.route
        }
        if (stepOffRoadWalk(s, visit.stand, worldSpeed, dt, map)) {
          s.activity = visit.kind === "well" ? "drinking" : "drinkingLow"
          s.timer = WATER_VISIT_SECONDS
        }
        break
      }
      case "drinking":
      case "drinkingLow": {
        if (s.naturalWaterVisit) {
          s.timer -= dt
          if (s.timer < 1e-8) {
            s.thirst = 100
            const visit = s.naturalWaterVisit
            startOffRoadWalk(s, "fromWater")
            if (visit.buildings === map.buildings) s.offRoadRoute = [...visit.route]
          }
          break
        }
        const visit = s.waterVisit
        if (!visit || !waterSources.some(b => b.id === visit.sourceId)) { leaveWater(s); break }
        // Water answers thirst only; no money, food or stamina changes hands.
        s.thirst = Math.min(100, s.thirst + 100 * Math.min(dt, s.timer) / WATER_VISIT_SECONDS)
        s.timer = Math.max(0, s.timer - dt)
        if (s.timer < 1e-8) { s.timer = 0; s.thirst = 100; leaveWater(s) }
        break
      }
      case "fromWater": {
        if (s.naturalWaterVisit) {
          const visit = s.naturalWaterVisit
          if (visit.buildings !== map.buildings) {
            s.offRoadRoute = null
            visit.buildings = map.buildings
          }
          if (stepOffRoadWalk(s, visit.back, worldSpeed, dt, map)) {
            s.naturalWaterVisit = undefined
            finishErrand(s)
          }
          break
        }
        const visit = s.waterVisit
        if (!visit) { finishErrand(s); break }
        if (visit.exitCleared && visit.buildings !== map.buildings) {
          s.offRoadRoute = null; visit.buildings = map.buildings
        }
        if (s.offRoadRoute?.length) {
          if (!stepOffRoadWalk(s, s.offRoadRoute.at(-1)!, worldSpeed, dt, map)) break
          s.offRoadRoute = null
          visit.exitCleared = true
          if (Math.hypot(s.x - visit.returnTo.x, s.z - visit.returnTo.z) < 1e-6) {
            finishWaterTrip(s); break
          }
          break
        }
        if (stepOffRoadWalk(s, visit.returnTo, worldSpeed, dt, map)) {
          finishWaterTrip(s)
        }
        break
      }
      case "toTavern": {
        const visit = s.tavernVisit!
        const goal = visit.served ? visit.plan.seat!.point : visit.plan.counter.point
        if (stepOffRoadWalk(s, goal, worldSpeed, dt, map)) {
          s.activity = visit.served ? "sitting" : "buying"
          s.timer = visit.served ? TABLE_HOURS * GAME_HOUR_SECONDS : 2
        }
        break
      }
      case "buying": {
        s.timer -= dt
        if (s.timer > 0) break
        const visit = s.tavernVisit!
        buyRefreshment(sim, s, map)
        visit.served = true
        const seat = visit.plan.seat
        const onward = seat && tavernWalkingRoute(map, s, seat.point, seat.id)
        if (seat && onward) { s.offRoadRoute = onward; s.walkT = 0; s.activity = "toTavern" }
        else leaveTavern(s, map, visit.returnTo ?? currentRoutePoint(map, s))
        break
      }
      case "sitting": {
        // Cap both rewards at the remaining break; free seats restore only stamina.
        const seatedHours = Math.min(dt, Math.max(0, s.timer)) / GAME_HOUR_SECONDS
        if (s.tavernVisit?.meal || s.tavernVisit?.drink)
          s.happiness = Math.min(100, s.happiness + TAVERN_HAPPINESS_GAIN * seatedHours / TABLE_HOURS)
        s.stamina = Math.min(100, s.stamina + SEAT_STAMINA_PER_HOUR * seatedHours)
        s.timer -= dt
        if (s.timer <= 0) leaveTavern(s, map, s.tavernVisit!.returnTo ?? currentRoutePoint(map, s))
        break
      }
      case "fromTavern": {
        const back = s.tavernVisit?.returnTo ?? currentRoutePoint(map, s)
        if (stepOffRoadWalk(s, back, worldSpeed, dt, map)) {
          const restOnly = !s.tavernVisit?.meal && !s.tavernVisit?.drink
          s.tavernVisit = undefined
          finishErrand(s)
          if (restOnly) s.visitCooldown = 60
          else if (!s.employer) s.visitCooldown = 30
        }
        break
      }
      case "walking":
      case "seeking":
      case "fleeing": {
        // The company already placed them on its shared path this step.
        if (s.partyCarried) break
        const grouped = s.partyId !== undefined
        // A hungry traveler may consider a shrine ahead on their own route.
        // Never turn them back toward a junction they have already passed.
        const renown = sim.shrineRenown + sim.visits * sim.balance.rules.visitRenown
        const ahead = map.site ? s.direction * (map.site.junction - s.progress) : -1
        const shelter = !grouped && !!map.site && !s.track && s.activity !== "fleeing" && s.visitCooldown <= 0 &&
          Math.min(s.hunger, s.thirst) < hospitalityNeedThreshold(renown, sim.balance) && ahead >= 0 && ahead <= 12
        if (!grouped && (s.activity === "walking" || s.activity === "seeking") && !needsParking && !s.track && !s.roadShortcut &&
          s.stamina > CAMP_STAMINA_THRESHOLD && Math.min(s.hunger, s.thirst) >= SERVING_THRESHOLD &&
          startSeatRest(sim, s, map, null)) break
        if (s.activity === "fleeing") {
          s.fleeTimer -= dt
          if (s.fleeTimer <= 0) s.activity = "walking"
        }
        const roadCustomer = (s.activity === "walking" || s.activity === "seeking") && !s.track && !s.roadShortcut &&
          !isVendor && t.type.id !== "knight" && s.visitCooldown <= 0
        const nearbyTown = roadCustomer ? map.towns?.find(town => Math.abs(town.junction - s.progress) <= 3) : undefined
        const townCounter = nearbyTown ? counters.find(b => b.id === nearbyTown.tavernId) : undefined
        // An unhappy walker chooses company over the bank, even when thirsty.
        // Keep the same local town reach and only approach a shrine still ahead.
        if (roadCustomer && s.happiness < HAPPINESS_THRESHOLD && s.gold >= DRINK_PRICE) {
          const taverns = counters.filter(b => b.buildType === "tavern" &&
            (b.id === townCounter?.id || (b.owner !== "independent" && ahead >= 0 && ahead <= 3)))
          if (startTavernTrip(sim, s, map, taverns, null)) break
        }
        // If content, penniless, or unable to get a table, use reachable free water.
        if (dt > 0 && !needsParking && s.activity !== "fleeing" &&
          startWaterTrip(sim, s, map, waterSources, currentRoutePoint(map, s))) break
        if (dt > 0 && (s.activity === "walking" || s.activity === "seeking") && !isVendor && startNaturalWaterTrip(s, map)) break
        if (townCounter && Math.min(s.hunger, s.thirst) < SERVING_THRESHOLD &&
          startTavernTrip(sim, s, map, [townCounter], null)) break
        // An empty market stall on the shrine's ground draws a passing vendor
        // to settle: they leave the road, take the stall, and keep it for good.
        if (isVendor && !s.employer && !s.track && ahead >= 0 && ahead <= 6 && !s.shrineParking &&
          s.marketCheck !== Math.floor(s.progress)) {
          s.marketCheck = Math.floor(s.progress)
          const home = findHome(sim, s, map)
          const puller = cartLoadout(s.id).puller
          const initial = s.cartPose ?? roadCartPose(map, s.progress, s.direction, -cartOffset(puller) * characterScale, characterScale)
          for (const stall of sim.buildings.filter(b => home && BUILDING_KINDS[b.kind].vendorKept && isComplete(b) && staffOf(sim, b.id).length === 0)) {
            const parking = marketParking(map, stall, initial, puller, characterScale, parkingContext(sim, s, characterScale))
            if (!parking) continue
            // Reserve the walking job only after both the drive and the walk
            // from the bay to the counter are known to be possible.
            const keeper = { ...s, ...parking.parked.hitch, workSlot: 0 }
            if (!assignBuildingTask(keeper, map, "work", stall.id)) continue
            s.buildingTask = keeper.buildingTask
            s.workSlot = 0
            s.home = home
            s.employer = stall.id
            s.jobSlot = 0
            s.jobless = false
            s.marketParking = parking
            s.stallRoute = undefined
            s.pasture = undefined
            s.spot = null
            s.activity = "toParking"
            break
          }
          if (s.marketParking) break
        }
        // A vendor whose walking stint is up pulls off to the side of the path.
        if (isVendor && !shelter && !s.track) {
          s.timer -= dt
          if (s.timer <= 0) {
            const puller = cartLoadout(s.id).puller
            const pitch = stallParking(map, s, s.progress, s.direction, -cartOffset(puller) * characterScale, characterScale, puller, parkingContext(sim, s, characterScale))
            if (pitch) {
              s.stallRoute = pitch
              s.spot = { ...pitch.park, y: surfaceHeight(map, worldToTileX(map, pitch.park.x), worldToTileZ(map, pitch.park.z)) }
              startOffRoadWalk(s, "toShop")
              break
            }
            s.timer = 5
          }
        }
        if (!grouped && s.activity === "walking" && !shelter && !s.track && !isVendor && (s.beggar ? s.stamina > CAMP_STAMINA_THRESHOLD : Math.min(s.hunger, s.thirst, s.stamina) > 20)) {
          if (s.beggar) {
            s.timer -= dt
            if (s.timer <= 0) {
              const spot = roadsideSpot(sim, s, map, reservations)
              if (spot) { s.spot = spot; startOffRoadWalk(s, "toBegging"); break }
              s.timer = GAME_HOUR_SECONDS
            }
          } else if (t.type.id === "minstrel") {
            s.timer -= dt
            if (s.timer <= 0) {
              const spot = roadsideSpot(sim, s, map, reservations)
              if (spot) { s.spot = spot; startOffRoadWalk(s, "toPerformance"); break }
              s.timer = GAME_HOUR_SECONDS
            }
          } else if (s.musicCooldown === 0) {
            const performer = musicians.firstWithin(s.x, s.z, 4, ({ state }) =>
              state.activity === "performing" && !state.praying && (listeners.get(state.id) ?? 0) < 6)?.state
            if (performer) {
              s.musicCooldown = 2 * GAME_HOUR_SECONDS
              if (nextRoll(s) < 0.65) {
                const spot = roadsideSpot(sim, s, map, reservations, performer)
                if (spot) {
                  if (s.musicVisit) listeners.set(s.musicVisit.performerId, (listeners.get(s.musicVisit.performerId) ?? 1) - 1)
                  s.musicVisit = { performerId: performer.id, cycle: performer.cycle, spot }
                  listeners.set(performer.id, (listeners.get(performer.id) ?? 0) + 1)
                  startOffRoadWalk(s, "toListen")
                  break
                }
              }
            }
          }
        }
        if (!grouped && s.activity === "walking" && !shelter && !s.track && !isVendor && !s.beggar && s.gold >= 1 &&
          Math.min(s.hunger, s.thirst, s.stamina) > 20) {
          const beggar = beggars.firstWithin(s.x, s.z, 3, ({ state }) => state.beggar === true && state.activity === "begging" && !state.praying &&
            s.almsEncounters?.[state.id] !== state.cycle)?.state
          if (beggar) {
            // One choice per pitch: standing nearby must not reroll generosity every frame.
            ;(s.almsEncounters ??= {})[beggar.id] = beggar.cycle
            if (nextRoll(s) < 0.05 + 0.85 * Math.max(0, Math.min(100, s.piety)) / 100) {
              const spot = roadsideSpot(sim, s, map, reservations, beggar)
              if (spot) {
                s.almsVisit = { beggarId: beggar.id, cycle: beggar.cycle, spot }
                startOffRoadWalk(s, "toAlms")
                break
              }
            }
          }
        }
        // Nobody goes shopping from the middle of the dark forest: on a track
        // they trudge on hungry until they rejoin the road.
        if (!grouped && s.activity === "walking" && !shelter && !isVendor && !s.track && (s.hunger <= 0 || s.thirst <= 0)) {
          s.activity = "seeking"
          s.targetId = null
        }

        let direction = s.direction
        let haste = s.activity === "fleeing" ? FLEE_HASTE : 1
        if (s.activity === "seeking" && !shelter) {
          // Only pursue road traders or an open roadside stall. Settled keepers
          // and shrine visitors retain their old road progress while off-road;
          // chasing it leaves customers pacing at the enclave entrance forever.
          // Settled counters are reached through startTavernTrip instead.
          let vendor: SimTraveler | undefined
          let nearestDistance = Infinity
          for (const candidate of vendors) {
            if (candidate.employer || candidate.track || candidate.roadShortcut || candidate.praying ||
              (candidate.activity !== "walking" && candidate.activity !== "vending")) continue
            const distance = Math.abs(candidate.progress - s.progress)
            if (distance < nearestDistance) { nearestDistance = distance; vendor = candidate }
          }

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
            // Resume the journey, including wrapping at the map edge. Empty
            // needs will prompt another look for an available vendor next step.
            s.activity = "walking"
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

        // Plan before offering a visit: a diversion can cross the shrine's
        // junction without ever standing on that now-covered road tile.
        let diversion: WalkingShortcut | null = null
        if (dt > 0) {
          const check = Math.floor(s.progress) * 2 + (direction === 1 ? 1 : 0)
          if (s.diversionCheck !== check || s.diversionBuildings !== map.buildings) {
            s.diversionCheck = check
            s.diversionBuildings = map.buildings
            if (s.convoy) {
              const puller = cartLoadout(s.id).puller
              const initial = s.cartPose ?? roadCartPose(map, s.progress, direction, -cartOffset(puller) * characterScale, characterScale)
              diversion = cartRoadDiversion(map, initial, s.progress, direction, puller, characterScale, () => parkingContext(sim, s, characterScale))
            } else diversion = findRoadDiversion(map, blockedRoad(map), { x: s.x, z: s.z }, s.progress, direction,
              p => roadWorldPoint(map, p, s.lane))
          }
        }
        const site = map.site
        if (!grouped && site && site.branch.length >= 2 && s.activity !== "fleeing" && s.visitCooldown <= 0) {
          const distance = ((direction * (site.junction - s.progress)) % length + length) % length
          const crossingTile = Math.floor(s.progress) !== Math.floor(s.progress + direction * worldSpeed * haste * dt)
          const bypassesJunction = diversion !== null && direction * (site.junction - s.progress) >= 0
            && direction * (site.junction - diversion.end) < 0
          // Convoys seek a parking verge in advance. Pedestrians whose detour
          // bypasses the turning leave from this clear road tile and return here.
          if (distance <= worldSpeed * haste * dt || bypassesJunction || (needsParking && distance <= 12 && crossingTile)) {
            const leaveHere = needsParking || bypassesJunction
            const from = leaveHere ? { x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) } : undefined
            if (tryRoadVisit(sim, s, t, map, counters, direction, leaveHere ? s.progress : site.junction,
              characterScale, from)) break
          }
        }
        if (diversion) {
          s.roadShortcut = diversion
          stepRoadShortcut(s, map, worldSpeed * dt)
          break
        }
        if (!grouped && dt > 0 && s.activity === "walking" && !needsParking && map.footpaths) {
          const check = Math.floor(s.progress) * 2 + (direction === 1 ? 1 : 0)
          if (s.shortcutCheck !== check) {
            s.shortcutCheck = check
            s.roadShortcut = takeRoadShortcut(map, s.progress, direction, s.lane,
              (p, lane) => roadWorldPoint(map, p, lane),
              exploresRoadShortcut(ordinal, s.cycle, map.seed ?? 0, roadWalkerCount), sim.time * GAME_DAY_SECONDS) ?? undefined
            if (s.roadShortcut) { stepRoadShortcut(s, map, worldSpeed * dt); break }
          }
        }
        const next = s.convoy ? advanceCartProgress(map, s.progress, direction * worldSpeed * haste * dt)
          : s.progress + direction * worldSpeed * haste * dt
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
          if (!grouped && mouth >= 0 && takesTrack(routeState(t, s), nextRoll(s))) {
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

      case "toBegging": {
        if (stepOffRoadWalk(s, s.spot!, worldSpeed, dt, map)) {
          s.activity = "begging"
          s.timer = (6 + roll(s.id, s.cycle + 950) * 4) * GAME_HOUR_SECONDS
        }
        break
      }
      case "begging": {
        s.timer -= dt
        if (s.timer <= 0 || s.stamina <= CAMP_STAMINA_THRESHOLD) {
          s.cycle++
          startOffRoadWalk(s, "fromBegging")
        }
        break
      }
      case "toAlms": {
        if (!availableBeggar(sim, s) || Math.min(s.hunger, s.thirst, s.stamina) <= 10) {
          startOffRoadWalk(s, "fromAlms"); break
        }
        if (stepOffRoadWalk(s, s.almsVisit!.spot, worldSpeed, dt, map)) {
          s.activity = "givingAlms"; s.timer = 1
        }
        break
      }
      case "givingAlms": {
        s.timer -= dt
        const beggar = availableBeggar(sim, s)
        if (s.timer <= 0 || !beggar) {
          if (beggar) donate(sim, s, beggar)
          startOffRoadWalk(s, "fromAlms")
        }
        break
      }
      case "fromBegging":
      case "fromAlms": {
        if (stepOffRoadWalk(s, currentRoutePoint(map, s), worldSpeed, dt, map)) {
          if (s.activity === "fromBegging") s.timer = beggarWalkSeconds(s.id, s.cycle)
          s.activity = "walking"; s.spot = null; s.walkFrom = null; s.almsVisit = undefined
        }
        break
      }
      case "toPerformance": {
        if (stepOffRoadWalk(s, s.spot!, worldSpeed, dt, map)) {
          s.activity = "performing"
          s.timer = (2 + roll(s.id, s.cycle + 500) * 2) * GAME_HOUR_SECONDS
        }
        break
      }
      case "performing": {
        s.timer -= dt
        if (s.timer <= 0 || Math.min(s.hunger, s.thirst, s.stamina) <= 10) finishPerformance(s)
        break
      }
      case "toListen": {
        if (!availablePerformance(sim, s) || Math.min(s.hunger, s.thirst, s.stamina) <= 10) {
          startOffRoadWalk(s, "fromListening"); break
        }
        if (stepOffRoadWalk(s, s.musicVisit!.spot, worldSpeed, dt, map)) {
          s.activity = "listening"; s.timer = 1 + roll(s.id, s.rolls + 700)
        }
        break
      }
      case "listening": {
        s.timer -= dt
        const performer = availablePerformance(sim, s)
        if (s.timer <= 0 || !performer || Math.min(s.hunger, s.thirst, s.stamina) <= 10) {
          if (s.timer <= 0 && performer && nextRoll(s) < 0.4) donate(sim, s, performer)
          startOffRoadWalk(s, "fromListening")
        }
        break
      }
      case "fromPerformance":
      case "fromListening": {
        if (stepOffRoadWalk(s, currentRoutePoint(map, s), worldSpeed, dt, map)) {
          if (s.activity === "fromPerformance") s.timer = minstrelWalkSeconds(s.id, s.cycle)
          if (s.musicVisit) listeners.set(s.musicVisit.performerId, (listeners.get(s.musicVisit.performerId) ?? 1) - 1)
          s.activity = "walking"; s.spot = null; s.walkFrom = null; s.musicVisit = undefined
          s.musicCooldown = 2 * GAME_HOUR_SECONDS
        }
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
          if (cartLoadout(s.id).puller !== "hand") {
            s.pasture = createPasture(s, s.stallRoute?.obstacles, animalClearance(cartLoadout(s.id).puller, characterScale), s.stallRoute?.heading ?? 0)
          }

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

    }
    finishConvoyMove(s, transportBefore, map, characterScale)
    reservations.update(s)
    // Later animals in this tick must see a stall that just opened or packed up.
    if (deployedStall(s) !== previousStall) pastureObstacles = undefined
  }
  // Catch wages and other credits even when the recipient already took their turn.
  for (const s of sim.travelers.values()) {
    if (s.gold > 0) s.goldlessSeconds = 0
    recoverFromBegging(s)
  }
  if (dt > 0) {
    const from = { x: 0, z: 0 }
    const nearbyBuildings = buildingSpatialQuery(map.buildings)
    for (let i = 0; i < travelers.length; i++) {
      const traveler = travelers[i], to = sim.travelers.get(traveler.id)
      // Vendors record their rendered driver and axle contacts separately.
      if (!to || to.convoy || to.cycle !== previousPositions[i * 3 + 2]) continue
      let weight = traveler.type.id === "knight" && knightMounted(to.activity, to.horseRest) ? HEAVY_PATH_WEAR : 1
      if (to.partyCarried) {
        // A company wears the road once, charged to its head for everyone it moved.
        const party = sim.parties.get(to.partyId!)
        if (!party || party.members[0] !== to.id) continue
        weight = party.carried
      }
      from.x = previousPositions[i * 3]; from.z = previousPositions[i * 3 + 1]
      recordWalkingPath(sim.footpaths, map, from, to, weight, nearbyBuildings)
    }
  }
  })
}
