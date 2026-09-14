import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const sources: FakeNode[]=[]
class FakeNode {
  gain={value:1,setTargetAtTime:vi.fn()}; pan={value:0};playbackRate={value:1}
  threshold={value:0};knee={value:0};ratio={value:0};onended?:()=>void
  connect=vi.fn();disconnect=vi.fn();start=vi.fn();stop=vi.fn(()=>this.onended?.())
}
class FakeContext {
  state='running';currentTime=0;destination={}
  createGain=()=>new FakeNode();createStereoPanner=()=>new FakeNode();createDynamicsCompressor=()=>new FakeNode()
  createAnalyser=()=>({...new FakeNode(),fftSize:256,getFloatTimeDomainData:vi.fn()})
  createBufferSource=()=>{const n=new FakeNode();sources.push(n);return n}
  decodeAudioData=vi.fn(async()=>({duration:.5}));resume=vi.fn()
}
let audio:typeof import('./scene-audio'),store:typeof import('./character-sound-store')
beforeEach(async()=>{
 vi.resetModules();sources.length=0
 vi.stubGlobal('AudioContext',FakeContext)
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)})))
 audio=await import('./scene-audio');store=await import('./character-sound-store')
})
afterEach(()=>{audio.stopSceneAudio();vi.unstubAllGlobals()})
describe('scene event mixing',()=>{
 it('gates visibility, range, solo and voice budget before loading',async()=>{
  await audio.unlockSceneAudio()
  expect(await audio.emitCharacterAudio('peasant','walking',{visible:false})).toBe(false)
  expect(await audio.emitCharacterAudio('peasant','walking',{distance:80})).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
  store.useCharacterSoundStore.getState().patchMixer({maxVoices:1})
  expect(await audio.emitCharacterAudio('peasant','walking',{actor:'one',pan:-.5})).toBe(true)
  expect(await audio.emitCharacterAudio('knight','walking',{actor:'two'})).toBe(false)
  expect(sources).toHaveLength(1)
  expect(audio.useAudioQA.getState().history[0].result).toBe('voice limit')
  store.useCharacterSoundStore.getState().patchMixer({solo:'work'})
  expect(sources[0].stop).toHaveBeenCalled()
  expect(await audio.emitCharacterAudio('peasant','walking')).toBe(false)
 })
 it('scales new effects and already-playing effects with camera zoom',async()=>{
  const {useCameraStore}=await import('./camera-store')
  useCameraStore.setState({viewSize:12})
  await audio.unlockSceneAudio()
  await audio.emitCharacterAudio('peasant','walking',{actor:'near'})
  const level=sources[0].connect.mock.calls[0][0] as FakeNode
  const near=level.gain.value
  useCameraStore.setState({viewSize:120})
  expect(level.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(near*.01)
  await audio.emitCharacterAudio('peasant','walking',{actor:'far'})
  const far=sources[1].connect.mock.calls[0][0] as FakeNode
  expect(far.gain.value).toBeCloseTo(near*.01)
  await audio.emitCharacterAudio('peasant','walking',{actor:'preview',preview:true,viewSize:12})
  const preview=sources[2].connect.mock.calls[0][0] as FakeNode
  expect(preview.gain.value).toBeCloseTo(near)
  audio.setPreviewSoundViewSize(72)
  expect(preview.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(near/36)
 })
 it('keeps work-cue volume constant while idle ambience fades with zoom',async()=>{
  const {useCameraStore}=await import('./camera-store')
  useCameraStore.setState({viewSize:12})
  await audio.unlockSceneAudio()
  await audio.emitCharacterAudio('peasant','work',{actor:'worker'})
  await audio.emitCharacterAudio('peasant','idle',{actor:'idle'})
  const work=sources[0].connect.mock.calls[0][0] as FakeNode
  const idle=sources[1].connect.mock.calls[0][0] as FakeNode
  const workLevel=work.gain.value,idleLevel=idle.gain.value
  useCameraStore.setState({viewSize:120})
  expect(work.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(workLevel)
  expect(idle.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(idleLevel*.01)
 })
 it('never starts a pending decode after stop/mute/navigation',async()=>{
  let finish!:(value:unknown)=>void
  vi.stubGlobal('fetch',()=>new Promise(resolve=>{finish=resolve}))
  await audio.unlockSceneAudio()
  const result=audio.emitCharacterAudio('peasant','work')
  audio.stopSceneAudio()
  finish({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)})
  expect(await result).toBe(false)
  expect(sources).toHaveLength(0)
 })
 it('uses variations without immediate repeats, respects cooldown and stops muted events',async()=>{
  await audio.unlockSceneAudio()
  store.useCharacterSoundStore.getState().patchEvent('peasant','walking',{cooldown:0})
  await audio.emitCharacterAudio('peasant','walking');await audio.emitCharacterAudio('peasant','walking')
  const h=audio.useAudioQA.getState().history
  expect(h[0].clip).not.toBe(h[1].clip)
  store.useCharacterSoundStore.getState().patchEvent('peasant','walking',{enabled:false})
  expect(sources.every(s=>s.stop.mock.calls.length)).toBe(true)
  expect(await audio.emitCharacterAudio('peasant','walking')).toBe(false)
 })
})
