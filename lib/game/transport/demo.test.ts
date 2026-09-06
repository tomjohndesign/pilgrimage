import { describe, expect, it } from "vitest"
import { DEMO_STAGES, MERCHANT_DEMO_MAP, merchantDemo } from "./demo"
import { tileAt, worldToTileX, worldToTileZ } from "../map/types"
import { BASE_CHARACTER_SCALE, personWalkStride } from "../base-person/gait"
import { merchantWalkSpeed, pullingDesign, SHOP_SECONDS } from "./assets"

describe("merchant map demonstration", () => {
  it("shows every stage in order for hand, donkey and both horse builds", () => {
    for (const [puller, variant] of [["hand", "common"], ["donkey", "common"], ["horse", "common"], ["horse", "noble"]] as const) {
      const demo = merchantDemo(puller, variant)
      expect([...new Set(demo.frames.map(frame => frame.stage))]).toEqual(DEMO_STAGES)
      expect(demo.starts.Selling - demo.starts.Opening).toBeCloseTo(SHOP_SECONDS, 0)
      expect(demo.starts.Continuing - demo.starts.Closing).toBeGreaterThanOrEqual(SHOP_SECONDS)
      expect(demo.frames.some(frame => frame.stage === "Selling" && frame.sales === 1)).toBe(true)
      expect(demo.frames.at(-1)!.merchant.x).toBeGreaterThan(3)
      const parked = demo.frames.filter(frame => ["Opening", "Selling", "Closing"].includes(frame.stage))
      expect(parked.every(frame => frame.merchant.x === parked[0].merchant.x && frame.merchant.z === 0)).toBe(true)
      if (puller !== "hand") {
        const speed = merchantWalkSpeed(puller, BASE_CHARACTER_SCALE, personWalkStride(pullingDesign(0)) * BASE_CHARACTER_SCALE, variant)
        expect((demo.frames[2].merchant.x - demo.frames[1].merchant.x) / demo.step).toBeCloseTo(speed)
        const last = parked.at(-1)!.pasture!
        expect(last.ready).toBe(true); expect([last.x, last.z]).toEqual([last.home.x, last.home.z])
        for (const frame of parked) {
          const p = frame.pasture!
          expect(tileAt(MERCHANT_DEMO_MAP, worldToTileX(MERCHANT_DEMO_MAP, p.x), worldToTileZ(MERCHANT_DEMO_MAP, p.z))).toBe("grass")
        }
      }
    }
  })
  it("can replay or scrub without altering a previously sampled pasture", () => {
    const a = merchantDemo("donkey"), b = merchantDemo("donkey")
    expect(a).toEqual(b)
    const first = a.frames.find(frame => frame.pasture)!.pasture!
    expect(first.z).toBe(0)
    expect(a.frames.some(frame => frame.pasture && frame.pasture.x !== first.x)).toBe(true)
  })
})
