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

describe('animal and crowd layers',()=>{
 it('gives selection priority over a full background budget and works with scene effects off',async()=>{
  await audio.unlockSceneAudio()
  store.useCharacterSoundStore.getState().patchMixer({maxVoices:1})
  await audio.emitCharacterAudio('peasant','walking')
  expect(await audio.playSourceSelection('animal/horse')).toBe(true)
  expect(sources[0].stop).toHaveBeenCalled()
  store.useCharacterSoundStore.getState().patchMixer({sceneEnabled:false})
  expect(await audio.playSourceSelection('animal/ox')).toBe(true)
 })
 it('keeps animal selection constant while crowd, spontaneous calls and wheels follow zoom',async()=>{
  const {useCameraStore}=await import('./camera-store')
  await audio.unlockSceneAudio()
  for(const [profile,event] of [['animal/horse','selection'],['animal/ox','idle'],['scene/crowd','idle'],['vehicle/cart','walking']] as const){
   audio.stopSceneAudio();useCameraStore.setState({viewSize:12})
   await audio.emitCharacterAudio(profile,event,{actor:'close'})
   const near=(sources.at(-1)!.connect.mock.calls[0][0] as FakeNode).gain.value
   useCameraStore.setState({viewSize:120})
   await audio.emitCharacterAudio(profile,event,{actor:'wide'})
   expect((sources.at(-1)!.connect.mock.calls[0][0] as FakeNode).gain.value).toBeCloseTo(near*(event==='selection'?1:profile.startsWith('scene/')?.04:.01))
  }
 })
 it('limits crowd overlaps without interrupting footsteps or animal selection',async()=>{
  await audio.unlockSceneAudio()
  store.useCharacterSoundStore.getState().patchMixer({maxVoices:4})
  expect(await audio.emitCharacterAudio('scene/crowd','idle',{actor:'a'})).toBe(true)
  expect(await audio.emitCharacterAudio('scene/crowd','idle',{actor:'b'})).toBe(true)
  expect(await audio.emitCharacterAudio('scene/crowd','idle',{actor:'c'})).toBe(false)
  expect(await audio.emitCharacterAudio('peasant','walking',{actor:'walker'})).toBe(true)
  expect(await audio.playSourceSelection('animal/donkey')).toBe(true)
  expect(sources).toHaveLength(4)
 })
})

describe('environment and revised background mix',()=>{
 it('raises all background effects by exactly 30 percent while preserving selection volume',async()=>{
  await audio.unlockSceneAudio()
  const {useCameraStore}=await import('./camera-store');useCameraStore.setState({viewSize:12})
  store.useCharacterSoundStore.getState().patchMixer({background:1})
  await audio.emitCharacterAudio('peasant','walking',{actor:'baseline'})
  const before=(sources.at(-1)!.connect.mock.calls[0][0] as FakeNode).gain.value
  await audio.playSourceSelection('animal/horse')
  const selection=sources.at(-1)!.connect.mock.calls[0][0] as FakeNode
  store.useCharacterSoundStore.getState().patchMixer({background:1.3})
  await audio.emitCharacterAudio('peasant','walking',{actor:'raised'})
  expect((sources.at(-1)!.connect.mock.calls[0][0] as FakeNode).gain.value).toBeCloseTo(before*1.3)
  expect(selection.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(selection.gain.value)
 })
 it('plays the replacement ox once and suppresses a second spontaneous moo after selection',async()=>{
  expect(await audio.playSourceSelection('animal/ox')).toBe(true)
  expect(fetch).toHaveBeenCalledWith('/sounds/elevenlabs/v11/animal-ox-call-v10.wav')
  expect((sources.at(-1) as FakeNode&{loop:boolean}).loop).toBe(false)
  expect(await audio.emitCharacterAudio('animal/ox','idle',{actor:'walking-ox'})).toBe(false)
  expect(sources).toHaveLength(1)
 })
 it('loops water only when explicitly requested and fades the bed when leaving the source',async()=>{
  await audio.unlockSceneAudio()
  await audio.emitCharacterAudio('scene/stream','idle',{actor:'stream',loop:true})
  const stream=sources.at(-1)! as FakeNode&{loop:boolean}
  expect(stream.loop).toBe(true)
  expect(audio.hasActorAudio('stream')).toBe(true)
  audio.fadeActorAudio('stream')
  expect(stream.stop).toHaveBeenCalledWith(.4)
  expect(audio.hasActorAudio('stream')).toBe(false)
 })
 it('applies event-volume edits to a loop that is already playing',async()=>{
  await audio.unlockSceneAudio()
  await audio.emitCharacterAudio('scene/wind','idle',{actor:'wind',loop:true,preview:true,viewSize:12})
  const gain=sources.at(-1)!.connect.mock.calls[0][0] as FakeNode
  const before=gain.gain.value
  store.useCharacterSoundStore.getState().patchEvent('scene/wind','idle',{volume:.25})
  expect(gain.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(before/2)
 })

})

it('makes room for conversation and minstrel performances in a busy footstep mix',async()=>{
 await audio.unlockSceneAudio()
 store.useCharacterSoundStore.getState().patchMixer({maxVoices:2})
 await audio.emitCharacterAudio('peasant','walking',{actor:'a'})
 await audio.emitCharacterAudio('peasant','walking',{actor:'b'})
 expect(await audio.emitCharacterAudio('scene/crowd','idle')).toBe(true)
 expect(await audio.emitCharacterAudio('minstrel','work')).toBe(true)
 expect(sources.slice(0,2).every(s=>s.stop.mock.calls.length===1)).toBe(true)
 expect(audio.useAudioQA.getState().active).toBe(2)
 expect(await audio.emitCharacterAudio('peasant','walking',{actor:'c'})).toBe(false)
})
it('keeps murmurs behind lyre performances and strongly reduces wide views',async()=>{
 const {useCameraStore}=await import('./camera-store')
 const {SOUND_AUDITIONS}=await import('./sound-catalog')
 await audio.unlockSceneAudio()
 for(const [profile,event] of [['scene/crowd','idle'],['minstrel','work']] as const){
  audio.stopSceneAudio();useCameraStore.setState({viewSize:24})
  await audio.emitCharacterAudio(profile,event,{distance:3,intensity:.7375})
  const qa=audio.useAudioQA.getState().history[0]
  const sound=SOUND_AUDITIONS.find(s=>s.id===qa.clip)!
  const levelDb=sound.rmsDb!+20*Math.log10(qa.gain)
  expect(levelDb).toBeGreaterThan(profile==='scene/crowd'?-58:-48)
  if(profile==='scene/crowd')expect(levelDb).toBeLessThan(-48)
  const level=sources.at(-1)!.connect.mock.calls[0][0] as FakeNode
  useCameraStore.setState({viewSize:120})
  expect(level.gain.setTargetAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(qa.gain*.04)
 }
})

it('stops an NPC conversation with its owner without stopping another NPC',async()=>{
 await audio.unlockSceneAudio()
 await audio.emitCharacterAudio('scene/crowd','idle',{actor:'traveler/1/conversation'})
 await audio.emitCharacterAudio('scene/crowd','idle',{actor:'traveler/10/conversation'})
 audio.stopActorAudio('traveler/1')
 expect(sources[0].stop).toHaveBeenCalledOnce()
 expect(sources[1].stop).not.toHaveBeenCalled()
 expect(audio.useAudioQA.getState().history[0].actor).toBe('traveler/10/conversation')
})

it('avoids layering the identical murmur take when another recording is available',async()=>{
 await audio.unlockSceneAudio()
 const random=vi.spyOn(Math,'random').mockReturnValue(0)
 try {
  await audio.emitCharacterAudio('scene/crowd','idle',{actor:'traveler/1/conversation'})
  await audio.emitCharacterAudio('scene/crowd','idle',{actor:'traveler/2/conversation'})
  const played=audio.useAudioQA.getState().history.filter(r=>r.result==='played')
  expect(played[0].clip).not.toBe(played[1].clip)
 }finally{random.mockRestore()}
})
