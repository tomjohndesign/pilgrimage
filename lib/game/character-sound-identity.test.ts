import {describe,it,expect} from 'vitest'
import {PERSON_PRESETS} from './base-person/design'
import {characterSoundIdentity,PRESET_SOUND_IDENTITIES} from './character-sound-identity'
import {characterBark} from './sound-catalog'
import type {TravelerTypeId} from './travelers'

describe('preview greeting identity',()=>{
  it('gives every visible preset a distinct recorded greeting',()=>{
    const urls=new Set<string>()
    for(const [name,design] of Object.entries(PERSON_PRESETS)) {
      expect(PRESET_SOUND_IDENTITIES[name],name).toBeDefined()
      const {profile,variant}=characterSoundIdentity(`preset/${name}`)
      const bark=characterBark(profile as TravelerTypeId,design.bodyType,0,1,undefined,profile,[],variant)
      expect(bark.recorded,name).toBe(true)
      expect(urls.has(bark.url),name).toBe(false)
      urls.add(bark.url)
    }
    expect(urls.size).toBe(Object.keys(PERSON_PRESETS).length)
  })
  it('retains calling/job identity and consistent body-variant lines',()=>{
    expect(characterSoundIdentity('preset/Monk')).toEqual({profile:'friar',variant:0})
    expect(characterSoundIdentity('job/woodcutter/female-broad')).toEqual({profile:'job/woodcutter',variant:2})
    expect(characterSoundIdentity('merchant/male-tall')).toEqual({profile:'merchant',variant:1})
    expect(characterSoundIdentity('preset/Storybook','knight')).toEqual({profile:'knight',variant:0})
  })
})
