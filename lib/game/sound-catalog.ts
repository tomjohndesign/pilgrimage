import recordings from "../../assets/recipes/elevenlabs-audition.json"
import { CHARACTER_VOICES, barkForStreak, barkUrl, voiceBodyType, type BodyType } from "./voice-lines"
import type { TravelerTypeId } from "./travelers"

export const SOUND_AUDITIONS = recordings.sounds
export const VOICE_AUDITIONS = SOUND_AUDITIONS.filter(sound => sound.kind === "voice")
export const SFX_AUDITIONS = SOUND_AUDITIONS.filter(sound => sound.kind === "sfx")
export const COIN_SOUND_URL = SFX_AUDITIONS.find(sound => sound.id === "coin-purse-1")!.url
export const ROAD_AMBIENCE = SFX_AUDITIONS.filter(sound => sound.layer)

/** A calling/job and body resolve to the same recording in the editor and game. */
export function characterBark(type: TravelerTypeId, bodyType: BodyType, travelerId: number, streak: number, variant?: string, profile = type as string, clipIds?: string[], voiceVariant = 0) {
  if (type === "squire") { type = "peasant"; bodyType = "Male"; if (profile === "squire") profile = "peasant" }
  const voice = CHARACTER_VOICES[type], body = voiceBodyType(voice, bodyType)
  const available = VOICE_AUDITIONS.filter(sound => sound.character === type && sound.bodyType === body)
  const assigned = clipIds?.length ? available.filter(s => clipIds.includes(s.id)) : []
  const greetings = available.filter(s => s.profile === profile && s.response === "greeting")
  const preferred = variant ? available.filter(s => s.variant === variant) : []
  const extra = available.filter(s => s.response === "select" && !greetings.some(g => g.lineId === s.lineId)).sort((a,b)=>(a.lineId??"").localeCompare(b.lineId??""))
  const defaults = greetings.length ? [...greetings, ...(profile === type ? extra : [])] : available.filter(s => s.response === "select")
  const selection = assigned.length ? assigned : preferred.length ? preferred : defaults
  if (selection.length) {
    const sound = selection[(Math.max(0, Math.floor(voiceVariant)) + Math.max(1, streak) - 1) % selection.length]
    const line = sound.text && sound.gloss ? { id: sound.lineId, text: sound.text, gloss: sound.gloss, phonetic: sound.text } : [...voice.select, ...voice.repeat].find(line => line.id === sound.lineId)!
    return { line, url: sound.url, tongue: sound.tongue ?? voice.tongue, recorded: true, id: sound.id }
  }
  const line = barkForStreak(voice, travelerId, streak)!
  return { line, url: barkUrl(type, body, line), tongue: voice.tongue, recorded: false, id: line.id }
}
