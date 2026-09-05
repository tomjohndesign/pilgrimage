import { describe, expect, it } from "vitest"
import { actorPose, comparisonQuery, DEFAULT_METHODS, DEFAULT_SETTINGS, readMethods, readSettings, spriteRow } from "./settings"

describe("rendering comparisons", () => {
  it("restores a shared comparison including the alternate snapped method", () => {
    const settings = { ...DEFAULT_SETTINGS, character: "knight" as const, zoom: 2.5, camera: "pan" as const, scenery: false }
    const methods = [...DEFAULT_METHODS.slice(0, 3), "snapped" as const]
    const params = new URLSearchParams(comparisonQuery(settings, methods))
    expect(readSettings(params)).toEqual(settings)
    expect(readMethods(params)).toEqual(methods)
  })
  it("rejects invalid enum/prototype keys and bounds GPU-related settings", () => {
    const settings = readSettings(new URLSearchParams("density=999999&dpr=Infinity&zoom=-1&scale=NaN&camera=toString&motion=__proto__&character=unknown&fps="))
    expect(settings).toMatchObject({ density: 64, dpr: 1, zoom: 0.5, scale: 1.5, camera: "still", motion: "walk", character: "base", fps: 8 })
    expect(readMethods(new URLSearchParams("methods=__proto__,bad,native"))).toEqual(["global", "hybrid", "native", "native"])
  })
  it("keeps frozen-pose and animated walking on exactly the same path", () => {
    for (const seconds of [0, 0.016, 1, 8.57, 12, 18]) {
      expect(actorPose(seconds, "slide")).toEqual(actorPose(seconds, "walk"))
      expect(actorPose(seconds, "idle")).toEqual({ x: -1.3, z: -0.85, heading: Math.PI / 2 })
    }
  })
  it("selects equivalent sprite directions across full camera turns", () => {
    for (let row = 0; row < 8; row++) {
      const yaw = row * Math.PI / 4
      expect(spriteRow(0, yaw)).toBe(row)
      expect(spriteRow(0, yaw + Math.PI * 2)).toBe(row)
      expect(spriteRow(0, yaw - Math.PI * 2)).toBe(row)
    }
  })
})
