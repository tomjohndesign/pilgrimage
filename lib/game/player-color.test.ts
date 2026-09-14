import { describe, expect, it } from "vitest"
import { PERSON_PRESETS, DEFAULT_DESIGN, personRecipe } from "./base-person/design"
import { complexionSwap } from "./base-person/complexion"
import { jobDesign, SETTLEMENT_JOBS } from "./jobs/design"
import { parseDisplaySettings } from "./save/schema"
import { structureParts, shrineStructureParts } from "./building-art/structure"
import { CHARACTER_PALETTE_SLOTS, DEFAULT_PLAYER_COLOR, isPlayerResident, playerBuildingParts, playerClothingSwap } from "./player-color"
import { characterPalette } from "./render/character-batch"
import { complexionUniforms } from "./render/complexion-swap"

const empty = { from: [], to: [] }
describe("settlement colors", () => {
  it("distinguishes owned households and jobs from independent towns, including children", () => {
    const buildings = [{ id: "home" }, { id: "work" }, { id: "town", owner: "independent" as const }]
    expect(isPlayerResident({ home: "home" }, buildings)).toBe(true)
    expect(isPlayerResident({ employer: "work" }, buildings)).toBe(true)
    expect(isPlayerResident({ home: "town" }, buildings)).toBe(false)
    expect(isPlayerResident({ home: "town", employer: "town" }, buildings)).toBe(false)
    expect(isPlayerResident({}, buildings)).toBe(false)
    expect(isPlayerResident({ home: "demolished" }, buildings)).toBe(false)
  })
  it("colors monk edging and belt without recoloring the brown habit or skin", () => {
    const monk = PERSON_PRESETS.Monk
    const swap = playerClothingSwap(empty, monk, "#427da6", true)
    expect(swap.from).toContain(monk.accentColor)
    expect(swap.to[swap.from.indexOf(monk.accentColor)]).toBe("#427da6")
    expect(swap.from).not.toContain(monk.tunicColor)
    expect(swap.from).not.toContain(monk.skinColor)
    expect(personRecipe(monk).paletteTones[personRecipe(monk).renderPalette.indexOf(monk.accentColor)]).toBe(3)
  })

  it("colors each work outfit and preserves its individual complexion", () => {
    for (const job of Object.keys(SETTLEMENT_JOBS) as (keyof typeof SETTLEMENT_JOBS)[]) {
      const design = jobDesign(job, 0)
      const skin = complexionSwap(design, { skin: "#e0bb9c", hair: "#c6ab6d" })
      const swap = playerClothingSwap(skin, design, DEFAULT_PLAYER_COLOR, true)
      expect(swap.from.slice(0, skin.from.length)).toEqual(skin.from)
      expect(swap.to.slice(0, skin.to.length)).toEqual(skin.to)
      expect(swap.to[swap.from.indexOf(design.tunicColor)]).toBe(DEFAULT_PLAYER_COLOR)
      expect(swap.from).not.toContain("#785637")
      const uniforms = complexionUniforms(swap), batch = characterPalette(uniforms)
      const slot = swap.from.indexOf(design.tunicColor)
      expect(batch[(CHARACTER_PALETTE_SLOTS + slot) * 4]).toBeCloseTo(uniforms.complexionTo.value[slot].r)
    }
  })

  it("preserves visitors' original clothing and individual complexion for any player color", () => {
    const skin = complexionSwap(DEFAULT_DESIGN, { skin: "#e0bb9c", hair: "#c6ab6d" })
    for (const color of [DEFAULT_PLAYER_COLOR, "#427da6", null]) {
      expect(playerClothingSwap(skin, DEFAULT_DESIGN, color, false)).toBe(skin)
      expect(playerClothingSwap(empty, DEFAULT_DESIGN, color, false)).toBe(empty)
    }
  })

  it("accepts saved custom colors and ignores malformed preferences in old saves", () => {
    expect(parseDisplaySettings({ playerColor: "#123AbC" }).playerColor).toBe("#123AbC")
    expect(parseDisplaySettings({ playerColor: "red", baseSize: 1.5 })).toEqual({ baseSize: 1.5 })
    expect(parseDisplaySettings({})).toEqual({})
  })

  it("accents real building joinery without changing roofs, plaster, or geometry", () => {
    for (const parts of [shrineStructureParts(2, 2), structureParts({ buildType: "workshop", w: 3, d: 2, height: .85, color: "#785637", roofColor: "#54402c" })]) {
      const painted = playerBuildingParts(parts, DEFAULT_PLAYER_COLOR)
      expect(painted.some((part, i) => part.color !== parts[i].color)).toBe(true)
      for (const [i, part] of painted.entries()) {
        expect({ ...part, color: parts[i].color }).toEqual(parts[i])
        if (part.name.includes("weave")) expect(part.color).toBe(parts[i].color)
        if (part.surface === "trail") expect(part.color).toBe(parts[i].color)
      }
      expect(playerBuildingParts(parts, null)).toBe(parts)
    }
  })
})
