import { describe, expect, it } from "vitest"
import { cameraEdgePan } from "./camera-edge-pan"

const bounds = { left: 100, top: 50, right: 900, bottom: 650 }

describe("camera edge panning", () => {
  it("pans toward each edge of an offset viewport", () => {
    expect(cameraEdgePan(100, 350, bounds)).toEqual({ strafe: -1, forward: 0 })
    expect(cameraEdgePan(900, 350, bounds)).toEqual({ strafe: 1, forward: 0 })
    expect(cameraEdgePan(500, 50, bounds)).toEqual({ strafe: 0, forward: 1 })
    expect(cameraEdgePan(500, 650, bounds)).toEqual({ strafe: 0, forward: -1 })
  })

  it("ramps up within the edge band and stays still in the interior", () => {
    expect(cameraEdgePan(112, 350, bounds)).toEqual({ strafe: -0.5, forward: 0 })
    expect(cameraEdgePan(124, 350, bounds)).toEqual({ strafe: 0, forward: 0 })
    expect(cameraEdgePan(500, 350, bounds)).toEqual({ strafe: 0, forward: 0 })
  })

  it("caps diagonal speed at every corner", () => {
    for (const x of [bounds.left, bounds.right]) for (const y of [bounds.top, bounds.bottom]) {
      const { strafe, forward } = cameraEdgePan(x, y, bounds)
      expect(Math.hypot(strafe, forward)).toBeCloseTo(1)
      expect(Math.sign(strafe)).toBe(x === bounds.left ? -1 : 1)
      expect(Math.sign(forward)).toBe(y === bounds.top ? 1 : -1)
    }
  })

  it("does not pan outside the canvas or in an empty viewport", () => {
    for (const [x, y] of [[99, 350], [901, 350], [500, 49], [500, 651]]) {
      expect(cameraEdgePan(x, y, bounds)).toEqual({ strafe: 0, forward: 0 })
    }
    expect(cameraEdgePan(0, 0, { left: 0, top: 0, right: 0, bottom: 0 })).toEqual({ strafe: 0, forward: 0 })
  })

  it("keeps the center of a small canvas neutral", () => {
    expect(cameraEdgePan(10, 10, { left: 0, top: 0, right: 20, bottom: 20 })).toEqual({ strafe: 0, forward: 0 })
  })
})
