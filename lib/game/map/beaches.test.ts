import { expect, it } from "vitest"
import { beachAccess } from "./beaches"
import { generateElevation } from "./elevation"

it("keeps sand on low graded shores and off elevated ledges, even beside water", () => {
  const kind = new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0])
  const e = generateElevation(1, 8, 1, kind)
  e.height = [-1.4, -0.95, -0.8, 0, -1.4, 0, 0, 0]
  const water = { surface: [-1, 0, 0, 0, -1, 0, 0, 0], depth: Array.from(kind), flow: {} }
  const sandy = beachAccess(e, 8, 1, kind, water)
  expect(Array.from(sandy)).toEqual([0, 1, 1, 0, 0, 0, 0, 0])
  // A steep rendered tile cannot become a sandy ramp just because its centre is low.
  e.corners = e.height.flatMap(h => [h, h, h, h])
  e.corners[5] += 0.5
  expect(beachAccess(e, 8, 1, kind, water)[1]).toBe(0)
})
