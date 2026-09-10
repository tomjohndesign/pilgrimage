import type { GameMap } from "../map/types"
import type { SimTraveler } from "../sim"
import type { TravelParty } from "../travel-parties"
import { diversionPoints, partyRoadDelta } from "../travel-parties"
import { deriveSeed, makeRng } from "../rng"
import { animalWalkSpeed, cartOffset, type Animal } from "./assets"
import { roadCartPose } from "./bridge-guide"
import { followCart, type CartPose } from "./follow"
import { convoyBuildingsClear, parkingClear, shrineParking, type ParkingContext, type ShrineParking } from "./navigation"
import { routeLength, routePoint } from "./roadside"
import { advanceCartProgress } from "./route"
import { driveRouteSegment } from "./building-parking"
import { seatPoint, type PassengerCart, type PackAnimal } from "./party-assets"

export interface PartyTransport {
  style: PassengerCart
  animal: Animal
  seats: number[]
  phase: "road" | "parking" | "parked" | "boarding" | "leaving"
  pose: CartPose
  progress: number
  parking?: ShrineParking
  intent?: "visit"
  distance: number
  animalDistance: number
  animalHeading: number
  retry: number
  /** Check the whole convoy ahead once per road tile/direction or building edit. */
  diversionCheck?: number
  diversionBuildings?: GameMap["buildings"]
}
export interface PartyPack { kind: PackAnimal; handler: number; progress: number; pose: CartPose; distance: number }

/** Personal IDs and appearance never change when allocating transport. Keep at
 * least one walker, and favor walking companies over a road full of wagons. */
export function partyLoadout(id: number, count: number) {
  const rng = makeRng(deriveSeed(id, 0x43415254)), roll = rng()
  const cart = count >= 4 && roll < .55 ? { style: count >= 8 && rng() < .7 ? "rear" as const : "bench" as const,
    animal: (["donkey", "horse", "ox"] as const)[Math.floor(rng() * 3)] } : undefined
  return { cart, packs: !cart && count >= 3 && roll < .9 ? 1 + (count >= 10 && rng() < .5 ? 1 : 0) : 0 }
}
export function ensurePartyTransport(party: TravelParty, members: SimTraveler[], map: GameMap, scale: number) {
  if (party.transportInitialized || !members.length) return
  party.transportInitialized = true
  const loadout = partyLoadout(party.id, members.length), leader = members[0]
  if (loadout.cart) {
    const { style, animal } = loadout.cart, wheelbase = -cartOffset(animal) * scale
    const pose = roadCartPose(map, party.progress, party.direction, wheelbase, scale)
    // An obstructed initial position keeps this company on foot.
    if (convoyBuildingsClear(map, pose, animal, scale)) {
      party.transport = { style, animal, seats: members.slice(0, Math.min(style === "rear" ? 6 : 2, members.length - 1)).map(s => s.id),
        phase: "road", pose, progress: party.progress, distance: 0, animalDistance: 0, animalHeading: pose.heading, retry: 0 }
      boardParty(party, members, scale)
    }
  }
  party.packs = Array.from({ length: loadout.packs }, (_, i) => {
    const handler = members[Math.min(members.length - 1, i * 5)], kind = (["donkey", "horse", "ox"] as const)[(party.id + i) % 3]
    const progress = advanceCartProgress(map, handler.progress, -party.direction * 1.1 * scale)
    return { kind, handler: handler.id, progress, pose: roadCartPose(map, progress, party.direction, 0, scale), distance: 0 }
  })
  void leader
}
export function seatParty(party: TravelParty, members: SimTraveler[], scale: number) {
  const cart = party.transport
  if (!cart) return
  for (const s of members) {
    const seat = cart.seats.indexOf(s.id)
    if (seat < 0 || !s.partyRiding) continue
    Object.assign(s, seatPoint(seat, cart.pose, scale))
    s.progress = cart.progress; s.direction = party.direction
  }
}
export function boardParty(party: TravelParty, members: SimTraveler[], scale: number) {
  const cart = party.transport!
  for (const s of members) s.partyRiding = cart.seats.includes(s.id)
  seatParty(party, members, scale)
}
/** The context must hold only nearby trunks and obstacles, as the vendor parking
 * context does; the parking search samples clearance thousands of times. */
export function parkParty(party: TravelParty, map: GameMap, scale: number, context: ParkingContext, occupied: CartPose[], intent: "visit") {
  const cart = party.transport!
  if (cart.retry > 0) return false
  cart.retry = 8
  const parking = shrineParking(map, cart.progress, party.direction, -cartOffset(cart.animal) * scale,
    cart.animal, scale, occupied, context, false)
  if (!parking) return false
  cart.parking = parking; cart.phase = "parking"; cart.intent = intent
  party.reason = "Pulling off the road together"
  return true
}
/** Turn the wagon on the spot to face the company's new direction. */
export function turnPartyCart(party: TravelParty, map: GameMap, scale: number) {
  const cart = party.transport
  if (!cart || cart.phase !== "road") return
  cart.pose = roadCartPose(map, cart.progress, party.direction, -cartOffset(cart.animal) * scale, scale)
  cart.animalHeading = cart.pose.heading
}
/** Move only on the existing cart curves, the company's shared detour and validated
 * parking routes. Distances belong to axle and animal separately, keeping wheel
 * roll and hoof plants honest. Returns whether a maneuver finished, or on the
 * road, whether the wagon could advance at all. */
export function movePartyCart(party: TravelParty, map: GameMap, scale: number, speed: number, dt: number): boolean {
  const cart = party.transport!
  cart.distance = cart.animalDistance = 0
  if (dt <= 0 || !["road", "parking", "leaving"].includes(cart.phase)) return false
  const wheelbase = -cartOffset(cart.animal) * scale, previous = cart.pose
  let pose: CartPose, progress = cart.progress, done = false, routeDistance = 0
  const travel = Math.min(speed, animalWalkSpeed(cart.animal, scale)) * dt
  if (travel <= 0 && cart.phase === "road") return true
  if (cart.phase === "road") {
    const length = map.road!.length - 1, cut = party.diversion
    const span = cut ? party.direction * (cut.end - cut.start) : 0
    const along = cut && span > 0 ? party.direction * partyRoadDelta(cart.progress, cut.start, length) / span : -1
    // Wrapped progress can round just below the endpoint; let the wagon leave
    // while its followers still need the shared detour behind it.
    if (cut && along >= -1e-9 && along < 1 - 1e-9) {
      // Follow every planned bend, even when a large tick crosses waypoints.
      // Cutting straight to its endpoint can drag the trailing axle into a wall.
      const distance = Math.min(cut.length, Math.max(0, along) * cut.length + travel)
      let axleDistance = 0
      const next = driveRouteSegment(previous, diversionPoints(cut), Math.max(0, along) * cut.length, distance,
        wheelbase, (p, heading) => {
          axleDistance += p.distance
          return convoyBuildingsClear(map, p, cart.animal, scale, heading)
        })
      if (!next || !convoyBuildingsClear(map, next, cart.animal, scale)) return false
      pose = { ...next, distance: axleDistance }
      progress = distance >= cut.length ? ((cut.end % length) + length) % length
        : ((cut.start + party.direction * distance / cut.length * span) % length + length) % length
    } else {
      progress = advanceCartProgress(map, cart.progress, party.direction * travel)
      const wrapped = progress < 0 || progress >= length
      progress = ((progress % length) + length) % length
      pose = roadCartPose(map, progress, party.direction, wheelbase, scale, wrapped ? undefined : previous)
      if (!convoyBuildingsClear(map, pose, cart.animal, scale)) return false
    }
  } else {
    const parking = cart.parking!, route = cart.phase === "parking" ? parking.entry : parking.exit
    routeDistance = Math.min(routeLength(route), parking.distance + travel)
    pose = followCart(previous, routePoint(route, routeDistance), wheelbase)
    done = routeDistance >= routeLength(route) - 1e-6
    if (!parkingClear(map, pose, cart.animal, scale, { trees: [] })) return false
  }
  const animalDistance = Math.hypot(pose.hitch.x - previous.hitch.x, pose.hitch.z - previous.hitch.z)
  cart.animalHeading = animalDistance > 1e-7 ? Math.atan2(pose.hitch.x - previous.hitch.x, pose.hitch.z - previous.hitch.z) : cart.animalHeading
  cart.distance = pose.distance < 2 ? pose.distance : 0
  cart.animalDistance = animalDistance < 2 ? animalDistance : 0
  cart.pose = pose; cart.progress = progress
  if (cart.phase !== "road") cart.parking!.distance = routeDistance
  if (done && cart.phase === "parking") { cart.phase = "parked"; cart.parking!.distance = 0 }
  else if (done && cart.phase === "leaving") { cart.phase = "road"; cart.progress = cart.parking!.returnProgress; cart.parking = undefined }
  return cart.phase === "road" ? true : done
}

/** Pack handlers keep their animal in the following space reserved by partySlots.
 * A formed company places the animal directly; after a stop it catches up at its
 * own walking pace. At stops the load remains at the roadside with the animal; it
 * never follows a pedestrian shortcut through a building or teleports to its handler. */
export function stepPartyPacks(party: TravelParty, states: ReadonlyMap<number, SimTraveler>, map: GameMap, scale: number, dt: number) {
  const length = map.road!.length - 1
  for (const pack of party.packs ?? []) {
    pack.distance = 0
    if (!party.members.includes(pack.handler)) pack.handler = party.members.find(id => !party.packs?.some(p => p !== pack && p.handler === id)) ?? party.members[0]
    const handler = states.get(pack.handler)
    if (!handler || party.stage !== "traveling" || handler.activity !== "walking" || dt <= 0) continue
    const place = advanceCartProgress(map, handler.progress, -party.direction * 1.1 * scale)
    let progress = place
    if (!party.formed) {
      const gap = party.direction * partyRoadDelta(place, pack.progress, length)
      if (gap <= 0) continue
      progress = advanceCartProgress(map, pack.progress, party.direction * Math.min(gap, animalWalkSpeed(pack.kind, scale) * dt))
    }
    const wrapped = ((progress % length) + length) % length
    if (Math.abs(partyRoadDelta(wrapped, pack.progress, length)) < 1e-9) continue
    const pose = roadCartPose(map, wrapped, party.direction, 0, scale)
    if (!convoyBuildingsClear(map, pose, pack.kind, scale * 1.3)) continue
    pack.distance = Math.hypot(pose.hitch.x - pack.pose.hitch.x, pose.hitch.z - pack.pose.hitch.z)
    pack.pose = pose; pack.progress = wrapped
  }
}
