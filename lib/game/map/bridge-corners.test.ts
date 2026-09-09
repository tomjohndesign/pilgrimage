import { describe, expect, it } from "vitest"
import { BRIDGE_CORNER_RADIUS, BRIDGE_DECK_HALF_WIDTH, bridgeCornerEdge, insideBridgeCorner } from "./bridge-corners"
import { bridgeCornerAt, bridgeLayout, BRIDGE_RISE } from "./bridges"
import { walkingSurface } from "./walking-surface"
import { TILE_HEIGHT } from "./terrain"
import { tileToWorldX, tileToWorldZ } from "./types"
import { ROAD_CORNER_SHOULDER_RADIUS } from "./road"
import { parseAsciiMap } from "./prototype-map"
import { turningMap } from "../transport/turning-demo"
import { cartRoutePoint } from "../transport/route"
import { cartOnRoute, followCart } from "../transport/follow"
import { convoyClear } from "../transport/navigation"
import { cartWheelContacts } from "../render/cart-wear"
import { cartOffset } from "../transport/assets"
import { BASE_CHARACTER_SCALE } from "../base-person/gait"

describe("bridge inside corner decks", () => {
  it("matches exact corner containment across the spatial index, including outside the map", () => {
    for (const scenario of ["bridge", "short_bridge", "compound_bridge"] as const) {
      const map = turningMap(scenario), corners = bridgeLayout(map).corners
      for (let z = -2; z <= map.depth + 2; z += .23) for (let x = -2; x <= map.width + 2; x += .23) {
        expect(bridgeCornerAt(map, tileToWorldX(map, x), tileToWorldZ(map, z)))
          .toBe(corners.find(corner => insideBridgeCorner(corner, x, z)))
      }
    }
  })
  it("joins both arms tangentially in all four orientations", () => {
    for (const sx of [-1, 1] as const) for (const sz of [-1, 1] as const) {
      const c = { x: 4, z: 4, sx, sz, radius: BRIDGE_CORNER_RADIUS, kind: "road" as const }
      const start = bridgeCornerEdge(c, 0), end = bridgeCornerEdge(c, 1), h = BRIDGE_DECK_HALF_WIDTH
      expect(start.x).toBeCloseTo(c.x + sx * h)
      expect(start.z).toBeCloseTo(c.z + sz * (h + c.radius))
      expect(end.x).toBeCloseTo(c.x + sx * (h + c.radius))
      expect(end.z).toBeCloseTo(c.z + sz * h)
      const near = bridgeCornerEdge(c, 0.001)
      expect(Math.abs(near.x - start.x)).toBeLessThan(Math.abs(near.z - start.z) * 0.001)
      for (const t of [0.3, 0.5, 0.7]) {
        const edge = bridgeCornerEdge(c, t), deck = bridgeCornerEdge(c, t, 0.01), water = bridgeCornerEdge(c, t, -0.01)
        expect(insideBridgeCorner(c, edge.x, edge.z)).toBe(true)
        expect(insideBridgeCorner(c, deck.x, deck.z)).toBe(true)
        expect(insideBridgeCorner(c, water.x, water.z)).toBe(false)
      }
    }
  })
  it("bounds the added deck by the swept track and available bridge arms", () => {
    for (const scenario of ["bridge"] as const) {
      const [corner] = bridgeLayout(turningMap(scenario)).corners, envelope = corner.envelope!
      expect(corner.radius).toBe(BRIDGE_CORNER_RADIUS)
      expect(corner.radius).toBeGreaterThan(ROAD_CORNER_SHOULDER_RADIUS)
      expect(envelope.reach).toBeLessThanOrEqual(BRIDGE_DECK_HALF_WIDTH + 4)
      const area = envelope.widths.reduce((sum,w) => sum+w*envelope.step,0)
      expect(area).toBeLessThan(1.5)
      expect(envelope.widths.every((w,i) => !i || w <= envelope.widths[i-1]+1e-6)).toBe(true)
    }
  })
  it("keeps adjacent landing inserts within half a tile instead of overlapping swept tails", () => {
    for (const scenario of ["short_bridge", "compound_bridge"] as const) {
      const map = turningMap(scenario), corners = bridgeLayout(map).corners
      const local = corners.filter(c => !c.envelope)
      expect(local.length).toBeGreaterThan(0)
      for (const c of local) {
        expect(c.radius).toBeLessThanOrEqual(0.5)
        const start = bridgeCornerEdge(c,0),end = bridgeCornerEdge(c,1)
        expect(Math.abs(start.z-c.z)).toBeLessThan(1)
        expect(Math.abs(end.x-c.x)).toBeLessThan(1)
      }
    }
  })
  it("supports the partial water tile without changing the underlying terrain", () => {
    const map = turningMap("bridge"), original = structuredClone(map), [corner] = bridgeLayout(map).corners
    expect(bridgeLayout(map).corners).toHaveLength(1)
    expect(corner.radius).toBe(BRIDGE_CORNER_RADIUS)
    const p = bridgeCornerEdge(corner, 0.5, 0.02), x = tileToWorldX(map, p.x), z = tileToWorldZ(map, p.z)
    expect(map.tiles[Math.round(p.z) * map.width + Math.round(p.x)]).toBe("water")
    expect(bridgeCornerAt(map, x, z)).toEqual(corner)
    expect(walkingSurface(map, x, z)).toEqual({ height: TILE_HEIGHT + BRIDGE_RISE, dx: 0, dz: 0 })
    const outside = bridgeCornerEdge(corner, 0.5, -0.1)
    expect(bridgeCornerAt(map, tileToWorldX(map, outside.x), tileToWorldZ(map, outside.z))).toBeUndefined()
    expect(map).toEqual(original)
  })
  it("leaves straight and suspended spans alone", () => {
    expect(bridgeLayout(parseAsciiMap(["==####=="])).corners).toEqual([])
    const map = turningMap("bridge")
    map.water = { surface: map.tiles.map(t => t === "bridge" ? -2 : 0) } as NonNullable<typeof map.water>
    expect(bridgeLayout(map).ropeAt.size).toBeGreaterThan(0)
    expect(bridgeLayout(map).corners).toEqual([])
  })
  it.each(["horse", "donkey", "hand"] as const)("supports the %s axle and both wheels throughout the inside turn in both directions", puller => {
    const map = turningMap("bridge"), scale = BASE_CHARACTER_SCALE, wheelbase = -cartOffset(puller) * scale
    for (const direction of [1, -1] as const) {
      const start = direction === 1 ? 3 : 15
      const point = (p: number) => cartRoutePoint(map, p)
      let pose = cartOnRoute(start, direction, wheelbase, point), clear = 0, contacts = 0
      for (let i = 0; i <= 1200; i++) {
        const progress = start + direction * i * 0.01
        pose = followCart(pose, point(progress), wheelbase)
        const ahead = point(progress + direction * 0.005), behind = point(progress - direction * 0.005)
        const heading = Math.atan2(ahead.x - behind.x, ahead.z - behind.z)
        if (convoyClear(map, pose, puller, scale, false, heading)) clear++
        else contacts++
        if (progress >= 7.4 && progress <= 13) {
          for (const contact of [pose, ...cartWheelContacts(pose)]) {
            expect(walkingSurface(map,contact.x,contact.z).height, `${puller} at ${progress}`).toBeCloseTo(TILE_HEIGHT+BRIDGE_RISE,6)
          }
        }
      }
      expect(clear).toBeGreaterThan(0)
      expect(contacts).toBe(0)
    }
  })
})
