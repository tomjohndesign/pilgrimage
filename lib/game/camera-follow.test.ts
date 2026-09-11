import { afterEach, expect, it } from "vitest"
import { followPoint } from "./camera-follow"
import { monkPositionRegistry } from "./monks"
import { simRegistry } from "./sim"
import { wildlifeRegistry } from "./wildlife/registry"

afterEach(() => {
  simRegistry.current = null
  monkPositionRegistry.current = null
  wildlifeRegistry.current = null
})

function sim(travelers: Array<{ id: number; x: number; z: number; partyId?: number }>, parties: Array<{ id: number; members: number[] }> = []) {
  simRegistry.current = {
    travelers: new Map(travelers.map(t => [t.id, t])),
    parties: new Map(parties.map(p => [p.id, p])),
  } as unknown as NonNullable<typeof simRegistry.current>
}

it("follows a lone traveler at their own position", () => {
  sim([{ id: 1, x: 2, z: 3 }])
  expect(followPoint({ kind: "traveler", id: 1 })).toEqual({ x: 2, z: 3 })
})

it("follows the centre of a traveler's party, ignoring members who have left", () => {
  sim([{ id: 1, x: 0, z: 0, partyId: 7 }, { id: 2, x: 4, z: 2, partyId: 7 }], [{ id: 7, members: [1, 2, 99] }])
  expect(followPoint({ kind: "traveler", id: 1 })).toEqual({ x: 2, z: 1 })
  expect(followPoint({ kind: "traveler", id: 2 })).toEqual({ x: 2, z: 1 })
})

it("keeps the selected traveler in view when a companion re-enters at the far road end", () => {
  sim([{ id: 1, x: -90, z: -80, partyId: 7 }, { id: 2, x: -86, z: -80, partyId: 7 }, { id: 3, x: 95, z: 76, partyId: 7 }],
    [{ id: 7, members: [1, 2, 3] }])
  expect(followPoint({ kind: "traveler", id: 1 })).toEqual({ x: -88, z: -80 })
  expect(followPoint({ kind: "traveler", id: 3 })).toEqual({ x: 95, z: 76 })
})

it("ends the follow once the traveler has left the world", () => {
  sim([])
  expect(followPoint({ kind: "traveler", id: 1 })).toBeNull()
  expect(followPoint(null)).toBeNull()
  expect(followPoint({ kind: "relic" })).toBeNull()
})

it("follows monks and living animals by their registries", () => {
  monkPositionRegistry.current = new Map([[5, { x: 1, y: 0, z: -1 }]])
  expect(followPoint({ kind: "monk", id: 5 })).toEqual({ x: 1, z: -1 })
  expect(followPoint({ kind: "monk", id: 6 })).toBeNull()
  wildlifeRegistry.current = { animals: [{ x: 3, z: 4, reserve: false }, { x: 0, z: 0, reserve: true }] } as unknown as NonNullable<typeof wildlifeRegistry.current>
  expect(followPoint({ kind: "animal", id: 0 })).toEqual({ x: 3, z: 4 })
  expect(followPoint({ kind: "animal", id: 1 })).toBeNull()
})
