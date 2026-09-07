import { validatePersonDesign, type PersonDesign } from "./design"
import { BASE_PERSON, PERSON_CLIPS } from "./pose"

export function characterEditsJson(character: string, drafts: Record<string, PersonDesign>, design: PersonDesign) {
  return JSON.stringify({ format: "pilgrimage-character-edits", version: 1, templateVersion: BASE_PERSON.version,
    character, drafts: { ...drafts, [character]: design } }, null, 2) + "\n"
}

/** Retain the cycle timing of pose keys authored before the longer splitting clip. */
export function restoreCharacterDesign(input: unknown, templateVersion = 20): PersonDesign {
  const design = validatePersonDesign(input)
  if (templateVersion !== 20 || !design.poseEdits?.woodcutting) return design
  const ratio = PERSON_CLIPS.woodcutting.frames / 24
  for (const keys of Object.values(design.poseEdits.woodcutting)) for (const key of keys ?? []) {
    key.frame = Math.min(PERSON_CLIPS.woodcutting.frames - 1, Math.round(key.frame * ratio))
    key.radius = Math.max(1, Math.min(Math.floor(PERSON_CLIPS.woodcutting.frames / 2), Math.round(key.radius * ratio)))
  }
  return validatePersonDesign(design)
}

/** Validate the whole import before replacing any saved character. */
export function parseCharacterEdits(text: string, currentCharacter: string): { character: string; drafts: Record<string, PersonDesign> } {
  if (text.length > 2_000_000) throw new Error("JSON must be under 2 MB.")
  const input = JSON.parse(text)
  if (input?.format !== "pilgrimage-character-edits") return { character: currentCharacter, drafts: { [currentCharacter]: restoreCharacterDesign(input, input?.templateVersion ?? 20) } }
  if (input.version !== 1 || ![20, 26, 27, BASE_PERSON.version].includes(input.templateVersion)) throw new Error("These edits use a different character rig version.")
  if (!input.drafts || typeof input.drafts !== "object" || Array.isArray(input.drafts) || Object.keys(input.drafts).length > 100) throw new Error("Invalid character drafts.")
  const drafts: Record<string, PersonDesign> = {}
  for (const [id, design] of Object.entries(input.drafts)) {
    if (!id || id.length > 100 || ["__proto__", "constructor", "prototype"].includes(id)) throw new Error("Invalid character name.")
    drafts[id] = restoreCharacterDesign(design, input.templateVersion)
  }
  if (typeof input.character !== "string" || !Object.hasOwn(drafts, input.character)) throw new Error("The selected character is missing from these edits.")
  return { character: input.character, drafts }
}
