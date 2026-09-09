import { describe, expect, it } from "vitest"

import { projectGround, yawForView } from "../render/iso"
import { DEFAULT_WORLD_SETTINGS } from "./settings"
import { worldIdentity } from "./schema"
import { CANOPY_ALLOWANCE, CROWN_OVERHANG, focusGridShift, NEAR_SHIFT, resumeViewScript, tileDiscAlpha, tileDiscRadius, viewSnapshotExtent, viewSnapshotMatches, viewSnapshotSchema, viewSnapshotStyle, type ViewSnapshot } from "./view"

const camera = { targetX: 3.25, targetZ: -1.5, viewIndex: 2, viewSize: 14 }
const view = (): ViewSnapshot => ({
  world: worldIdentity(7, DEFAULT_WORLD_SETTINGS), camera,
  image: "data:image/png;base64,AAAA", width: 20, height: 12, offsetX: .03125, offsetY: -.0625,
})

describe("view snapshot", () => {
  it("stands in only for the same world seen from the same place", () => {
    expect(viewSnapshotMatches(view(), { world: worldIdentity(7, DEFAULT_WORLD_SETTINGS), camera })).toBe(true)
    expect(viewSnapshotMatches(view(), { world: worldIdentity(8, DEFAULT_WORLD_SETTINGS), camera })).toBe(false)
    expect(viewSnapshotMatches(view(), { world: worldIdentity(7, { ...DEFAULT_WORLD_SETTINGS, size: 96 }), camera })).toBe(false)
    expect(viewSnapshotMatches(view(), { world: worldIdentity(7, DEFAULT_WORLD_SETTINGS), camera: { ...camera, viewSize: 16 } })).toBe(false)
    expect(viewSnapshotMatches(view(), { world: worldIdentity(7, DEFAULT_WORLD_SETTINGS), camera: { ...camera, targetX: 3 } })).toBe(false)
  })

  it("rejects anything but an image data URL", () => {
    expect(viewSnapshotSchema.safeParse(view()).success).toBe(true)
    expect(viewSnapshotSchema.safeParse({ ...view(), image: "https://example.com/x.png" }).success).toBe(false)
    expect(viewSnapshotSchema.safeParse({ ...view(), width: 0 }).success).toBe(false)
  })

  it("sizes the picture in dvh at the saved zoom, and clears every property", () => {
    const style = viewSnapshotStyle(view())
    expect(style["--resume-view"]).toBe('url("data:image/png;base64,AAAA")')
    expect(style["--resume-view-width"]).toBe(`${20 * (100 / 14)}dvh`)
    expect(style["--resume-view-height"]).toBe(`${12 * (100 / 14)}dvh`)
    expect(style["--resume-view-x"]).toBe(`${.03125 * (100 / 14)}dvh`)
    expect(style["--resume-view-y"]).toBe(`${-.0625 * (100 / 14)}dvh`)
    const cleared = viewSnapshotStyle(null)
    expect(Object.keys(cleared)).toEqual(Object.keys(style))
    expect(Object.values(cleared).every(value => value === null)).toBe(true)
  })

  it("inlines a script that applies the same checks and properties before hydration", () => {
    const script = resumeViewScript(7)
    const set = new Map<string, string>()
    const storage = new Map([["pilgrimage.game.v1", JSON.stringify({ world: worldIdentity(7, DEFAULT_WORLD_SETTINGS), camera })],
      ["pilgrimage.view.v1", JSON.stringify(view())]])
    const run = () => {
      set.clear()
      new Function("localStorage", "document", script)(
        { getItem: (key: string) => storage.get(key) ?? null },
        { documentElement: { style: { setProperty: (name: string, value: string) => set.set(name, value) } } })
      return Object.fromEntries(set)
    }
    expect(run()).toEqual(viewSnapshotStyle(view()))
    expect(script).not.toContain("</script")
    // The seed the cookie named must be the saved one, and the pose must match.
    expect(Object.keys(new Function("localStorage", "document", resumeViewScript(8))(
      { getItem: (key: string) => storage.get(key) ?? null },
      { documentElement: { style: { setProperty: (name: string, value: string) => set.set(name, value) } } }) ?? {}).length).toBe(0)
    storage.set("pilgrimage.view.v1", JSON.stringify({ ...view(), camera: { ...camera, viewSize: 16 } }))
    expect(run()).toEqual({})
    storage.set("pilgrimage.view.v1", JSON.stringify({ ...view(), image: "javascript:alert(1)" }))
    expect(run()).toEqual({})
    storage.set("pilgrimage.view.v1", "{not json")
    expect(() => run()).not.toThrow()
  })

  it("cuts a disc of whole tiles: solid inside, stepping down to a faint rim, nothing beyond", () => {
    expect(tileDiscAlpha(0, 6)).toBe(1)
    expect(tileDiscAlpha(4.6, 6)).toBe(1)
    expect(tileDiscAlpha(5, 6)).toBeCloseTo(1.3 / 1.7)
    expect(tileDiscAlpha(6, 6)).toBeCloseTo(.18, 2)
    expect(tileDiscAlpha(6.1, 6)).toBe(0)
    // The disc leaves canopy room above and crown room either side; a tile of
    // distance is a unit across the screen and a third of one up it.
    expect(tileDiscRadius(40, 14)).toBeCloseTo((14 - CANOPY_ALLOWANCE) * Math.sqrt(3) / 2 - .5)
    expect(tileDiscRadius(14, 40)).toBeCloseTo((14 - 2 * CROWN_OVERHANG) / 2 - .5)
    expect(tileDiscRadius(1, 1)).toBe(1)
  })

  it("crops just the disc and its canopy room, centred above the focus, within the texel cap", () => {
    const extent = viewSnapshotExtent(22.4, 14, 43.2)
    expect(extent.radius).toBeCloseTo(tileDiscRadius(22.4, 14))
    expect(extent.halfHeight * 2).toBeCloseTo((extent.radius + .5) * 2 / Math.sqrt(3) + CANOPY_ALLOWANCE)
    expect(extent.halfWidth * 2).toBeCloseTo((extent.radius + .5) * 2 + 2 * CROWN_OVERHANG)
    expect(extent.up).toBeCloseTo(CANOPY_ALLOWANCE / 2 - NEAR_SHIFT / Math.sqrt(3))
    expect(extent.halfHeight * 2).toBeLessThanOrEqual(14)
    // Zoomed out, the cap rather than the frustum bounds the disc.
    const far = viewSnapshotExtent(224, 140, 5.7)
    expect(far.halfWidth * 2 * 5.7).toBeLessThanOrEqual(1024)
    expect(far.halfHeight * 2 * 5.7).toBeLessThanOrEqual(640)
  })

  it("slides the overlay grid from the focus to the centre of the tile under it", () => {
    // Map 64 wide: world x 3.25 is tile 35, whose centre is world 3.5.
    expect(focusGridShift(64, camera)).toEqual(projectGround(.25, 0, 0, yawForView(2)))
    expect(focusGridShift(64, { ...camera, targetX: 3.5, targetZ: -1.5 })).toEqual({ x: 0, y: -0 })
  })
})
