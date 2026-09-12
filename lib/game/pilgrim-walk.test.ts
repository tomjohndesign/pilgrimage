import { afterEach, expect, it } from "vitest"
import { blendAngle, walkPoint, walkTarget, walkViewIndex, WALK_TURN_MARGIN } from "./pilgrim-walk"
import { monkPositionRegistry } from "./monks"
import { ISO_YAW_BASE } from "./render/iso"
import { simRegistry } from "./sim"

afterEach(() => {
  simRegistry.current = null
  monkPositionRegistry.current = null
})

function sim(travelers: Array<{ id: number; x: number; z: number; partyId?: number }>, parties: Array<{ id: number; members: number[] }> = []) {
  simRegistry.current = {
    travelers: new Map(travelers.map(t => [t.id, t])),
    parties: new Map(parties.map(p => [p.id, p])),
  } as unknown as NonNullable<typeof simRegistry.current>
}

/** The heading a walker holds to sit squarely in a given quarter view. */
const squarelyIn = (viewIndex: number) => ISO_YAW_BASE + viewIndex * (Math.PI / 2) + Math.PI

it("walks beside the chosen person, not the centre of their company", () => {
  sim([{ id: 1, x: 0, z: 0, partyId: 7 }, { id: 2, x: 4, z: 2, partyId: 7 }], [{ id: 7, members: [1, 2] }])
  expect(walkPoint({ kind: "traveler", id: 1 })).toEqual({ x: 0, z: 0 })
  expect(walkPoint({ kind: "traveler", id: 2 })).toEqual({ x: 4, z: 2 })
})

it("walks with a monk, and with nobody else", () => {
  monkPositionRegistry.current = new Map([[5, { x: 1, y: 0, z: -1 }]])
  expect(walkPoint({ kind: "monk", id: 5 })).toEqual({ x: 1, z: -1 })
  expect(walkPoint({ kind: "monk", id: 6 })).toBeNull()
  expect(walkPoint({ kind: "animal", id: 0 })).toBeNull()
  expect(walkPoint({ kind: "relic" })).toBeNull()
  expect(walkPoint(null)).toBeNull()
})

it("ends the walk once the traveler has left the world", () => {
  sim([])
  expect(walkPoint({ kind: "traveler", id: 1 })).toBeNull()
})

it("looks up the road ahead of the walker", () => {
  // Heading zero runs along +Z, so the camera holds a point that far up the road.
  expect(walkTarget({ x: 2, z: 3 }, 0, 1.5).z).toBeCloseTo(4.5)
  expect(walkTarget({ x: 2, z: 3 }, 0, 1.5).x).toBeCloseTo(2)
  const east = walkTarget({ x: 0, z: 0 }, Math.PI / 2, 2)
  expect(east.x).toBeCloseTo(2)
  expect(east.z).toBeCloseTo(0)
  expect(walkTarget({ x: 5, z: 5 }, 1.2, 0)).toEqual({ x: 5, z: 5 })
})

it("keeps the walker's road running up the screen, turning the short way round", () => {
  // Each view holds while the walker heads away from its own camera.
  for (const view of [-1, 0, 1, 2, 3]) {
    expect(walkViewIndex(view, squarelyIn(view))).toBe(view)
  }
  // A quarter turn of the road is a quarter turn of the view, either way.
  expect(walkViewIndex(0, squarelyIn(1))).toBe(1)
  expect(walkViewIndex(0, squarelyIn(-1))).toBe(-1)
  // Three quarters the long way round is one quarter the short way, and the
  // index stays near the one the yaw tween is already playing towards.
  expect(walkViewIndex(4, squarelyIn(3))).toBe(3)
  expect(walkViewIndex(-4, squarelyIn(1))).toBe(-3)
})

it("holds the view through a wandering road, and gives way past the turn", () => {
  const past = (amount: number) => squarelyIn(0) + amount * (Math.PI / 2)
  // Halfway between two views, and a little beyond: still the view in use.
  expect(walkViewIndex(0, past(0.5))).toBe(0)
  expect(walkViewIndex(0, past(0.5 + WALK_TURN_MARGIN / 2))).toBe(0)
  // Past the margin the next view takes over, and then holds in its turn.
  expect(walkViewIndex(0, past(0.5 + WALK_TURN_MARGIN * 2))).toBe(1)
  expect(walkViewIndex(1, past(0.5 + WALK_TURN_MARGIN * 2))).toBe(1)
})

it("settles a view left half-turned by a touch twist", () => {
  expect(walkViewIndex(0.4, squarelyIn(0))).toBe(0)
  expect(walkViewIndex(1.6, squarelyIn(2))).toBe(2)
})

it("eases a heading the short way round, however the angles are wound", () => {
  expect(blendAngle(0, 1, 0.5)).toBeCloseTo(0.5)
  // Across the ±π seam the turn is a short step, not almost a full circle.
  expect(blendAngle(Math.PI - 0.1, -Math.PI + 0.1, 1)).toBeCloseTo(Math.PI + 0.1)
  expect(blendAngle(1.2, 2.4, 0)).toBe(1.2)
  expect(blendAngle(1.2, 2.4, 5)).toBeCloseTo(2.4)
})
