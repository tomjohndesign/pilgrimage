import { cartOffset, RIG_TO_WORLD } from "./transport/assets"
import type { PartyTransport, PartyPack } from "./transport/party"
import { deriveSeed, makeRng } from "./rng"
import type { Traveler, TravelerTypeId } from "./travelers"
import type { SimTraveler } from "./sim"

export interface PartyMembership {
  id: number
  name: string
  slot: number
  partnerId?: number
}

export interface TravelParty {
  transportInitialized?: boolean
  transport?: PartyTransport
  packs?: PartyPack[]
  id: number
  name: string
  members: number[]
  stage: "traveling" | "camping" | "returning" | "visiting"
  reason: string
  direction: 1 | -1
  singleFile: boolean
  cooldown: number
  retry: number
  elapsed: number
  decisions: number
  visitPending: number[]
  visitStarted: number[]
}

const WALKING_CALLINGS: TravelerTypeId[] = ["peasant", "pilgrim", "friar", "merchant"]

/** Independent stream: grouping never rerolls a person's appearance, skills or purse.
 * Chunk boundaries depend on the first ID, so raising traffic preserves full parties. */
export function withTravelParties(travelers: readonly Traveler[], seed: number): Traveler[] {
  const memberships = new Map<number, PartyMembership>()
  for (const calling of WALKING_CALLINGS) {
    const people = travelers.filter(t => t.type.id === calling).sort((a, b) => a.id - b.id)
    for (let first = 0; first < people.length;) {
      const leader = people[first]
      const rng = makeRng(deriveSeed(seed ^ 0x50415254, leader.id))
      const roll = rng()
      const size = roll < .14 ? 1 : roll < .55 ? 2 + Math.floor(rng() * 3)
        : roll < .82 ? 5 + Math.floor(rng() * 4) : roll < .96 ? 9 + Math.floor(rng() * 6)
          : 15 + Math.floor(rng() * 6)
      const members = people.slice(first, first + size)
      if (members.length > 1) members.forEach((person, slot) => memberships.set(person.id, {
        id: leader.id, slot, name: calling === "friar" ? `Brothers of the road ${leader.id + 1}`
          : `${leader.name.split(" ")[0]}’s company`,
      }))
      if (calling !== "friar" && members.length > 1) for (let slot = 0; slot + 1 < members.length; slot += 2) {
        if (rng() >= .3) continue
        const a = members[slot], b = members[slot + 1]
        if (a.attributes.age < 18 || b.attributes.age < 18) continue
        memberships.get(a.id)!.partnerId = b.id
        memberships.get(b.id)!.partnerId = a.id
      }
      first += size
    }
  }
  return travelers.map(t => memberships.has(t.id) ? { ...t, party: memberships.get(t.id) } : t)
}

/** Signed distance around the existing looping road, including the map-edge seam. */
export function partyRoadDelta(to: number, from: number, length: number): number {
  return ((to - from + length / 2) % length + length) % length - length / 2
}

/** Uneven, stable personal spaces with slow independent shifts while walking.
 * Adjacent companions remain close, but never share rigid rows or columns. */
export function partySlots(id: number, singleFile: boolean, length: number, count: number, seconds = 0) {
  const rng = makeRng(deriveSeed(id, 0x464f524d))
  const scale = Math.min(1, length / Math.max(6, count * 3))
  let side = rng() < .5 ? -1 : 1
  let behind = 0
  return Array.from({ length: count }, (_, i) => {
    const gap = rng(), width = rng(), phase = rng() * Math.PI * 2, rhythm = .12 + rng() * .08
    // Some follow on the same side; leave them extra room instead of imposing
    // a left-right cadence. Other companions wander nearer the road's centre.
    const sameSide = width < .35
    if (i && !sameSide) side *= -1
    if (i) behind += singleFile ? .8 + gap * .25 : (sameSide ? .8 : .45) + gap * .65
    return {
      behind: (behind + (singleFile ? .05 : .1) * Math.sin(seconds * rhythm + phase)) * scale,
      lane: singleFile ? .08 + width * .06
        : side * (.08 + width * .3) + .065 * Math.sin(seconds * rhythm * .7 + phase),
    }
  })
}

export function syncTravelParties(parties: Map<number, TravelParty>, travelers: readonly Traveler[], states: ReadonlyMap<number, SimTraveler>) {
  const rosters = new Map<number, Traveler[]>()
  for (const t of travelers) {
    const s = states.get(t.id)
    if (!t.party || !s || s.home || s.employer) continue
    const members = rosters.get(t.party.id) ?? []
    members.push(t); rosters.set(t.party.id, members)
    s.partyId = t.party.id
  }
  for (const s of states.values()) if (s.partyId !== undefined && (!rosters.get(s.partyId)?.some(t => t.id === s.id))) {
    s.partyId = undefined; s.partyWaiting = undefined; s.partySpeed = undefined; s.partyRiding = false; s.partyBoarding = false
  }
  for (const id of parties.keys()) if (!rosters.has(id)) parties.delete(id)
  for (const [id, people] of rosters) {
    people.sort((a, b) => a.party!.slot - b.party!.slot)
    const existing = parties.get(id)
    if (existing) existing.members = people.map(t => t.id)
    else parties.set(id, { id, name: people[0].party!.name, members: people.map(t => t.id),
      stage: "traveling", reason: "Traveling together", direction: states.get(people[0].id)!.direction,
      singleFile: false, cooldown: 0, retry: 0, elapsed: 0, decisions: 0, visitPending: [], visitStarted: [] })
  }
}

/** Leave room for the actual wagon and a normal personal gap behind its tail. */
export function partyFormation(party: TravelParty, members: number[], length: number, seconds = 0, scale = 1) {
  const slots = partySlots(party.id, party.singleFile, length, members.length, seconds)
  if (party.transport) {
    const tail = -cartOffset(party.transport.animal) * scale + RIG_TO_WORLD * scale
    slots.forEach((slot, i) => { if (i) slot.behind += tail; else slot.lane = 0 })
  }
  for (const pack of party.packs ?? []) {
    const handler = members.indexOf(pack.handler)
    if (handler >= 0) slots.forEach((slot, i) => { if (i > handler) slot.behind += 1.5 * scale })
  }
  return slots
}

/** Calculate from one snapshot, never from already-stepped neighbors. Positions remain
 * on the game's curved road lanes; a fast member can only slow down or wait. */
export function preparePartyPace(party: TravelParty, members: SimTraveler[], length: number, dt: number,
  naturalSpeed: (s: SimTraveler) => number, seconds = 0, scale = 1) {
  if (!members.length || dt <= 0) return
  const origin = members[0].progress
  const slots = partyFormation(party, members.map(s => s.id), length, seconds, scale)
  const positions = members.map(s => party.direction * partyRoadDelta(s.progress, origin, length))
  const front = Math.min(...positions.map((p, i) => p + slots[i].behind))
  const speed = Math.min(...members.map(naturalSpeed)) * .85
  const interrupted = members.some(s => s.praying || (s.activity !== "walking" && s.activity !== "fleeing"))
  members.forEach((s, i) => {
    s.laneOffset = slots[i].lane
    s.direction = party.direction
    s.partySpeed = s.roadShortcut ? naturalSpeed(s) : interrupted ? 0
      : Math.min(naturalSpeed(s), Math.max(0, (front + speed * dt - slots[i].behind - positions[i]) / dt))
    const pack = party.packs?.find(pack => pack.handler === s.id)
    if (pack && party.direction * partyRoadDelta(s.progress, pack.progress, length) > 1.45 * scale) s.partySpeed = 0
    s.partyWaiting = s.partySpeed < .01
  })
}
