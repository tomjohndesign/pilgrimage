import { expect, it } from "vitest"
import { DEFAULT_DESIGN, PERSON_PRESETS } from "./design"
import { characterEditsJson, parseCharacterEdits } from "./share-edits"

it("round-trips every character and uses the latest unsaved pose for the current character", () => {
  const traveler = { ...PERSON_PRESETS.Traveler, poseEdits: { walk: { rightHand: [{ frame: 0, radius: 3, offset: [0.1, 0, 0] as [number, number, number] }] } } }
  const drafts = { "preset/Traveler": DEFAULT_DESIGN, "preset/Monk": PERSON_PRESETS.Monk }
  const json = characterEditsJson("preset/Traveler", drafts, traveler)
  const imported = parseCharacterEdits(json, "preset/Storybook")
  expect(imported.character).toBe("preset/Traveler")
  expect(imported.drafts).toEqual({ ...drafts, "preset/Traveler": traveler })
  expect(drafts["preset/Traveler"]).toBe(DEFAULT_DESIGN)
})

it("accepts earlier parameter files and rejects partial invalid bundles atomically", () => {
  expect(parseCharacterEdits(JSON.stringify(DEFAULT_DESIGN), "preset/Storybook").drafts).toEqual({ "preset/Storybook": DEFAULT_DESIGN })
  const json = characterEditsJson("preset/Traveler", { "preset/Monk": PERSON_PRESETS.Monk }, PERSON_PRESETS.Traveler)
  for (const corrupt of [
    (value: any) => { value.drafts["preset/Monk"].poseEdits = { walk: { head: [{ frame: 99, radius: 3, offset: [0, 0, 0] }] } } },
    (value: any) => { value.character = "missing" },
    (value: any) => { value.templateVersion = 0 },
  ]) {
    const value = JSON.parse(json); corrupt(value)
    expect(() => parseCharacterEdits(JSON.stringify(value), "preset/Storybook")).toThrow()
  }
})

it("preserves v20 walking keys and rescales old splitting keys on import", async () => {
  const { restoreCharacterDesign } = await import("./share-edits")
  const { BASE_PERSON, PERSON_CLIPS } = await import("./pose")
  const key = { frame: 6, radius: 3, offset: [0.02, 0, -0.08] as [number, number, number] }
  const old = { ...DEFAULT_DESIGN, poseEdits: { walk: { rightHand: [key] }, woodcutting: { rightHand: [key] } } }
  const imported = parseCharacterEdits(JSON.stringify({ format: "pilgrimage-character-edits", version: 1, templateVersion: 20, character: "preset/Traveler", drafts: { "preset/Traveler": old } }), "preset/Storybook")
  const design = imported.drafts["preset/Traveler"]
  expect(design.poseEdits?.walk?.rightHand).toEqual([key])
  expect(design.poseEdits?.woodcutting?.rightHand?.[0]).toEqual({ ...key, frame: Math.round(6 * PERSON_CLIPS.woodcutting.frames / 24), radius: Math.round(3 * PERSON_CLIPS.woodcutting.frames / 24) })
  expect(restoreCharacterDesign(old)).toEqual(design)
  expect(restoreCharacterDesign(design, BASE_PERSON.version)).toEqual(design)
  expect(old.poseEdits.woodcutting.rightHand[0]).toEqual(key)
})

// The mallet is additive: saved timing for every existing action is unchanged.
it("imports v26 designs without retiming their existing pose edits", () => {
  const key = { frame: 40, radius: 5, offset: [0.02, 0, -0.08] as [number, number, number] }
  const design = { ...PERSON_PRESETS.Monk, poseEdits: { woodcutting: { rightHand: [key] } } }
  const result = parseCharacterEdits(JSON.stringify({ format: "pilgrimage-character-edits", version: 1,
    templateVersion: 26, character: "preset/Monk", drafts: { "preset/Monk": design } }), "preset/Storybook")
  expect(result.drafts["preset/Monk"]).toEqual(design)
})
