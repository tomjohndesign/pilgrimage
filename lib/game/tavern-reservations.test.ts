import { describe, expect, it } from "vitest"
import type { SimTraveler } from "./sim"
import { TavernReservations } from "./tavern-reservations"

function guest(id: number, buildingId = "tavern", seatId = "bench"): Pick<SimTraveler, "id" | "tavernVisit"> {
  const tile = { x: 0, z: 0 }, point = { ...tile, y: 0 }
  return { id, tavernVisit: { plan: { buildingId, counter: { tile, point },
    seat: { id: seatId, tile, point, heading: 0 }, route: [] }, served: false, returnTo: null } }
}

describe("shared tavern reservations", () => {
  it("keeps a shared seat occupied until its last visitor releases it", () => {
    const a = guest(1), b = guest(2), people = new Map([[a.id, a], [b.id, b]])
    const seats = new TavernReservations(people)
    expect(seats.has("tavern:bench")).toBe(true)
    a.tavernVisit = undefined
    expect(seats.has("tavern:bench")).toBe(true)
    b.tavernVisit = undefined
    expect(seats.has("tavern:bench")).toBe(false)
    a.tavernVisit = guest(1).tavernVisit
    seats.update(a)
    expect(seats.has("tavern:bench")).toBe(true)
  })

  it("exposes new reservations and seat changes to later customers", () => {
    const a = guest(1), people = new Map([[a.id, a]])
    a.tavernVisit = undefined
    const seats = new TavernReservations(people)
    expect(seats.has("tavern:bench")).toBe(false)
    a.tavernVisit = guest(1).tavernVisit
    seats.update(a)
    expect(seats.has("tavern:bench")).toBe(true)
    a.tavernVisit = guest(1, "other").tavernVisit
    seats.update(a)
    expect(seats.has("tavern:bench")).toBe(false)
    expect(seats.has("other:bench")).toBe(true)
  })

  it("releases removed and replaced travelers without releasing another owner's seat", () => {
    const a = guest(1), b = guest(2), people = new Map([[a.id, a], [b.id, b]])
    const seats = new TavernReservations(people)
    people.delete(a.id)
    expect(seats.has("tavern:bench")).toBe(true)
    const replacement = guest(2, "other")
    people.set(2, replacement)
    seats.update(replacement)
    expect(seats.has("tavern:bench")).toBe(false)
    expect(seats.has("other:bench")).toBe(true)
  })
})
