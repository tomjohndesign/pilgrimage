import { describe, expect, it } from "vitest"
import { Matrix4, Vector3 } from "three"
import { CART } from "./transport/assets"
import { CHARACTER_ASSETS, characterVisual, selectionPlaybackRate, spriteFrame, spriteRow } from "./character-assets"
import { validateCharacterAssets } from "./character-asset-store"

describe("camera-relative sprite facing", () => {
  it("maps every world heading to its row at all four isometric camera views", () => {
    for (let view = 0; view < 4; view++) {
      const yaw = Math.PI / 4 + view * Math.PI / 2
      for (let row = 0; row < 8; row++) expect(spriteRow(yaw - row * Math.PI / 4, yaw)).toBe(row)
    }
  })
  it("wraps around full turns and quantizes at the halfway boundary", () => {
    expect(spriteRow(4 * Math.PI, 0)).toBe(0)
    expect(spriteRow(0, -Math.PI / 4)).toBe(7)
    expect(spriteRow(0, Math.PI / 8 - 0.001)).toBe(0)
    expect(spriteRow(0, Math.PI / 8 + 0.001)).toBe(1)
  })
  it.each([8, CART.directions])("matches baked geometry through forward and reverse camera turns with %i directions", directions => {
    const step = 2 * Math.PI / directions
    // An asymmetric landmark makes reversed rotations detectable.
    const landmark = new Vector3(.43, .57, .39)
    for (let facing = 0; facing < directions; facing++) for (let view = -directions; view <= directions; view++) {
      const heading = facing * step, yaw = view * step
      const row = spriteRow(heading, yaw, directions)
      const actual = landmark.clone().applyMatrix4(new Matrix4().makeRotationY(heading))
        .applyMatrix4(new Matrix4().makeRotationY(-yaw))
      const baked = landmark.clone().applyMatrix4(new Matrix4().makeRotationY(-row * step))
      expect(actual.distanceTo(baked)).toBeLessThan(1e-12)
    }
  })
  it("loops walking frames and holds a passing pose when stationary", () => {
    expect([0, 0.25, 0.5, 0.75, 1].map((s) => spriteFrame(s, 4))).toEqual([0, 1, 2, 3, 0])
    expect(spriteFrame(5, 6, false)).toBe(1)
  })
})

describe("character settings", () => {
  it("switches atlas layout and ground anchor without changing a traveler's sound", () => {
    const asset = CHARACTER_ASSETS.merchant
    const base = characterVisual(asset, "base")
    const original = characterVisual(asset, "callings")
    expect(base.walk.columns).toBe(20)
    expect(base.idle.columns).toBe(1)
    expect(base.center).toEqual([0.5, 1 - 48.5 / 64])
    expect(base.idle.url).toContain("-idle.png")
    expect(original.walk.columns).toBe(4)
    expect(original.center).toEqual([0.5, 6 / 64])
    expect(original.walk.url).toBe(asset.sheet)
    expect(asset.sound).toContain("merchant-select")
  })
  it("plays all sixty base walk frames and uses its dedicated idle pose", () => {
    const visual = characterVisual(CHARACTER_ASSETS.peasant, "base")
    expect(Array.from({ length: 21 }, (_, i) => spriteFrame((i + 0.01) / visual.fps, visual.fps, true, visual.walk.columns))).toEqual([...Array.from({ length: 20 }, (_, i) => i), 0])
    expect(spriteFrame(12, visual.fps, false, visual.idle.columns, visual.idle.stillFrame)).toBe(0)
  })
  it("preserves older character settings when adding nuns", () => {
    const { nun: _, ...saved } = CHARACTER_ASSETS
    saved.peasant = { ...saved.peasant, volume: 0.2 }
    const restored = validateCharacterAssets(saved)
    expect(restored.nun).toEqual(CHARACTER_ASSETS.nun)
    expect(restored.peasant.volume).toBe(0.2)
  })
  it("roundtrips all defaults", () => {
    expect(validateCharacterAssets(JSON.parse(JSON.stringify(CHARACTER_ASSETS)))).toEqual(CHARACTER_ASSETS)
  })
  it.each([
    { sheet: "https://example.com/sheet.png" }, { sheet: "//example.com/sheet.png" },
    { sheet: "/textures/../secret.png" }, { sound: "/sound.mp3" },
    { fps: 0 }, { fps: NaN }, { scale: 10 }, { volume: -1 },
  ])("rejects unsafe or out-of-range settings: %o", (patch) => {
    expect(() => validateCharacterAssets({ ...CHARACTER_ASSETS, peasant: { ...CHARACTER_ASSETS.peasant, ...patch } })).toThrow()
  })
  it("gives each traveler a stable, bounded pitch variation", () => {
    const rates = Array.from({ length: 100 }, (_, id) => selectionPlaybackRate(id))
    expect(new Set(rates).size).toBe(100)
    expect(rates.every((r) => r >= 0.92 && r <= 1.08)).toBe(true)
    expect(selectionPlaybackRate(11)).toBe(selectionPlaybackRate(11))
  })
})
