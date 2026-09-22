"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { WALK_STANCE_FRACTION } from "./base-person/pose"
import { TRAVELER_TYPES } from "./travelers"
import { CHICKEN_KINDS, WILDLIFE_PROFILES } from "./wildlife/species"
import { SOUND_AUDITIONS } from "./sound-catalog"

export const AUDIO_EVENTS = ["selection", "walking", "work", "idle"] as const
export type CharacterAudioEvent = typeof AUDIO_EVENTS[number]
/** Animals with recorded sound banks. Chickens have editable, initially silent profiles below. */
export const ANIMAL_SOUND_SPECIES = ["horse", "donkey", "ox", "sheep", "goat", "deer", "buck", "rabbit", "boar", "fox", "hawk", "sparrow"] as const
export const SCENE_AUDIO_PROFILES: Record<string, string> = {
  ...Object.fromEntries(ANIMAL_SOUND_SPECIES.map(species => [`animal/${species}`, species[0].toUpperCase() + species.slice(1)])),
  ...Object.fromEntries(CHICKEN_KINDS.map(kind => [`animal/${kind}`, WILDLIFE_PROFILES[kind].label])),
  "scene/crowd": "NPC conversation", "vehicle/cart": "Cart wheels",
  "scene/crowd-accents": "Crowd laughs and calls", "scene/birds": "Woodland birds",
  "scene/waterfall": "Waterfall", "scene/stream": "Flowing water", "scene/shore": "Pond and lake water", "scene/wind": "Wind through leaves",
}
export const AUDIO_PROFILES: Record<string, string> = {
  ...SCENE_AUDIO_PROFILES,
  ...Object.fromEntries(Object.values(TRAVELER_TYPES).map(t => [t.id, t.label])),
  "job/woodcutter": "Woodcutter", "job/tavern": "Tavern worker", "job/shepherd": "Shepherd", "job/market": "Market keeper",
}
export interface EventSound { rigTiming: boolean; enabled: boolean; clips: string[]; volume: number; rate: number; jitter: number; cooldown: number; range: number; phase: number }
export interface CharacterSoundDocument {
  kind: "character-audio"; version: 1
  mixer: { background: number; master: number; selection: number; foley: number; ambience: number; ducking: number; maxVoices: number; zoomRolloff: number; sceneEnabled: boolean; solo: "none" | CharacterAudioEvent }
  profiles: Record<string, Record<CharacterAudioEvent, EventSound>>
}
const bank = (name: string) => SOUND_AUDITIONS.filter(s => "bank" in s && s.bank === name).map(s => s.id)
const event = (clips: string[], volume: number, overrides: Partial<EventSound> = {}): EventSound => ({ rigTiming: true, enabled: true, clips, volume, rate: 1, jitter: .04, cooldown: .15, range: 16, phase: 0, ...overrides })
const sourceProfiles = Object.fromEntries(Object.keys(SCENE_AUDIO_PROFILES).map(id => {
  const animal = id.startsWith("animal/"), cart = id === "vehicle/cart"
  const environmentBanks: Record<string,string> = {"scene/waterfall":"waterfall","scene/crowd-accents":"crowd-accent","scene/birds":"woodland-birds","scene/stream":"water-stream","scene/shore":"water-shore","scene/wind":"wind-leaves"}
  const clips = bank(environmentBanks[id] ?? (animal ? id.replace("/", "-") : cart ? "cart-wheel" : "npc-murmur"))
  return [id, {
    selection: event(animal ? clips : [], .65, { enabled: animal && clips.length > 0, cooldown: 0, jitter: 0 }),
    walking: event(cart ? clips : [], .42, { enabled: cart, cooldown: 2.5, jitter: .025, range: 24 }),
    work: event([], 0, { enabled: false }),
    idle: event(cart ? [] : clips, id==='scene/crowd'?.65:id==='scene/wind'?.5:id==='scene/crowd-accents'?.45:animal ? .65 : .8, {
      enabled: !cart && clips.length > 0, cooldown: id==='scene/crowd'?4:id==='scene/crowd-accents'?35:id==='scene/birds'?5:['scene/stream','scene/shore','scene/waterfall','scene/wind'].includes(id)?0:animal ? ['animal/hawk','animal/sparrow'].includes(id)?8:18 : 18,
      jitter: id==='scene/wind'||id==='scene/stream'||id==='scene/shore'||id==='scene/waterfall'?0:.025, range: id==='scene/stream'||id==='scene/shore'?18:24,
    }),
  }]
})) as Record<string, Record<CharacterAudioEvent, EventSound>>
export const DEFAULT_CHARACTER_SOUNDS: CharacterSoundDocument = {
  kind: "character-audio", version: 1,
  mixer: { background: 1.3, master: .8, selection: 1, foley: .55, ambience: .25, ducking: .35, maxVoices: 12, zoomRolloff: 2, sceneEnabled: true, solo: "none" },
  profiles: {...Object.fromEntries(Object.keys(AUDIO_PROFILES).map(id => [id, {
    selection: event([], 1, { jitter: 0, cooldown: 0, rate: id === "peasant" ? 1.2 : 1 }),
    walking: event(bank("dirt-floor"), .32, {phase: WALK_STANCE_FRACTION - .5, jitter: .02}),
    work: event(bank(id === "minstrel" ? "minstrel-phrase" : id === "job/tavern" ? "pottery" : ["peasant", "friar", "job/woodcutter"].includes(id) ? "axe-hit" : "cloth-work"), id === "minstrel" ? .3 : .6, { cooldown: id === "minstrel" ? 5 : .35, phase: 23/24, range: 22 }),
    idle: event(bank("cloth-work"), .2, { cooldown: 15, range: 10 }),
  }])) as CharacterSoundDocument["profiles"], ...sourceProfiles},
}
const validNumber = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max
export function validateCharacterSounds(value: unknown): CharacterSoundDocument {
  const d = value as CharacterSoundDocument
  if (!d || d.kind !== "character-audio" || d.version !== 1 || !d.profiles || !d.mixer) throw new Error("Expected a version 1 character-audio document.")
  const m = { ...d.mixer, background: d.mixer.background ?? 1.3, zoomRolloff: d.mixer.zoomRolloff ?? 2 }
  if (!validNumber(m.background,0,2) || !validNumber(m.zoomRolloff, .5, 4) || ![m.master,m.selection,m.foley,m.ambience,m.ducking].every(n => validNumber(n,0,1)) || !validNumber(m.maxVoices,1,32) || !Number.isInteger(m.maxVoices) || typeof m.sceneEnabled !== "boolean" || !["none",...AUDIO_EVENTS].includes(m.solo)) throw new Error("Invalid mixer settings.")
  const known = new Set(SOUND_AUDITIONS.map(s => s.id))
  const profiles: CharacterSoundDocument["profiles"] = {}
  for (const id of Object.keys(AUDIO_PROFILES)) {
    profiles[id] = {} as Record<CharacterAudioEvent,EventSound>
    for (const name of AUDIO_EVENTS) {
      const e = (d.profiles[id] ?? sourceProfiles[id] ?? (id === "squire" ? DEFAULT_CHARACTER_SOUNDS.profiles.squire : undefined))?.[name]
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
  for(const id of ['animal/hawk','animal/sparrow'])if(document.profiles[id].idle.cooldown===18)document.profiles[id].idle.cooldown=8
  const work=document.profiles.minstrel.work
  if(work.clips.length===1&&work.clips[0]==='lyre-pluck-1'){
    work.clips=bank('minstrel-phrase')
    if(work.cooldown===.35)work.cooldown=5
    if(work.volume===.6)work.volume=.3
  }
  const conversation=document.profiles['scene/crowd'].idle
  if(conversation.clips.length===3&&conversation.clips.every(id=>/^crowd-murmur-[123]-v10$/.test(id))){
    conversation.clips=bank('npc-murmur')
    if(conversation.cooldown===2.5)conversation.cooldown=4
  }
  if(conversation.clips.length===6&&conversation.clips.every(id=>/^npc-murmur-[1-6]-v13$/.test(id))){
    if(conversation.cooldown===18)conversation.cooldown=4
    if(conversation.volume===.8)conversation.volume=.65
  }
  const reactions=document.profiles['scene/crowd-accents'].idle
  if(reactions.clips.length===3&&reactions.clips.every(id=>['crowd-chuckle-v11','crowd-call-v11','crowd-reply-v11'].includes(id))){
    reactions.clips=bank('crowd-accent')
    if(reactions.cooldown===12)reactions.cooldown=35
  }
  const tavern=document.profiles['job/tavern'].idle
  if(tavern.clips.length===1&&tavern.clips[0]==='road-laughter')tavern.clips=bank('cloth-work')
  return document
}
export const useCharacterSoundStore = create<{ document:CharacterSoundDocument; patchEvent:(id:string,event:CharacterAudioEvent,patch:Partial<EventSound>)=>void; patchMixer:(patch:Partial<CharacterSoundDocument["mixer"]>)=>void; replace:(input:unknown)=>void }>()(persist(set=>({
  document:DEFAULT_CHARACTER_SOUNDS,
  patchEvent:(id,event,patch)=>set(s=>({document:validateCharacterSounds({...s.document,profiles:{...s.document.profiles,[id]:{...s.document.profiles[id],[event]:{...s.document.profiles[id][event],...patch}}}})})),
  patchMixer:patch=>set(s=>({document:validateCharacterSounds({...s.document,mixer:{...s.document.mixer,...patch}})})),
  replace:input=>set({document:validateCharacterSounds(input)}),
}),{name:"pilgrimage-character-sounds-v1",version:5,migrate:(saved)=>({document:migrateSoftDirtFootsteps((saved as {document:unknown}).document)}),partialize:s=>({document:s.document}),merge:(saved,current)=>{try{return {...current,document:validateCharacterSounds((saved as {document:unknown}).document)}}catch{return current}}}))
export const characterSoundsJson = () => JSON.stringify(useCharacterSoundStore.getState().document,null,2)

/** Phase crossings shared by the rig preview and live renderer. No backlog after a reset. */
export function crossedSoundMarker(previous: number, current: number, marker: number): boolean {
  if (!Number.isFinite(previous) || current <= previous || current - previous > 1) return false
  return Math.floor(current - marker) > Math.floor(previous - marker)
}
export function distanceGain(distance: number, range: number): number { return Math.max(0,1-Math.max(0,distance)/range)**2 }

/** Camera altitude is fixed: visible ground span, not camera height, controls audibility. */
export function zoomSoundGain(viewSize:number,rolloff=2,reference=12):number {
  return Math.min(1,(reference/Math.max(reference,viewSize))**rolloff)
}
/** The sprite magnification in the editor uses the same curve: 6x = close view. */
export function previewSoundViewSize(zoom:number):number { return 72/Math.max(.1,zoom) }
