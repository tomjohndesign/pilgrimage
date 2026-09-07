import { describe, expect, it } from "vitest"
import { inkPersonFrame } from "./ink"
import { HAIR_SHADES, PALETTE_TONES, personRecipe, shade, SKIN_SHADES } from "./design"
import { populationDesign } from "./population"
import { TRAVELER_TYPES } from "../travelers"

const rgb = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))

describe("reserved skin and hair palette entries", () => {
  it("keeps a prop off the body colours it would otherwise be nearest to", () => {
    // A staff lit exactly like hair, and a cheek lit exactly like skin.
    const design = populationDesign(TRAVELER_TYPES.peasant, 0)
    const recipe = personRecipe(design)
    const palette = recipe.renderPalette.map(rgb)
    const hairColor = shade(design.hairColor, 1), skinColor = shade(design.skinColor, 0.9)
    const size = 8, pixels = new Uint8ClampedArray(size * size * 4), parts = new Uint8ClampedArray(pixels.length)
    const paint = (x: number, y: number, color: string, tone: number) => {
      const i = (y * size + x) * 4
      pixels.set([...rgb(color), 255], i); parts.set([1, tone, 0, 255], i)
    }
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) {
      paint(x, y, hairColor, x < 4 ? PALETTE_TONES.shared : PALETTE_TONES.hair)
    }
    const inked = inkPersonFrame(pixels, parts, size, palette, 0, recipe.paletteTones)
    const at = (x: number, y: number) => Array.from(inked.pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 3))
    expect(at(5, 3)).toEqual(rgb(hairColor))
    expect(at(3, 3)).not.toEqual(rgb(hairColor))

    const skinFrame = new Uint8ClampedArray(pixels.length), skinParts = new Uint8ClampedArray(pixels.length)
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) {
      const i = (y * size + x) * 4
      skinFrame.set([...rgb(skinColor), 255], i)
      skinParts.set([1, x < 4 ? PALETTE_TONES.shared : PALETTE_TONES.skin, 0, 255], i)
    }
    const skinInked = inkPersonFrame(skinFrame, skinParts, size, palette, 0, recipe.paletteTones)
    const skinAt = (x: number, y: number) => Array.from(skinInked.pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 3))
    expect(skinAt(5, 3)).toEqual(rgb(skinColor))
    expect(skinAt(3, 3)).not.toEqual(rgb(skinColor))
  })

  it("marks every skin and hair step of every calling as reserved, and nothing else", () => {
    for (const type of Object.values(TRAVELER_TYPES)) for (let variant = 0; variant < 6; variant++) {
      const design = populationDesign(type, variant)
      const { renderPalette, paletteTones } = personRecipe(design)
      const skin = SKIN_SHADES.map(f => shade(design.skinColor, f))
      const hair = HAIR_SHADES.map(f => shade(design.hairColor, f))
      for (const [index, color] of renderPalette.entries()) {
        const expected = skin.includes(color) ? PALETTE_TONES.skin : hair.includes(color) ? PALETTE_TONES.hair : PALETTE_TONES.shared
        expect([color, paletteTones[index]]).toEqual([color, expected])
      }
      for (const color of [...skin, ...hair]) expect(renderPalette).toContain(color)
    }
  })
})
