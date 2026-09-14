import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { AUDIO_PROFILES, DEFAULT_CHARACTER_SOUNDS, migrateSoftDirtFootsteps, validateCharacterSounds, crossedSoundMarker, distanceGain, zoomSoundGain, previewSoundViewSize } from './character-sound-store'
import { characterBark, SOUND_AUDITIONS } from './sound-catalog'
import { CHARACTER_VOICES } from './voice-lines'
import { soundEventForClip, soundMarkersCrossed, soundImpactPhase } from './character-sound-motion'

describe('authored character sounds',()=>{
  it('covers all callings/jobs and bodies with real, non-clipping WAV greetings',()=>{
    let count=0
    for(const profile of Object.keys(AUDIO_PROFILES)) {
      const type=(profile.startsWith('job/')?'peasant':profile) as keyof typeof CHARACTER_VOICES
      for(const body of CHARACTER_VOICES[type].bodyTypes){
        const bark=characterBark(type,body,1,1,undefined,profile)
        expect(bark.recorded,`${profile}/${body}`).toBe(true)
        expect(bark.url).toContain(type==='knight'?'/v9/':'/v6/')
        const sound=SOUND_AUDITIONS.find(s=>s.url===bark.url)!
        expect(sound.peakDb).toBeLessThanOrEqual(-3)
        const file=readFileSync(`public${bark.url}`)
        expect(file.toString('ascii',0,4)).toBe('RIFF')
        expect(file.length).toBeGreaterThan(1000)
        count++
      }
      for(const event of ['walking','work','idle'] as const) {
        const clips=DEFAULT_CHARACTER_SOUNDS.profiles[profile][event].clips
        expect(clips.length).toBeGreaterThan(0)
        for(const id of clips)expect(existsSync(`public${SOUND_AUDITIONS.find(s=>s.id===id)!.url}`)).toBe(true)
      }
    }
    expect(count).toBe(23)
  })
  it('replaces saved stock footsteps without discarding custom settings',()=>{
    const d=structuredClone(DEFAULT_CHARACTER_SOUNDS)
    d.profiles.peasant.walking={...d.profiles.peasant.walking,clips:['step-boots-1','step-boots-2'],volume:.5,jitter:.04}
    d.profiles.knight.walking={...d.profiles.knight.walking,clips:['step-mail-1'],volume:.19,cooldown:.7}
    d.profiles.merchant.walking.clips=['cloth-work-1']
    const result=migrateSoftDirtFootsteps(d)
    expect(result.profiles.peasant.walking.clips).toEqual(['dirt-floor-step-1','dirt-floor-step-2','dirt-floor-step-3'])
    expect(result.profiles.peasant.walking.volume).toBe(.32)
    expect(result.profiles.knight.walking.volume).toBe(.19)
    expect(result.profiles.knight.walking.cooldown).toBe(.7)
    expect(result.profiles.merchant.walking.clips).toEqual(['cloth-work-1'])
    expect(result.mixer).toEqual(d.mixer)
    expect(d.profiles.peasant.walking.clips).toEqual(['step-boots-1','step-boots-2'])
  })
  it('attenuates wide views strongly while retaining full close-up levels',()=>{
    expect(zoomSoundGain(8)).toBe(1)
    expect(zoomSoundGain(24)).toBe(.25)
    expect(zoomSoundGain(120)).toBeCloseTo(.01)
    expect(zoomSoundGain(140)).toBeLessThan(.01)
    expect(zoomSoundGain(previewSoundViewSize(6))).toBe(1)
    expect(zoomSoundGain(previewSoundViewSize(1))).toBeCloseTo(1/36)
  })
  it('round trips edits and rejects unsafe or incomplete imports atomically',()=>{
    const d=structuredClone(DEFAULT_CHARACTER_SOUNDS)
    d.profiles['job/woodcutter'].work.volume=.23
    expect(validateCharacterSounds(JSON.parse(JSON.stringify(d)))).toEqual(d)
    d.profiles.knight.walking.clips=['/arbitrary/url']
    expect(()=>validateCharacterSounds(d)).toThrow()
    d.profiles.knight.walking.clips=[];d.mixer.maxVoices=Infinity
    expect(()=>validateCharacterSounds(d)).toThrow()
    expect(()=>validateCharacterSounds({kind:'character-audio',version:1,mixer:{}})).toThrow()
  })
  it('fires at foot transfers and work impacts, with no duplicate or reset backlog',()=>{
    expect(soundMarkersCrossed(.05,.1,'walking',.1)).toBe(true)
    expect(soundMarkersCrossed(.55,.61,'walking',.1)).toBe(true)
    expect(soundMarkersCrossed(.2,.25,'walking',.1)).toBe(false)
    expect(crossedSoundMarker(22/24,23/24,23/24)).toBe(true)
    expect(crossedSoundMarker(23/24,23/24,23/24)).toBe(false)
    expect(crossedSoundMarker(.8,0,23/24)).toBe(false)
    expect(crossedSoundMarker(.2,8,23/24)).toBe(false)
    expect(soundImpactPhase('woodcutting',{rigTiming:true,phase:.9})).toBe(26/64)
    expect(soundImpactPhase('building',{rigTiming:true,phase:.9})).toBe(20/24)
    expect(soundImpactPhase('woodcutting',{rigTiming:false,phase:.9})).toBe(.9)
    expect(soundEventForClip('treeFelling')).toBe('work')
    expect(soundEventForClip('flying')).toBeUndefined()
    expect(distanceGain(0,20)).toBe(1)
    expect(distanceGain(10,20)).toBe(.25)
    expect(distanceGain(21,20)).toBe(0)
  })
})
