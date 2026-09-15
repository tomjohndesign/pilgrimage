import recipe from "../../assets/recipes/voices.json"
import type { PersonDesign } from "./base-person/design"
import type { TravelerTypeId } from "./travelers"

export type BodyType = PersonDesign["bodyType"]

export interface VoiceLine {
  /** The authentic line, in the character's own tongue. What an actor reads. */
  text: string
  /** Respelling used only by the placeholder macOS TTS render. */
  phonetic: string
  /** English meaning, shown as a subtitle so the tongue stays legible. */
  gloss: string
  id: string
}

export interface CharacterVoice {
  label: string
  tongue: string
  /** Allowed voice body types. Knights and friars are male; nuns are female. */
  bodyTypes: BodyType[]
  select: VoiceLine[]
  repeat: VoiceLine[]
}

export const CHARACTER_VOICES = Object.fromEntries(
  Object.entries(recipe.voices).map(([type, voice]) => [type, {
    label: voice.label,
    tongue: voice.tongue,
    bodyTypes: Object.keys(voice.prototype) as BodyType[],
    select: voice.select,
    repeat: voice.repeat,
  } satisfies CharacterVoice]),
) as Record<TravelerTypeId, CharacterVoice>

/** A calling bound to one sex answers with that voice whatever is asked for. */
export function voiceBodyType(voice: CharacterVoice, bodyType: BodyType): BodyType {
  return voice.bodyTypes.includes(bodyType) ? bodyType : voice.bodyTypes[0]
}

export function barkUrl(type: TravelerTypeId, bodyType: BodyType, line: VoiceLine): string {
  return `/sounds/voices/${type}/${bodyType.toLowerCase()}/${line.id}-v${recipe.version}.wav`
}

/** Re-selecting the same traveler inside this window continues their streak. */
export const BARK_STREAK_MS = 6000

/** Cycle neutral dialogue options, with a stable starting line per traveler. */
export function barkForStreak(voice: CharacterVoice, travelerId: number, streak: number): VoiceLine | undefined {
  const seed = (Math.imul(travelerId + 1, 2654435761) >>> 0) % 997
  const step = Math.max(1, Math.floor(streak))
  return voice.select[(seed + step - 1) % voice.select.length]
}

/** Streak bookkeeping is pure so response cycling can be tested without audio. */
export interface BarkHistory { travelerId: number; at: number; streak: number }

export function nextStreak(previous: BarkHistory | undefined, travelerId: number, now: number): number {
  if (!previous || previous.travelerId !== travelerId || now - previous.at > BARK_STREAK_MS) return 1
  return previous.streak + 1
}
