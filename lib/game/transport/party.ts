import type { GameMap } from "../map/types"
import type { SimTraveler } from "../sim"
import type { TravelParty } from "../travel-parties"
import { partyRoadDelta, partyFormation } from "../travel-parties"
import { deriveSeed, makeRng } from "../rng"
import { animalWalkSpeed, cartOffset, type Animal } from "./assets"
import { roadCartPose } from "./bridge-guide"
import { followCart, type CartPose } from "./follow"
import { convoyBuildingsClear, parkingClear, shrineParking, type ShrineParking } from "./navigation"
import { routeLength, routePoint } from "./roadside"
import { advanceCartProgress } from "./route"
import { seatPoint, type PassengerCart, type PackAnimal } from "./party-assets"
import type { TreePlacement } from "../trees/placement"

export interface PartyTransport {
  style: PassengerCart
  animal: Animal
  seats: number[]
  phase: "road" | "parking" | "parked" | "boarding" | "leaving"
  pose: CartPose
  progress: number
  parking?: ShrineParking
  intent?: "camp" | "visit"
  distance: number
  animalDistance: number
  animalHeading: number
  retry: number
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
    const pose = roadCartPose(map, leader.progress, party.direction, wheelbase, scale)
    // An obstructed initial position keeps this company on foot.
    if (convoyBuildingsClear(map, pose, animal, scale)) {
      party.transport = { style, animal, seats: members.slice(0, Math.min(style === "rear" ? 6 : 2, members.length - 1)).map(s => s.id),
        phase: "road", pose, progress: leader.progress, distance: 0, animalDistance: 0, animalHeading: pose.heading, retry: 0 }
      boardParty(party, members, scale)
    }
  }
  party.packs = Array.from({ length: loadout.packs }, (_, i) => {
    const handler = members[Math.min(members.length - 1, i * 5)], kind = (["donkey", "horse", "ox"] as const)[(party.id + i) % 3]
    const progress = advanceCartProgress(map, handler.progress, -party.direction * 1.1 * scale)
    return { kind, handler: handler.id, progress, pose: roadCartPose(map, progress, party.direction, 0, scale), distance: 0 }
  })
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
export function parkParty(party: TravelParty, map: GameMap, scale: number, trees: readonly TreePlacement[], occupied: CartPose[], intent: "camp" | "visit") {
  const cart = party.transport!
  if (cart.retry > 0) return false
  cart.retry = 8
  const parking = shrineParking(map, cart.progress, party.direction, -cartOffset(cart.animal) * scale,
    cart.animal, scale, occupied, { trees }, false)
  if (!parking) return false
  cart.parking = parking; cart.phase = "parking"; cart.intent = intent
  party.reason = "Pulling off the road together"
  return true
}
/** Move only on the existing cart curves and validated parking routes. Distances
 * belong to axle and animal separately, keeping wheel roll and hoof plants honest. */
export function movePartyCart(party: TravelParty, map: GameMap, scale: number, speed: number, dt: number) {
  const cart = party.transport!
  cart.distance = cart.animalDistance = 0
  if (dt <= 0 || !["road", "parking", "leaving"].includes(cart.phase)) return false
  const wheelbase = -cartOffset(cart.animal) * scale, previous = cart.pose
  let pose: CartPose, progress = cart.progress, done = false, routeDistance = 0
  const travel = Math.min(speed, animalWalkSpeed(cart.animal, scale)) * dt
  if (cart.phase === "road") {
    progress = advanceCartProgress(map, cart.progress, party.direction * travel)
    const length = map.road!.length - 1
    const wrapped = progress < 0 || progress >= length
    progress = ((progress % length) + length) % length
    pose = roadCartPose(map, progress, party.direction, wheelbase, scale, wrapped ? undefined : previous)
  } else {
    const parking = cart.parking!, route = cart.phase === "parking" ? parking.entry : parking.exit
    routeDistance = Math.min(routeLength(route), parking.distance + travel)
    pose = followCart(previous, routePoint(route, routeDistance), wheelbase)
    done = routeDistance >= routeLength(route) - 1e-6
  }
  if (cart.phase === "road" ? !convoyBuildingsClear(map, pose, cart.animal, scale)
    : !parkingClear(map, pose, cart.animal, scale, { trees: [] })) return false
  const animalDistance = Math.hypot(pose.hitch.x - previous.hitch.x, pose.hitch.z - previous.hitch.z)
  cart.animalHeading = animalDistance > 1e-7 ? Math.atan2(pose.hitch.x - previous.hitch.x, pose.hitch.z - previous.hitch.z) : cart.animalHeading
  cart.distance = pose.distance < 2 ? pose.distance : 0
  cart.animalDistance = animalDistance < 2 ? animalDistance : 0
  cart.pose = pose; cart.progress = progress
  if (cart.phase !== "road") cart.parking!.distance = routeDistance
  if (done && cart.phase === "parking") { cart.phase = "parked"; cart.parking!.distance = 0 }
  else if (done && cart.phase === "leaving") { cart.phase = "road"; cart.progress = cart.parking!.returnProgress; cart.parking = undefined }
  return done
}

/** Pack handlers keep their animal in the following space reserved by partySlots.
 * At stops the load remains at the roadside with the animal; it never follows a
 * pedestrian shortcut through a building or teleports to its handler. */
export function stepPartyPacks(party: TravelParty, states: ReadonlyMap<number, SimTraveler>, map: GameMap, scale: number, dt: number) {
  for (const pack of party.packs ?? []) {
    pack.distance = 0
    if (!party.members.includes(pack.handler)) pack.handler = party.members.find(id => !party.packs?.some(p => p !== pack && p.handler === id)) ?? party.members[0]
    const handler = states.get(pack.handler)
    if (!handler || party.stage !== "traveling" || handler.activity !== "walking" || dt <= 0) continue
    const target = advanceCartProgress(map, handler.progress, -party.direction * 1.1 * scale)
    const gap = party.direction * partyRoadDelta(target, pack.progress, map.road!.length - 1)
    const progress = advanceCartProgress(map, pack.progress, party.direction * Math.min(Math.max(0, gap), animalWalkSpeed(pack.kind, scale) * dt))
    const length = map.road!.length - 1, wrapped = ((progress % length) + length) % length
    const pose = roadCartPose(map, wrapped, party.direction, 0, scale)
    if (!convoyBuildingsClear(map, pose, pack.kind, scale * 1.3)) continue
    pack.distance = Math.hypot(pose.hitch.x - pack.pose.hitch.x, pose.hitch.z - pack.pose.hitch.z)
    pack.pose = pose; pack.progress = wrapped
  }
}

/** Cap the cart against walkers' actual positions, including acceleration and
 * bends where cart-route distance differs from pedestrian road progress. */
export function companyCartSpeed(party: TravelParty, members: SimTraveler[], map: GameMap, scale: number, seconds: number, requested: number, dt: number) {
  const cart = party.transport!
  const walkers = members.filter(s => !cart.seats.includes(s.id))
  if (!walkers.length || dt <= 0) return requested
  const slots = partyFormation(party, [cart.seats[0], ...walkers.map(s=>s.id)], map.road!.length-1, seconds, scale)
  const clear = (speed: number) => {
    const next = advanceCartProgress(map, cart.progress, party.direction * speed * dt)
    return walkers.every((s,i) => party.direction * partyRoadDelta(next,s.progress,map.road!.length-1) <= slots[i+1].behind + .15 * scale)
  }
  if (clear(requested)) return requested
  let lo=0, hi=requested
  for(let i=0;i<12;i++) { const mid=(lo+hi)/2;if(clear(mid))lo=mid;else hi=mid }
  return lo
}
