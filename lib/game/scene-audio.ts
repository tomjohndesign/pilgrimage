"use client"

import { useCameraStore } from "./camera-store"
import { create } from "zustand"
import { SOUND_AUDITIONS } from "./sound-catalog"
import { distanceGain, zoomSoundGain, useCharacterSoundStore, type CharacterAudioEvent } from "./character-sound-store"
import { useCharacterAssetStore } from "./character-asset-store"

export interface AudioQA { id:number; profile:string; event:string; clip:string; result:string; gain:number; pan:number }
export const useAudioQA = create<{history:AudioQA[]; active:number; peak:number}>(()=>({history:[],active:0,peak:0}))
let serial=0, generation=0, context:AudioContext|undefined, output:GainNode|undefined, analyser:AnalyserNode|undefined
let dialogue=false
const clips=new Map<string,Promise<AudioBuffer>>()
const voices=new Map<number,{source?:AudioBufferSourceNode; gain?:GainNode; profile:string; actor:string; event:CharacterAudioEvent; base:number; pan:number; preview:boolean; viewSize?:number}>()
const last=new Map<string,{at:number;index:number}>()
export function audioQA(profile:string,event:string,clip:string,result:string,gain=0,pan=0) {
  const record={id:++serial,profile,event,clip,result,gain,pan}
  useAudioQA.setState(s=>({history:[record,...s.history].slice(0,24),active:voices.size}))
}
export async function unlockSceneAudio() {
  if (typeof AudioContext === "undefined") return false
  if (!context) {
    context=new AudioContext();output=context.createGain();analyser=context.createAnalyser();analyser.fftSize=256
    const limiter=context.createDynamicsCompressor();limiter.threshold.value=-6;limiter.knee.value=6;limiter.ratio.value=12
    output.connect(limiter);limiter.connect(analyser);analyser.connect(context.destination)
  }
  if(context.state==='suspended') await context.resume()
  return context.state==='running'
}
function voiceGain(v:{base:number;event:CharacterAudioEvent;preview:boolean;viewSize?:number}) {
  const m=useCharacterSoundStore.getState().document.mixer
  return v.base*m.master*(v.event==='idle'?m.ambience:m.foley)*(dialogue?m.ducking:1)*((v.event==='walking'||v.event==='idle')?zoomSoundGain(v.preview?(v.viewSize??12):useCameraStore.getState().viewSize,m.zoomRolloff):1)
}
function refreshMix() {
  if (!context) return
  for (const v of voices.values()) v.gain?.gain.setTargetAtTime(voiceGain(v),context.currentTime,.04)
}
export function setPreviewSoundViewSize(viewSize:number) {
  for(const voice of voices.values())if(voice.preview)voice.viewSize=viewSize
  refreshMix()
}
useCameraStore.subscribe((s,p)=>{if(s.viewSize!==p.viewSize)refreshMix()})
export function setDialogueActive(value:boolean) { dialogue=value;refreshMix() }
export function stopSceneAudio() {
  ++generation
  for(const v of voices.values()) {try{v.source?.stop()}catch{/* Already ended. */}}
  voices.clear();last.clear();useAudioQA.setState({active:0,peak:0})
}
export function stopActorAudio(actor:string) {
  for(const [id,v] of voices) if(v.actor===actor){try{v.source?.stop()}catch{}voices.delete(id)}
}
export function sampleAudioPeak() {
  if(!analyser)return 0
  const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples)
  const peak=samples.reduce((n,s)=>Math.max(n,Math.abs(s)),0);useAudioQA.setState({peak,active:voices.size});return peak
}

/** Short independently mixed events. Background scene audio never interrupts a greeting. */
export async function emitCharacterAudio(profile:string,event:Exclude<CharacterAudioEvent,'selection'>,options:{actor?:string;distance?:number;pan?:number;visible?:boolean;preview?:boolean;viewSize?:number;bank?:string[]}={}) {
  const {document:d}=useCharacterSoundStore.getState(), slot=d.profiles[profile]?.[event]
  const actor=options.actor??`preview/${profile}`,pan=Math.max(-1,Math.min(1,options.pan??0)),distance=options.distance??0
  const reject=(reason:string)=>{audioQA(profile,event,'',reason,0,pan);return false}
  if(!slot||!slot.enabled||useCharacterAssetStore.getState().muted)return false
  if(!options.preview&&(!d.mixer.sceneEnabled||options.visible===false))return false
  if(d.mixer.solo!=='none'&&d.mixer.solo!==event)return false
  if (typeof document !== "undefined" && document.hidden) return false
  const gain=slot.volume*distanceGain(distance,slot.range)
  if(gain<.005)return reject('out of range')
  const now=Date.now()/1000,key=`${actor}/${event}`, previous=last.get(key)
  if(previous&&now-previous.at<slot.cooldown)return false
  const bank=options.bank??slot.clips
  if(!bank.length)return reject('no clips assigned')
  if(voices.size>=d.mixer.maxVoices)return reject('voice limit')
  const index=previous? (previous.index+1)%bank.length: Math.floor(Math.random()*bank.length)
  const sound=SOUND_AUDITIONS.find(s=>s.id===bank[index]);if(!sound)return reject('missing clip')
  if(!context||context.state!=='running')return reject('audio locked — click to enable')
  last.set(key,{at:now,index});if(last.size>2048)last.delete(last.keys().next().value!)
  const token=generation,id=++serial
  const voice={profile,actor,event,base:gain,pan,preview:options.preview===true,viewSize:options.viewSize} as NonNullable<ReturnType<typeof voices.get>>
  voices.set(id,voice)
  try {
    let loading=clips.get(sound.url)
    if(!loading){loading=fetch(sound.url).then(r=>{if(!r.ok)throw Error('missing');return r.arrayBuffer()}).then(b=>context!.decodeAudioData(b));clips.set(sound.url,loading)}
    const buffer=await loading
    if(token!==generation||!voices.has(id)||(!options.preview&&!useCharacterSoundStore.getState().document.mixer.sceneEnabled)){voices.delete(id);return false}
    const source=context.createBufferSource(),level=context.createGain(),panner=context.createStereoPanner()
    source.buffer=buffer;source.playbackRate.value=slot.rate*(1+(Math.random()*2-1)*slot.jitter)
    level.gain.value=voiceGain(voice);panner.pan.value=pan
    source.connect(level);level.connect(panner);panner.connect(output!)
    voice.source=source;voice.gain=level
    source.onended=()=>{voices.delete(id);source.disconnect();level.disconnect();panner.disconnect();useAudioQA.setState({active:voices.size})}
    source.start();audioQA(profile,event,sound.id,'played',level.gain.value,pan);return true
  }catch{clips.delete(sound.url);voices.delete(id);return reject('load/decode failed')}
}
useCharacterSoundStore.subscribe((s,p)=>{
  if(s.document.mixer.sceneEnabled!==p.document.mixer.sceneEnabled&&!s.document.mixer.sceneEnabled)stopSceneAudio()
  if(s.document.mixer.solo!==p.document.mixer.solo)stopSceneAudio()
  for (const [id,v] of voices) {
    const slot=s.document.profiles[v.profile]?.[v.event]
    if(!slot?.enabled){try{v.source?.stop()}catch{}voices.delete(id)}
  }
  refreshMix()
})
useCharacterAssetStore.subscribe((s,p)=>{if(s.muted&&!p.muted)stopSceneAudio()})
