import { afterEach, expect, it, vi } from 'vitest'
import { Object3D, OrthographicCamera } from 'three'
import { tickCharacterSound } from './character-sound-motion'
import { emitCharacterAudio, stopActorAudio } from './scene-audio'
vi.mock('./scene-audio',()=>({emitCharacterAudio:vi.fn(),stopActorAudio:vi.fn()}))
vi.mock('./scene-sound-sources',()=>({touchObjectSoundSource:vi.fn()}))
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks()})
it('starts minstrel music on performance entry, spaces phrases by wall time, and stops on departure',()=>{
 const now=vi.spyOn(performance,'now').mockReturnValue(0)
 const person=new Object3D(),camera=new OrthographicCamera(-12,12,12,-12,.1,100)
 camera.position.z=10;camera.updateMatrixWorld()
 person.userData={audioProfile:'minstrel',audioActor:'minstrel/1',activity:'performing'}
 // Alternate appearances may report idle; the simulation activity still owns the performance.
 tickCharacterSound(person,camera,'idle',0)
 expect(emitCharacterAudio).toHaveBeenCalledWith('minstrel','work',expect.objectContaining({actor:'minstrel/1',visible:true}))
 now.mockReturnValue(1000);tickCharacterSound(person,camera,'idle',12)
 expect(emitCharacterAudio).toHaveBeenCalledTimes(1)
 now.mockReturnValue(5100);tickCharacterSound(person,camera,'idle',40)
 expect(emitCharacterAudio).toHaveBeenCalledTimes(2)
 person.userData.playbackRate=0
 now.mockReturnValue(11000);tickCharacterSound(person,camera,'idle',41)
 expect(emitCharacterAudio).toHaveBeenCalledTimes(2)
 expect(stopActorAudio).toHaveBeenCalledWith('minstrel/1')
 person.userData.playbackRate=1;person.userData.activity='walking'
 tickCharacterSound(person,camera,'walk',.1)
 expect(emitCharacterAudio).toHaveBeenCalledTimes(2)
})
