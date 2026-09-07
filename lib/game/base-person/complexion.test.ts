import { describe, expect, it } from "vitest"
import { GREY_HAIR_COLOR } from "../character-age"
import { complexionUniforms, MATCH_TOLERANCE } from "../render/complexion-swap"
import { makeRng } from "../rng"
import { generateMonks } from "../monks"
import { TRAVELER_TYPES } from "../travelers"
import { complexionSwap, HAIR_COLORS, rollComplexion, SKIN_TONES, COMPLEXION_SLOTS } from "./complexion"
import { HAIR_SHADES, personRecipe, shade, SKIN_SHADES } from "./design"
import { populationDesign, POPULATION_PROFILES, travelerAppearance } from "./population"
import { KNIGHT, knightDesign, squireDesign } from "../knight/design"
import { monkVisual } from "./monk-assets"

/** Working-space distance, the way the shader compares a sampled texel. */
function channels(hex: string) {
  return [1, 3, 5].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
}
function separation(a: string, b: string) {
  return Math.max(...channels(a).map((value, index) => Math.abs(value - channels(b)[index])))
}

describe("character complexion", () => {
  it("gives the road a spread of hair colors and skin tones, stable per traveler", () => {
    const people = Array.from({ length: 300 }, (_, id) => travelerAppearance(12345, id))
    for (let id = 0; id < people.length; id++) expect(travelerAppearance(12345, id).complexion).toEqual(people[id].complexion)
    const hair = new Set(people.map(person => person.complexion.hair))
    const skin = new Set(people.map(person => person.complexion.skin))
    expect(hair).toEqual(new Set(HAIR_COLORS.map(entry => entry.color)))
    expect(skin).toEqual(new Set(SKIN_TONES.map(entry => entry.color)))
    // No single colouring dominates the crowd, and the seed still decides it.
    for (const color of hair) expect(people.filter(p => p.complexion.hair === color).length).toBeLessThan(people.length / 3)
    expect(people.map(p => p.complexion)).not.toEqual(Array.from({ length: 300 }, (_, id) => travelerAppearance(54321, id).complexion))
  })

  it("leans fair hair toward fair skin without ruling any pairing out", () => {
    const rolls = Array.from({ length: 4000 }, (_, index) => rollComplexion(makeRng(index)))
    const rank = (complexion: { skin: string }) => SKIN_TONES.findIndex(tone => tone.color === complexion.skin)
    const fair = rolls.filter(roll => roll.hair === HAIR_COLORS[0].color)
    const dark = rolls.filter(roll => roll.hair === HAIR_COLORS[HAIR_COLORS.length - 1].color)
    expect(fair.reduce((sum, roll) => sum + rank(roll), 0) / fair.length)
      .toBeLessThan(dark.reduce((sum, roll) => sum + rank(roll), 0) / dark.length)
    expect(new Set(fair.map(rank)).size).toBe(SKIN_TONES.length)
  })

  it("swaps exactly the baked skin and hair steps, and leaves grey heads grey", () => {
    const design = populationDesign(TRAVELER_TYPES.peasant, 0)
    const complexion = { skin: SKIN_TONES[0].color, hair: HAIR_COLORS[0].color }
    const swap = complexionSwap(design, complexion)
    expect(swap.from).toEqual([...SKIN_SHADES.map(f => shade(design.skinColor, f)), ...HAIR_SHADES.map(f => shade(design.hairColor, f))])
    expect(swap.to).toEqual([...SKIN_SHADES.map(f => shade(complexion.skin, f)), ...HAIR_SHADES.map(f => shade(complexion.hair, f))])
    expect(swap.from.length).toBe(COMPLEXION_SLOTS)
    const grey = complexionSwap({ ...design, hairColor: GREY_HAIR_COLOR }, complexion)
    expect(grey.from).toEqual(SKIN_SHADES.map(f => shade(design.skinColor, f)))
    expect(complexionSwap(design, undefined).from).toEqual([])
    expect(complexionSwap(undefined, complexion).from).toEqual([])
  })

  it("fills every shader slot, leaving unused ones outside the colours a texel can hold", () => {
    const uniforms = complexionUniforms(complexionSwap({ skinColor: "#c99a72", hairColor: GREY_HAIR_COLOR },
      { skin: SKIN_TONES[6].color, hair: HAIR_COLORS[2].color }))
    expect(uniforms.complexionFrom.value.length).toBe(COMPLEXION_SLOTS)
    expect(uniforms.complexionTo.value.length).toBe(COMPLEXION_SLOTS)
    // Grey hair fills no slot, so the spare ones must never match a sampled pixel.
    for (const color of uniforms.complexionFrom.value.slice(SKIN_SHADES.length)) expect(color.r).toBeLessThan(0)
  })

  it("targets only palette entries that no other baked color can be mistaken for", () => {
    const designs = [
      ...Object.values(TRAVELER_TYPES).flatMap(type => POPULATION_PROFILES.map((_, variant) => populationDesign(type, variant))),
      ...Array.from({ length: KNIGHT.variants }, (_, row) => knightDesign(row)), squireDesign(),
      monkVisual(18).design!, monkVisual(40).design!,
    ]
    for (const design of designs) {
      const palette = personRecipe(design).renderPalette
      const swap = complexionSwap(design, { skin: SKIN_TONES[0].color, hair: HAIR_COLORS[0].color })
      for (const from of swap.from) {
        expect(palette).toContain(from)
        for (const other of palette) {
          if (other === from) continue
          expect(separation(from, other)).toBeGreaterThan(MATCH_TOLERANCE)
        }
      }
    }
  })

  it("gives every brother his own colouring without disturbing the rest of his roll", () => {
    const monks = generateMonks(12345)
    expect(new Set(monks.map(monk => monk.complexion!.hair)).size).toBeGreaterThan(1)
    expect(generateMonks(12345)).toEqual(monks)
    expect(monks.map(monk => monk.attributes)).toEqual(generateMonks(12345).map(monk => monk.attributes))
  })
})
