import type { SimTraveler } from "./sim"

type Guest = Pick<SimTraveler, "id" | "tavernVisit">

function seatKey(owner: Guest): string | undefined {
  const plan = owner.tavernVisit?.plan
  return plan?.seat ? `${plan.buildingId}:${plan.seat.id}` : undefined
}

/** One lazy index per simulation step. A paid seat can have several owners;
 * live checks keep it reserved until the last visitor leaves, and expose a
 * release immediately to later actors in the same step. */
export class TavernReservations {
  private seats = new Map<string, Set<Guest>>()

  constructor(private people: ReadonlyMap<number, Guest>) {
    for (const person of people.values()) this.update(person)
  }

  update(owner: Guest) {
    const key = seatKey(owner)
    if (key === undefined) return
    let owners = this.seats.get(key)
    if (!owners) { owners = new Set(); this.seats.set(key, owners) }
    owners.add(owner)
  }

  has(key: string): boolean {
    for (const owner of this.seats.get(key) ?? []) {
      if (this.people.get(owner.id) === owner && seatKey(owner) === key) return true
    }
    return false
  }
}
