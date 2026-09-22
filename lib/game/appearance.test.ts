import { describe, expect, it } from "vitest"
import { defaultAppearance, parseAppearance, sameAppearanceSelection, selectionGroup } from "./appearance"
import { updateAppearanceUniforms, assetAppearanceUniforms, grassAppearanceUniforms } from "./render/appearance-uniforms"

describe("portable appearance edits", () => {
  it("round-trips grass, group and independent object adjustments", () => {
    const value = defaultAppearance()
    value.grass.color = "#85945e"; value.grass.canopyShade = .4
    value.groups.trees.saturation = .2
    value.objects.push({world:"12345:128x128",selection:{kind:"tree",id:8},label:"oak",brightness:1.2,saturation:.3})
    expect(parseAppearance(JSON.stringify(value))).toEqual(value)
  })
  it("rejects malformed, incompatible and out-of-range imports before replacing current settings", () => {
    expect(()=>parseAppearance("not JSON")).toThrow()
    expect(()=>parseAppearance(JSON.stringify({...defaultAppearance(),version:2}))).toThrow()
    for (const brightness of [-1,3,null]) expect(()=>parseAppearance(JSON.stringify({...defaultAppearance(),assets:{brightness,saturation:1}}))).toThrow()
    expect(()=>parseAppearance(JSON.stringify({...defaultAppearance(),grass:{...defaultAppearance().grass,color:"red"}}))).toThrow()
  })
  it("loads earlier appearance files with terrain defaults and preserves the new controls", () => {
    const { terrain, ...legacy } = defaultAppearance()
    expect(parseAppearance(JSON.stringify(legacy)).terrain).toEqual(terrain)
    for (const inclineStyle of ["smooth", "stipple", "ordered"] as const) {
      const value = {...defaultAppearance(), terrain: { texture: .6, inclineStyle }}
      expect(parseAppearance(JSON.stringify(value))).toEqual(value)
      updateAppearanceUniforms(value, [])
      expect(grassAppearanceUniforms.terrainTexture.value).toBe(.6)
      expect(grassAppearanceUniforms.terrainInclineStyle.value).toBe(["smooth", "stipple", "ordered"].indexOf(inclineStyle))
    }
    for (const terrain of [{ texture: 3, inclineStyle: "stipple" }, { texture: 1, inclineStyle: "unknown" }]) {
      expect(() => parseAppearance(JSON.stringify({...defaultAppearance(), terrain}))).toThrow()
    }
    updateAppearanceUniforms(defaultAppearance(), [])
  })
  it("keeps object identities distinct across asset kinds", () => {
    expect(sameAppearanceSelection({kind:"tree",id:1},{kind:"animal",id:1})).toBe(false)
    expect(selectionGroup({kind:"monk",id:3})).toBe("characters")
  })
  it("combines group adjustments and encodes sorted sparse IDs without altering ID colors", () => {
    const value=defaultAppearance();value.assets.saturation=.5;value.groups.trees.saturation=.4;value.grass.brightness=1.3
    updateAppearanceUniforms(value,[{id:100,saturation:.2,brightness:1.5},{id:2,saturation:.7,brightness:.8}])
    expect(assetAppearanceUniforms.trees.appearanceFactors.value.x).toBeCloseTo(.2)
    expect(grassAppearanceUniforms.grassBrightness.value).toBe(1.3)
    const data=assetAppearanceUniforms.trees.appearanceEdits.value.image.data!
    expect(data[0]).toBe(2);expect(data[4]).toBe(100)
    expect(assetAppearanceUniforms.trees.appearanceEditCount.value).toBe(2)
    updateAppearanceUniforms(defaultAppearance(),[])
    expect(assetAppearanceUniforms.trees.appearanceEditCount.value).toBe(0)
  })
})
