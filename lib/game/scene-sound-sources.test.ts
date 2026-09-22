import { describe, expect, it, vi } from "vitest"
import { existsSync } from "node:fs"
import { SceneSoundScheduler, irregularSoundDelay } from "./scene-sound-sources"
import { ANIMAL_SOUND_SPECIES, DEFAULT_CHARACTER_SOUNDS, SCENE_AUDIO_PROFILES, validateCharacterSounds } from "./character-sound-store"
import { SOUND_AUDITIONS } from "./sound-catalog"

import { CHICKEN_KINDS } from "./wildlife/species"

const source = (profile: string, moving = true, x = 0) => ({ profile, moving, distance: 2, pan: 0, x, z: 0 })
const cooldown = () => 18

describe("visible sound sources", () => {
  it("adds every animal, crowd and cart bank to older saved mixes without losing edits", () => {
    const old = structuredClone(DEFAULT_CHARACTER_SOUNDS)
    for (const profile of Object.keys(SCENE_AUDIO_PROFILES)) delete old.profiles[profile]
    old.profiles.peasant.walking.volume = .19
    old.mixer.master = .31
    const migrated = validateCharacterSounds(old)
    expect(migrated.profiles.peasant.walking.volume).toBe(.19)
    expect(migrated.mixer.master).toBe(.31)
    for (const species of ANIMAL_SOUND_SPECIES) {
      const profile = migrated.profiles[`animal/${species}`]
      expect(profile.selection.clips.length).toBeGreaterThan(0)
      expect(profile.idle.clips).toEqual(profile.selection.clips)
      expect(profile.walking.enabled).toBe(false)
      for (const id of profile.selection.clips) {
        const sound = SOUND_AUDITIONS.find(s => s.id === id)!
        expect(existsSync(`public${sound.url}`)).toBe(true)
        expect(sound.peakDb).toBeLessThanOrEqual(-8)
      }
    }
    for (const kind of CHICKEN_KINDS) {
      const profile = migrated.profiles[`animal/${kind}`]
      expect(profile.selection.enabled).toBe(false)
      expect(profile.selection.clips).toEqual([])
      expect(profile.idle.enabled).toBe(false)
    }
    expect(migrated.profiles["scene/crowd"].idle.clips).toHaveLength(6)
    expect(migrated.profiles["vehicle/cart"].walking.clips).toHaveLength(2)
  })

  it("spaces calls irregularly, fires only for moving animals, and has no backlog after culling", () => {
    const emit = vi.fn(), stop = vi.fn(), scheduler = new SceneSoundScheduler(() => .5, stop)
    expect(irregularSoundDelay(18, () => 0)).toBe(18000)
    expect(irregularSoundDelay(18, () => 1)).toBe(45000)
    scheduler.update("horse", source("animal/horse", false), 0)
    scheduler.update("horse", source("animal/horse", false), 15000)
    scheduler.tick(15000, emit, cooldown)
    expect(emit).not.toHaveBeenCalled()
    scheduler.update("horse", source("animal/horse"), 15001)
    scheduler.tick(15001, emit, cooldown)
    expect(emit).toHaveBeenCalledExactlyOnceWith("animal/horse", "idle", expect.objectContaining({actor: "horse"}))
    scheduler.tick(15002, emit, cooldown)
    expect(emit).toHaveBeenCalledTimes(1)
    scheduler.tick(16000, emit, cooldown)
    expect(stop).toHaveBeenCalledWith("horse")
    scheduler.update("horse", source("animal/horse"), 100000)
    scheduler.tick(100000, emit, cooldown)
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it("starts rolling carts, stops them when parked, and clears sounds on lifecycle cleanup", () => {
    const emit = vi.fn(), stop = vi.fn(), scheduler = new SceneSoundScheduler(() => 0, stop)
    scheduler.update("cart", source("vehicle/cart"), 0)
    scheduler.tick(0, emit, cooldown)
    expect(emit).toHaveBeenCalledExactlyOnceWith("vehicle/cart", "walking", expect.objectContaining({actor: "cart"}))
    scheduler.update("cart", source("vehicle/cart", false), 200)
    expect(stop).toHaveBeenCalledWith("cart")
    scheduler.tick(200, emit, cooldown)
    expect(emit).toHaveBeenCalledTimes(1)
    scheduler.clear()
    expect(scheduler.sources.size).toBe(0)
  })

  it("assigns conversations to individual nearby NPCs and stops them with their owner", () => {
    const emit=vi.fn(),stop=vi.fn(),move=vi.fn(),scheduler=new SceneSoundScheduler(()=>0,stop,move)
    const update=(now:number)=>{
      scheduler.update('one',{...source('person'),bodyType:'Male'},now)
      scheduler.update('two',{...source('person',true,2),bodyType:'Female'},now)
    }
    scheduler.update('one',source('person'),0)
    scheduler.update('distant',source('person',true,20),0)
    scheduler.tick(0,emit,cooldown)
    expect(emit).not.toHaveBeenCalled()
    update(0);update(4100);scheduler.tick(4100,emit,cooldown)
    expect(emit).toHaveBeenCalledWith('scene/crowd','idle',expect.objectContaining({actor:'one/conversation',bodyType:'Male'}))
    expect(emit).toHaveBeenCalledTimes(2)
    update(7500);scheduler.tick(7500,emit,cooldown)
    expect(emit).toHaveBeenLastCalledWith('scene/crowd','idle',expect.objectContaining({actor:'two/conversation',bodyType:'Female'}))
    update(10000);scheduler.tick(10000,emit,cooldown)
    expect(emit).toHaveBeenCalledTimes(2)
    scheduler.update('one',{...source('person'),distance:8,pan:.7},10100)
    expect(move).toHaveBeenCalledWith('one/conversation',8,.7)
    scheduler.remove('one')
    expect(stop).toHaveBeenCalledWith('one/conversation')
    expect(stop).toHaveBeenCalledWith('one/reaction')
  })
  it('gives each NPC an independently randomized reaction timer and spaces crowd-wide reactions',()=>{
    const rolls=[0,.2,0,.8],random=()=>rolls.shift()??.5
    const emit=vi.fn(),scheduler=new SceneSoundScheduler(random,vi.fn(),vi.fn())
    scheduler.update('a',source('person'),0);scheduler.update('b',source('person',true,2),0)
    const first=scheduler.sources.get('a')!.laughAt,second=scheduler.sources.get('b')!.laughAt
    expect(first).not.toBe(second)
    const update=(now:number)=>{scheduler.update('a',source('person'),now);scheduler.update('b',source('person',true,2),now)}
    update(first);scheduler.tick(first,emit,()=>35)
    expect(emit).toHaveBeenCalledWith('scene/crowd-accents','idle',expect.objectContaining({actor:'a/reaction'}))
    expect(scheduler.sources.get('a')!.laughAt-first).toBeGreaterThanOrEqual(35000)
    update(first+200);scheduler.tick(first+200,emit,()=>35)
    expect(emit.mock.calls.filter(([p])=>p==='scene/crowd-accents')).toHaveLength(1)
    scheduler.clear()
    expect(scheduler.sources.size).toBe(0)
  })
  it('lets perched birds call',()=>{
    const emit=vi.fn(),scheduler=new SceneSoundScheduler(()=>0,vi.fn())
    scheduler.update('bird',source('animal/sparrow',false),0)
    scheduler.update('bird',source('animal/sparrow',false),2100)
    scheduler.tick(2100,emit,()=>2)
    expect(emit).toHaveBeenCalledWith('animal/sparrow','idle',expect.anything())
  })
})

it('adds independent murmur contributors as more NPCs arrive, with no global speech timer',()=>{
 const emit=vi.fn(),scheduler=new SceneSoundScheduler(()=>0,vi.fn(),vi.fn())
 const update=(count:number,now:number)=>{for(let i=0;i<count;i++)scheduler.update(`person/${i}`,source('person',true,i),now)}
 update(2,0);update(2,1100);scheduler.tick(1100,emit,()=>4)
 expect(emit.mock.calls.filter(([p])=>p==='scene/crowd')).toHaveLength(2)
 update(4,1200);update(4,2300);scheduler.tick(2300,emit,()=>4)
 expect(emit.mock.calls.filter(([p])=>p==='scene/crowd')).toHaveLength(4)
 expect(new Set(emit.mock.calls.map(([, ,o])=>o.actor)).size).toBe(4)
})
