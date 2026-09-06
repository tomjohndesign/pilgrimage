import { validatePersonDesign, type PersonDesign } from "./design"
import { BASE_PERSON } from "./pose"

export function characterEditsJson(character: string, drafts: Record<string, PersonDesign>, design: PersonDesign) {
  return JSON.stringify({ format: "pilgrimage-character-edits", version: 1, templateVersion: BASE_PERSON.version,
    character, drafts: { ...drafts, [character]: design } }, null, 2) + "\n"
}

/** Validate the whole import before replacing any saved character. */
export function parseCharacterEdits(text: string, currentCharacter: string): { character: string; drafts: Record<string, PersonDesign> } {
  if (text.length > 2_000_000) throw new Error("JSON must be under 2 MB.")
  const input = JSON.parse(text)
  if (input?.format !== "pilgrimage-character-edits") return { character: currentCharacter, drafts: { [currentCharacter]: validatePersonDesign(input) } }
  if (input.version !== 1 || input.templateVersion !== BASE_PERSON.version) throw new Error("These edits use a different character rig version.")
  if (!input.drafts || typeof input.drafts !== "object" || Array.isArray(input.drafts) || Object.keys(input.drafts).length > 100) throw new Error("Invalid character drafts.")
  const drafts: Record<string, PersonDesign> = {}
  for (const [id, design] of Object.entries(input.drafts)) {
    if (!id || id.length > 100 || ["__proto__", "constructor", "prototype"].includes(id)) throw new Error("Invalid character name.")
    drafts[id] = validatePersonDesign(design)
  }
  if (typeof input.character !== "string" || !Object.hasOwn(drafts, input.character)) throw new Error("The selected character is missing from these edits.")
  return { character: input.character, drafts }
}
