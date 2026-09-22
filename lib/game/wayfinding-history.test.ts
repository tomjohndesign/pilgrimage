import { expect, it } from "vitest"
import type { DebugJourney } from "./wayfinding-debug"
import { WayfindingHistory } from "./wayfinding-history"
import { DEFAULT_WAYFINDING, wayfindingSchema } from "./wayfinding-settings"

const point = (x: number, z = 0) => ({ x, y: 0, z })
const journey = (route = [point(0), point(1), point(2)], destination = "well"): DebugJourney =>
  ({ kind: "traveler", id: 1, activity: "toWater", destination, route, remaining: 2 })

it("ignores movement and consumed waypoints, but records a detour to the same destination", () => {
  const history = new WayfindingHistory()
  history.observe([journey()], 0)
  history.observe([journey([point(.5), point(1), point(2)])], 1)
  history.observe([journey([point(1.2), point(2)])], 2)
  expect(history.changes).toEqual([])
  const next = journey([point(1.2), point(1.2, 1), point(2, 1), point(2)])
  history.observe([next], 3)
  expect(history.changes).toHaveLength(1)
  expect(history.changes[0].before.route).toEqual([point(1.2), point(2)])
  next.route.shift(); next.route[0].x = 99
  expect(history.changes[0].after.route[1]).toEqual(point(1.2, 1))
})

it("records destination changes and includes both buildings in selected scope", () => {
  const history = new WayfindingHistory()
  history.observe([journey()], 0)
  history.observe([journey(undefined, "bread")], 1)
  for (const id of ["well", "bread"]) expect(history.matching({ kind: "building", id }, "selected")).toHaveLength(1)
  expect(history.matching({ kind: "building", id: "unrelated" }, "selected")).toEqual([])
  expect(history.matching(null, "all")).toHaveLength(1)
})

it("records a shortened route when the actor has not walked its removed waypoints", () => {
  const history = new WayfindingHistory()
  history.observe([journey([point(0), point(0, 1), point(2, 1), point(2)])], 0)
  history.observe([journey([point(0), point(2)])], 1)
  expect(history.changes).toHaveLength(1)
})

it("ignores continuous road lane motion but records a reversal", () => {
  const history = new WayfindingHistory()
  history.observe([{ ...journey(), intent: "road:main:1" }], 0)
  history.observe([{ ...journey([point(1, .2), point(2, .2)]), intent: "road:main:1" }], 1)
  expect(history.changes).toEqual([])
  history.observe([{ ...journey([point(1, .2), point(0, -.2)]), intent: "road:main:-1" }], 2)
  expect(history.changes).toHaveLength(1)
})

it("keeps arrivals, expires automatic overlays, pins old comparisons, and bounds history", () => {
  const history = new WayfindingHistory()
  history.observe([journey()], 0)
  history.observe([journey([point(2)])], 1)
  history.observe([journey([point(2)])], 50)
  expect(history.changes).toHaveLength(1)
  expect(history.visible(null, "all", 30, null)).toEqual([])
  expect(history.visible(null, "all", 30, 1)).toHaveLength(1)
  for (let time = 51; time < 200; time++) history.observe([journey(undefined, `well-${time}`)], time, 1)
  expect(history.changes).toHaveLength(100)
  expect(history.visible(null, "all", 30, 1)).toHaveLength(1)
  expect(history.visible(null, "all", 30, null)).toHaveLength(1)
  history.clear()
  expect(history.changes).toEqual([])
})

it("does not connect despawned people or disabled recording to later routes", () => {
  const history = new WayfindingHistory()
  history.observe([journey()], 0)
  history.observe([], 1)
  history.observe([journey(undefined, "bread")], 2)
  history.suspend()
  history.observe([journey()], 3)
  expect(history.changes).toEqual([])
})

it("accepts older settings JSON and validates change controls", () => {
  const { showRouteChanges: _show, routeChangeSeconds: _seconds, ...old } = DEFAULT_WAYFINDING
  expect(wayfindingSchema.parse(old)).toMatchObject({ showRouteChanges: false, routeChangeSeconds: 30 })
  expect(wayfindingSchema.safeParse({ ...old, routeChangeSeconds: -1 }).success).toBe(false)
})
