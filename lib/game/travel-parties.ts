import { cartOffset, RIG_TO_WORLD } from "./transport/assets"
import type { PartyTransport, PartyPack } from "./transport/party"
import type { WalkingShortcut } from "./walking-shortcuts"
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
  /** Road progress of the formation's head. Every place in the company derives from it. */
  progress: number
  /** Eased pace of the whole company, in tiles per second. */
  speed: number
  /** Everyone stands in their place, so the places follow the head without personal pacing. */
  formed: boolean
  /** The road tile the head last entered; trouble, bridges and covered road are checked once per tile. */
  headTile: number
  /** One detour around a footprint on the road, walked by the whole company in turn. */
  diversion?: WalkingShortcut
  /** People the company moved this step; the road is worn once for all of them. */
  carried: number
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

interface SlotBase { behind: number; drift: number; lane: number; sway: number; phase: number; rhythm: number }

// Personal spaces are fixed per company; only their slow drift depends on the clock.
// Rolling them again every step was most of the old per-step formation cost.
const slotBases = new Map<string, SlotBase[]>()
function slotBasesFor(id: number, singleFile: boolean, length: number, count: number): SlotBase[] {
  const key = `${id}|${singleFile ? 1 : 0}|${count}|${length}`
  const cached = slotBases.get(key)
  if (cached) return cached
  if (slotBases.size >= 16384) slotBases.clear()
  const rng = makeRng(deriveSeed(id, 0x464f524d))
  const scale = Math.min(1, length / Math.max(6, count * 3))
  let side = rng() < .5 ? -1 : 1
  let behind = 0
  const bases = Array.from({ length: count }, (_, i) => {
    const gap = rng(), width = rng(), phase = rng() * Math.PI * 2, rhythm = .12 + rng() * .08
    // Some follow on the same side; leave them extra room instead of imposing
    // a left-right cadence. Other companions wander nearer the road's centre.
    const sameSide = width < .35
    if (i && !sameSide) side *= -1
    if (i) behind += singleFile ? .8 + gap * .25 : (sameSide ? .8 : .45) + gap * .65
    return {
      behind: behind * scale, drift: (singleFile ? .05 : .1) * scale,
      lane: singleFile ? .08 + width * .06 : side * (.08 + width * .3), sway: singleFile ? 0 : .065,
      phase, rhythm,
    }
  })
  slotBases.set(key, bases)
  return bases
}

/** Uneven, stable personal spaces with slow independent shifts while walking.
 * Adjacent companions remain close, but never share rigid rows or columns. */
export function partySlots(id: number, singleFile: boolean, length: number, count: number, seconds = 0) {
  return slotBasesFor(id, singleFile, length, count).map(base => ({
    behind: base.behind + base.drift * Math.sin(seconds * base.rhythm + base.phase),
    lane: base.lane + base.sway * Math.sin(seconds * base.rhythm * .7 + base.phase),
  }))
}

function createParty(id: number, people: Traveler[], leader: SimTraveler): TravelParty {
  return { id, name: people[0].party!.name, members: people.map(t => t.id),
    stage: "traveling", reason: "Traveling together", direction: leader.direction,
    singleFile: false, cooldown: 0, retry: 0, elapsed: 0, decisions: 0, visitPending: [], visitStarted: [],
    progress: leader.progress, speed: 0, formed: true, headTile: Math.floor(leader.progress), carried: 0 }
}

function leaveParty(s: SimTraveler) {
  s.partyId = undefined; s.partyWaiting = undefined; s.partySpeed = undefined
  s.partyRiding = false; s.partyBoarding = false; s.partyCarried = false
}

/** Full roster rebuild for a new simulation and after companions settle. */
export function syncTravelParties(parties: Map<number, TravelParty>, travelers: readonly Traveler[], states: ReadonlyMap<number, SimTraveler>) {
  const rosters = new Map<number, Traveler[]>()
  for (const t of travelers) {
    const s = states.get(t.id)
    if (!t.party || !s || s.home || s.employer) continue
    const members = rosters.get(t.party.id) ?? []
    members.push(t); rosters.set(t.party.id, members)
    s.partyId = t.party.id
  }
  for (const s of states.values()) if (s.partyId !== undefined && (!rosters.get(s.partyId)?.some(t => t.id === s.id))) leaveParty(s)
  for (const id of parties.keys()) if (!rosters.has(id)) parties.delete(id)
  for (const [id, people] of rosters) {
    people.sort((a, b) => a.party!.slot - b.party!.slot)
    const existing = parties.get(id)
    if (existing) existing.members = people.map(t => t.id)
    else parties.set(id, createParty(id, people, states.get(people[0].id)!))
  }
}

/** Per-step upkeep: drop anyone who settled, joined the monks or left the simulation.
 * Nothing is allocated while the rosters are unchanged. */
export function pruneTravelParties(parties: Map<number, TravelParty>, states: ReadonlyMap<number, SimTraveler>, joined: ReadonlyMap<number, unknown>) {
  for (const party of parties.values()) {
    for (let i = party.members.length - 1; i >= 0; i--) {
      const id = party.members[i], s = states.get(id)
      if (s && !s.home && !s.employer && !joined.has(id)) continue
      party.members.splice(i, 1)
      if (s) leaveParty(s)
    }
    if (!party.members.length) parties.delete(party.id)
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

/** Points of a shared detour: off the road, around the footprint, and back on. */
export function diversionPoints(cut: WalkingShortcut) {
  return [cut.from, ...(cut.via ?? []), cut.to]
}

/** After a stop, put the head where nobody has to walk backwards: at the wagon, or
 * ahead of whoever stands furthest forward relative to their place. */
export function regroupParty(party: TravelParty, members: readonly SimTraveler[], length: number, seconds: number, scale: number) {
  const slots = partyFormation(party, party.members, length, seconds, scale)
  const direction = party.direction
  if (party.transport) party.progress = party.transport.progress
  else {
    const origin = members[0].progress
    let lead = 0
    for (let i = 0; i < members.length; i++) {
      lead = Math.max(lead, direction * partyRoadDelta(members[i].progress, origin, length) + slots[i].behind)
    }
    party.progress = ((origin + direction * lead) % length + length) % length
  }
  party.formed = false
  party.speed = 0
  party.headTile = Math.floor(party.progress)
  party.diversion = undefined
}
