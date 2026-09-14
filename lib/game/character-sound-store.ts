"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { WALK_STANCE_FRACTION } from "./base-person/pose"
import { TRAVELER_TYPES } from "./travelers"
import { SOUND_AUDITIONS } from "./sound-catalog"

export const AUDIO_EVENTS = ["selection", "walking", "work", "idle"] as const
export type CharacterAudioEvent = typeof AUDIO_EVENTS[number]
export const AUDIO_PROFILES: Record<string, string> = {
  ...Object.fromEntries(Object.values(TRAVELER_TYPES).map(t => [t.id, t.label])),
  "job/woodcutter": "Woodcutter", "job/tavern": "Tavern worker", "job/shepherd": "Shepherd", "job/market": "Market keeper",
}
export interface EventSound { rigTiming: boolean; enabled: boolean; clips: string[]; volume: number; rate: number; jitter: number; cooldown: number; range: number; phase: number }
export interface CharacterSoundDocument {
  kind: "character-audio"; version: 1
  mixer: { master: number; selection: number; foley: number; ambience: number; ducking: number; maxVoices: number; zoomRolloff: number; sceneEnabled: boolean; solo: "none" | CharacterAudioEvent }
  profiles: Record<string, Record<CharacterAudioEvent, EventSound>>
}
const bank = (name: string) => SOUND_AUDITIONS.filter(s => "bank" in s && s.bank === name).map(s => s.id)
const event = (clips: string[], volume: number, overrides: Partial<EventSound> = {}): EventSound => ({ rigTiming: true, enabled: true, clips, volume, rate: 1, jitter: .04, cooldown: .15, range: 16, phase: 0, ...overrides })
export const DEFAULT_CHARACTER_SOUNDS: CharacterSoundDocument = {
  kind: "character-audio", version: 1,
  mixer: { master: .8, selection: 1, foley: .55, ambience: .25, ducking: .35, maxVoices: 12, zoomRolloff: 2, sceneEnabled: true, solo: "none" },
  profiles: Object.fromEntries(Object.keys(AUDIO_PROFILES).map(id => [id, {
    selection: event([], 1, { jitter: 0, cooldown: 0, rate: id === "peasant" ? 1.2 : 1 }),
    walking: event(bank("dirt-floor"), .32, {phase: WALK_STANCE_FRACTION - .5, jitter: .02}),
    work: event(bank(id === "minstrel" ? "lyre-pluck" : id === "job/tavern" ? "pottery" : ["peasant", "friar", "job/woodcutter"].includes(id) ? "axe-hit" : "cloth-work"), .6, { cooldown: .35, phase: 23/24, range: 22 }),
    idle: event(id === "job/tavern" ? ["road-laughter"] : bank("cloth-work"), .2, { cooldown: 15, range: 10 }),
  }])) as CharacterSoundDocument["profiles"],
}
const validNumber = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max
export function validateCharacterSounds(value: unknown): CharacterSoundDocument {
  const d = value as CharacterSoundDocument
  if (!d || d.kind !== "character-audio" || d.version !== 1 || !d.profiles || !d.mixer) throw new Error("Expected a version 1 character-audio document.")
  const m = { ...d.mixer, zoomRolloff: d.mixer.zoomRolloff ?? 2 }
  if (!validNumber(m.zoomRolloff, .5, 4) || ![m.master,m.selection,m.foley,m.ambience,m.ducking].every(n => validNumber(n,0,1)) || !validNumber(m.maxVoices,1,32) || !Number.isInteger(m.maxVoices) || typeof m.sceneEnabled !== "boolean" || !["none",...AUDIO_EVENTS].includes(m.solo)) throw new Error("Invalid mixer settings.")
  const known = new Set(SOUND_AUDITIONS.map(s => s.id))
  const profiles: CharacterSoundDocument["profiles"] = {}
  for (const id of Object.keys(AUDIO_PROFILES)) {
    profiles[id] = {} as Record<CharacterAudioEvent,EventSound>
    for (const name of AUDIO_EVENTS) {
      const e = d.profiles[id]?.[name]
      if (!e || typeof e.rigTiming !== "boolean" || typeof e.enabled !== "boolean" || !Array.isArray(e.clips) || e.clips.length > 16 || e.clips.some(c => !known.has(c)) || !validNumber(e.volume,0,1) || !validNumber(e.rate,.5,1.5) || !validNumber(e.jitter,0,.2) || !validNumber(e.cooldown,0,60) || !validNumber(e.range,1,80) || !validNumber(e.phase,0,.999)) throw new Error(`Invalid ${name} settings for ${id}.`)
      profiles[id][name] = { rigTiming:e.rigTiming, enabled:e.enabled,clips:[...e.clips],volume:e.volume,rate:e.rate,jitter:e.jitter,cooldown:e.cooldown,range:e.range,phase:e.phase }
    }
  }
  return {kind:"character-audio",version:1,mixer:{...m},profiles}
}
/** Upgrade the rejected stock footsteps while retaining authored mix/timing edits. */
export function migrateSoftDirtFootsteps(input: unknown): CharacterSoundDocument {
  const document = validateCharacterSounds(input)
  for (const profile of Object.values(document.profiles)) {
    const walk = profile.walking
    if (walk.clips.length && walk.clips.every(id => /^(step-(soft|boots|mail)-[12]|step-dirt-soft-[12])$/.test(id))) {
      walk.clips = bank("dirt-floor")
      if (walk.volume === .5) walk.volume = .32
      if (walk.jitter === .04) walk.jitter = .02
    }
  }
  return document
}
export const useCharacterSoundStore = create<{ document:CharacterSoundDocument; patchEvent:(id:string,event:CharacterAudioEvent,patch:Partial<EventSound>)=>void; patchMixer:(patch:Partial<CharacterSoundDocument["mixer"]>)=>void; replace:(input:unknown)=>void }>()(persist(set=>({
  document:DEFAULT_CHARACTER_SOUNDS,
  patchEvent:(id,event,patch)=>set(s=>({document:validateCharacterSounds({...s.document,profiles:{...s.document.profiles,[id]:{...s.document.profiles[id],[event]:{...s.document.profiles[id][event],...patch}}}})})),
  patchMixer:patch=>set(s=>({document:validateCharacterSounds({...s.document,mixer:{...s.document.mixer,...patch}})})),
  replace:input=>set({document:validateCharacterSounds(input)}),
}),{name:"pilgrimage-character-sounds-v1",version:2,migrate:(saved)=>({document:migrateSoftDirtFootsteps((saved as {document:unknown}).document)}),partialize:s=>({document:s.document}),merge:(saved,current)=>{try{return {...current,document:validateCharacterSounds((saved as {document:unknown}).document)}}catch{return current}}}))
export const characterSoundsJson = () => JSON.stringify(useCharacterSoundStore.getState().document,null,2)

/** Phase crossings shared by the rig preview and live renderer. No backlog after a reset. */
export function crossedSoundMarker(previous: number, current: number, marker: number): boolean {
  if (!Number.isFinite(previous) || current <= previous || current - previous > 1) return false
  return Math.floor(current - marker) > Math.floor(previous - marker)
}
export function distanceGain(distance: number, range: number): number { return Math.max(0,1-Math.max(0,distance)/range)**2 }

/** Camera altitude is fixed: visible ground span, not camera height, controls audibility. */
export function zoomSoundGain(viewSize:number,rolloff=2):number {
  return Math.min(1,(12/Math.max(12,viewSize))**rolloff)
}
/** The sprite magnification in the editor uses the same curve: 6x = close view. */
export function previewSoundViewSize(zoom:number):number { return 72/Math.max(.1,zoom) }
