import { describe, it, expect } from "vitest"
import { DEFAULT_DESIGN, DESIGN_CONTROLS, PERSON_PRESETS, personRecipe, validatePersonDesign, withBodyType, type DesignKey } from "./design"
import { legPose } from "./pose"
import { inkPersonFrame } from "./ink"

describe("parametric people", () => {
  it("keeps every supported proportion combination within leg reach", () => {
    for (const legs of [0.85, 1, 1.15]) for (const stride of [0.75, 1, 1.1]) {
      const { body } = personRecipe({ ...DEFAULT_DESIGN, legs, stride })
      for (let i = 0; i < 240; i++) for (const side of ["left", "right"] as const) {
        const p = legPose(side, i / 240, "walk", body)
        const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, j) => v - b[j]))
        expect(distance(p.hip, p.knee)).toBeCloseTo(body.thighLength, 10)
        expect(distance(p.knee, p.ankle)).toBeCloseTo(body.shinLength, 10)
        if (p.planted) expect(p.ankle[1]).toBe(body.ankleHeight)
      }
    }
  })
  it("roundtrips presets, rejects invalid imports, and does not mutate the base", () => {
    const original = personRecipe()
    for (const design of Object.values(PERSON_PRESETS)) expect(validatePersonDesign(JSON.parse(JSON.stringify(design)))).toEqual(design)
    for (const key of Object.keys(DESIGN_CONTROLS) as DesignKey[]) {
      expect(() => validatePersonDesign({ ...DEFAULT_DESIGN, [key]: NaN })).toThrow()
      expect(() => validatePersonDesign({ ...DEFAULT_DESIGN, [key]: 9 })).toThrow()
    }
    personRecipe(PERSON_PRESETS.Stout)
    expect(personRecipe()).toEqual(original)
  })
  it("loads older designs and adjusts each foot dimension independently", () => {
    const { torsoHeight: _torso, footWidth: _width, footHeight: _height, tunicLength: _tunic, shoulderHeight: _shoulders, neckHeight: _neck, ...legacy } = DEFAULT_DESIGN
    expect(validatePersonDesign(legacy)).toEqual({ ...DEFAULT_DESIGN, footWidth: 1, footHeight: 1, tunicLength: 1, shoulderHeight: 1, neckHeight: 1 })
    const base = personRecipe().body
    for (const [key, dimension] of [["feet", "footLength"], ["footWidth", "footWidth"], ["footHeight", "footHeight"]] as const) {
      const body = personRecipe({ ...DEFAULT_DESIGN, [key]: 1.5 }).body
      for (const axis of ["footLength", "footWidth", "footHeight"] as const) {
        expect(body[axis]).toBeCloseTo(base[axis] * (axis === dimension ? 1.5 / DEFAULT_DESIGN[key] : 1), 10)
      }
      expect(body.ankleHeight).toBe(base.ankleHeight)
    }
  })
  it("keeps a visible neck and ordered tunic contours at every new control extreme", () => {
    for (const shoulderHeight of [0.8, 1.15]) for (const neckHeight of [0.5, 1.5])
      for (const tunicLength of [0.75, 1.4]) for (const head of [0.85, 1.2]) for (const legs of [0.85, 1.15]) {
        const { body: b } = personRecipe({ ...DEFAULT_DESIGN, shoulderHeight, neckHeight, tunicLength, head, legs })
        const profile = [b.tunicHem, b.tunicHemUpper, b.torsoCenter - 0.24, b.torsoCenter - 0.16, b.chestHeight, b.torsoShoulderHeight - 0.06, b.torsoShoulderHeight + 0.01]
        for (let i = 1; i < profile.length; i++) expect(profile[i]).toBeGreaterThan(profile[i - 1])
        expect(b.headCenter - b.headHeight - (b.torsoShoulderHeight + 0.01)).toBeGreaterThan(0.03)
        expect(b.tunicHem).toBeGreaterThan(b.ankleHeight)
        const base = personRecipe({ ...DEFAULT_DESIGN, head, legs }).body
        expect(b.hipHeight).toBe(base.hipHeight)
        expect(b.torsoCenter).toBe(base.torsoCenter)
      }
  })
  it("moves only the arm attachment height when adjusting shoulders", () => {
    for (const legs of [0.85, 1.15]) for (const neckHeight of [0.5, 1.5]) {
      const { shoulderHeight: baseShoulder, ...fixedBody } = personRecipe({ ...DEFAULT_DESIGN, legs, neckHeight, shoulderHeight: 1 }).body
      for (const setting of [0.8, 1.15]) {
        const { shoulderHeight, ...body } = personRecipe({ ...DEFAULT_DESIGN, legs, neckHeight, shoulderHeight: setting }).body
        expect(body).toEqual(fixedBody)
        expect(Math.sign(shoulderHeight - baseShoulder)).toBe(Math.sign(setting - 1))
      }
    }
  })
  it("changes torso height while keeping the waist, hem, neck span and shoulder offset independent", () => {
    const base = personRecipe().body
    for (const torsoHeight of [0.8, 1.25]) {
      const b = personRecipe({ ...DEFAULT_DESIGN, torsoHeight }).body
      const rise = b.torsoShoulderHeight - base.torsoShoulderHeight
      expect(Math.sign(rise)).toBe(Math.sign(torsoHeight - 1))
      expect(b.headCenter - base.headCenter).toBeCloseTo(rise, 10)
      expect(b.shoulderHeight - base.shoulderHeight).toBeCloseTo(rise, 10)
      for (const fixed of ["hipHeight", "torsoCenter", "tunicHem", "tunicHemUpper", "ankleHeight"] as const) expect(b[fixed]).toBe(base[fixed])
      const { shoulderHeight: _shoulder, ...body } = b
      const { shoulderHeight: _lowered, ...lowered } = personRecipe({ ...DEFAULT_DESIGN, torsoHeight, shoulderHeight: 0.8 }).body
      expect(lowered).toEqual(body)
      expect(b.chestHeight).toBeGreaterThan(b.torsoCenter - 0.16)
      expect(b.chestHeight).toBeLessThan(b.torsoShoulderHeight - 0.06)
    }
  })
  it("provides distinct body profiles without coupling their height controls", () => {
    const male = personRecipe({ ...DEFAULT_DESIGN, bodyType: "Male" }).body
    const femaleDesign = withBodyType({ ...DEFAULT_DESIGN, beard: true }, "Female")
    const female = personRecipe(femaleDesign).body
    expect(male.shoulderOffset).toBeGreaterThan(female.shoulderOffset)
    expect(male.torsoTop).toBeGreaterThan(female.torsoTop)
    expect(male.waistRadius).toBeLessThan(female.waistRadius)
    expect(female.torsoBottom).toBeGreaterThan(male.torsoBottom)
    expect(female.bustDepth).toBeGreaterThan(0)
    expect(male.bustDepth).toBe(0)
    expect(femaleDesign.hairStyle).toBe("Long")
    expect(femaleDesign.beard).toBe(false)
    expect(validatePersonDesign({ ...femaleDesign, beard: true }).beard).toBe(false)
    expect(() => validatePersonDesign({ ...DEFAULT_DESIGN, bodyType: "Unknown" })).toThrow()
    expect(female.torsoShoulderHeight).toBe(male.torsoShoulderHeight)
    const { shoulderHeight: _shoulder, ...body } = female
    const { shoulderHeight: _lowered, ...lowered } = personRecipe({ ...femaleDesign, shoulderHeight: 0.8 }).body
    expect(body).toEqual(lowered)
  })
  it("validates appearance parameters and derives the palette from the chosen colors", () => {
    for (const input of [{ tunicColor: "red" }, { hairColor: "#123" }, { skinColor: null }, { hairStyle: "Unknown" }, { beard: "yes" }]) {
      expect(() => validatePersonDesign({ ...DEFAULT_DESIGN, ...input })).toThrow()
    }
    const design = validatePersonDesign({ ...DEFAULT_DESIGN, tunicColor: "#AA3344", hairStyle: "Bob", beard: true })
    expect(design.tunicColor).toBe("#aa3344")
    expect(personRecipe(design).renderPalette).toContain("#aa3344")
    expect(personRecipe(design).palette.skin).toBe(design.skinColor)
  })
  it("adds native contours without touching neighboring cells or growing beyond one pixel", () => {
    const size = 16, pixels = new Uint8ClampedArray(size * size * 4), parts = new Uint8ClampedArray(pixels.length)
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) {
      const i = (y * size + x) * 4
      pixels.set([150, 150, 150, 255], i); parts.set([x < 8 ? 3 : 8, 0, 0, 255], i)
    }
    const palette = [[30, 25, 20], [150, 150, 150]]
    const plain = inkPersonFrame(pixels, parts, size, palette, 0)
    const inked = inkPersonFrame(pixels, parts, size, palette, 1)
    expect(plain.padding).toBe(5); expect(inked.padding).toBe(4)
    expect(Array.from(plain.pixels)).toEqual(Array.from(pixels))
    expect(Array.from(inked.pixels.slice((7 * size + 8) * 4, (7 * size + 8) * 4 + 4))).toEqual([30, 25, 20, 255])
    for (let i = 0; i < inked.pixels.length; i += 4) if (inked.pixels[i + 3]) expect([30, 150]).toContain(inked.pixels[i])
  })
})
