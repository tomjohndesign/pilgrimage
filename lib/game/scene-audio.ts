"use client"

import { useCameraStore } from "./camera-store"
import { create } from "zustand"
import { SOUND_AUDITIONS } from "./sound-catalog"
import { distanceGain, zoomSoundGain, useCharacterSoundStore, type CharacterAudioEvent } from "./character-sound-store"
import { useCharacterAssetStore } from "./character-asset-store"

export interface AudioQA { id:number; actor?:string; profile:string; event:string; clip:string; result:string; gain:number; pan:number }
export const useAudioQA = create<{history:AudioQA[]; active:number; peak:number}>(()=>({history:[],active:0,peak:0}))
let serial=0, generation=0, context:AudioContext|undefined, output:GainNode|undefined, analyser:AnalyserNode|undefined
let dialogue=false, selectionRequest=0
const clips=new Map<string,Promise<AudioBuffer>>()
const voices=new Map<number,{source?:AudioBufferSourceNode; gain?:GainNode; panner?:StereoPannerNode; clip:string; profile:string; actor:string; event:CharacterAudioEvent; base:number; distance:number; intensity:number; ending?:boolean; pan:number; preview:boolean; viewSize?:number}>()
const selectedAt=new Map<string,number>()
const last=new Map<string,{at:number;index:number}>()
export function audioQA(profile:string,event:string,clip:string,result:string,gain=0,pan=0,actor?:string) {
  const record={id:++serial,actor,profile,event,clip,result,gain,pan}
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
function voiceGain(v:{base:number;event:CharacterAudioEvent;preview:boolean;viewSize?:number;profile?:string}) {
  const m=useCharacterSoundStore.getState().document.mixer
  return v.base*m.master*(v.event==='selection'?1:m.background)*(v.event==='selection'?m.selection:v.event==='idle'?m.ambience:m.foley)*(dialogue?m.ducking:1)*((v.event==='walking'||v.event==='idle'||v.profile==='minstrel')?zoomSoundGain(v.preview?(v.viewSize??12):useCameraStore.getState().viewSize,m.zoomRolloff,v.profile?.startsWith('scene/')||v.profile==='minstrel'?24:12):1)
}
function refreshMix() {
  if (!context) return
  for (const v of voices.values()) if(!v.ending){
    const slot=useCharacterSoundStore.getState().document.profiles[v.profile][v.event]
    v.base=slot.volume*(v.event==='selection'?1:distanceGain(v.distance,slot.range))*v.intensity
    v.gain?.gain.setTargetAtTime(voiceGain(v),context.currentTime,.04)
  }
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
  for(const [id,v] of voices) if(v.actor===actor||v.actor.startsWith(`${actor}/`)){try{v.source?.stop()}catch{}voices.delete(id)}
}
export function sampleAudioPeak() {
  if(!analyser)return 0
  const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples)
  const peak=samples.reduce((n,s)=>Math.max(n,Math.abs(s)),0);useAudioQA.setState({peak,active:voices.size});return peak
}

/** Short independently mixed events. Background scene audio never interrupts a greeting. */
export async function emitCharacterAudio(profile:string,event:CharacterAudioEvent,options:{actor?:string;distance?:number;pan?:number;visible?:boolean;preview?:boolean;viewSize?:number;bank?:string[];intensity?:number;loop?:boolean}={}) {
  const {document:d}=useCharacterSoundStore.getState(), slot=d.profiles[profile]?.[event]
  const actor=options.actor??`preview/${profile}`,pan=Math.max(-1,Math.min(1,options.pan??0)),distance=options.distance??0
  const reject=(reason:string)=>{audioQA(profile,event,'',reason,0,pan,actor);return false}
  if(!slot||!slot.enabled||useCharacterAssetStore.getState().muted)return false
  if(event!=='selection'&&!options.preview&&(!d.mixer.sceneEnabled||options.visible===false))return false
  if(d.mixer.solo!=='none'&&d.mixer.solo!==event)return false
  if (typeof document !== "undefined" && document.hidden) return false
  const gain=slot.volume*(event==='selection'?1:distanceGain(distance,slot.range))*Math.max(0,Math.min(1,options.intensity??1))
  if(gain<.005)return reject('out of range')
  const now=Date.now()/1000,key=`${actor}/${event}`, previous=last.get(key)
  if(event==='idle'&&profile.startsWith('animal/')&&now-(selectedAt.get(profile)??-Infinity)<Math.max(8,slot.cooldown))return false
  if(previous&&now-previous.at<slot.cooldown)return false
  const bank=options.bank??slot.clips
  if(!bank.length)return reject('no clips assigned')
  if(event!=='selection' && [...voices.values()].filter(v=>v.event===event && v.profile===profile).length >= (profile.startsWith('scene/')?(profile==='scene/crowd'?Math.max(1,Math.floor(d.mixer.maxVoices/2)):profile==='scene/birds'?2:1):profile.startsWith('animal/')?2:d.mixer.maxVoices))return reject('layer voice limit')
  // Keep the scene's defining sounds audible when a crowd fills the budget with steps.
  const featured = profile.startsWith('scene/crowd') || (profile === 'minstrel' && event === 'work')
  if((event==='selection' || featured) && voices.size>=d.mixer.maxVoices) {
    const victim=event==='selection' ? [...voices].find(([,voice])=>voice.event!=='selection')
      : [...voices].filter(([,voice])=>voice.event==='walking' && !voice.profile.startsWith('vehicle/')).sort((a,b)=>voiceGain(a[1])-voiceGain(b[1]))[0]
    if(victim){try{victim[1].source?.stop()}catch{}voices.delete(victim[0])}
  }
  if(voices.size>=d.mixer.maxVoices)return reject('voice limit')
  let index=previous? (previous.index+1)%bank.length: Math.floor(Math.random()*bank.length)
  if(profile==='scene/crowd') {
    const playing=new Set([...voices.values()].filter(v=>v.profile===profile).map(v=>v.clip))
    const available=bank.map((_,offset)=>(index+offset)%bank.length).find(i=>!playing.has(bank[i]))
    if(available!==undefined)index=available
  }
  const sound=SOUND_AUDITIONS.find(s=>s.id===bank[index]);if(!sound)return reject('missing clip')
  if(!context||context.state!=='running')return reject('audio locked — click to enable')
  last.set(key,{at:now,index});if(last.size>2048)last.delete(last.keys().next().value!)
  const token=generation,id=++serial
  const voice={clip:sound.id,profile,actor,event,base:gain,distance,intensity:options.intensity??1,pan,preview:options.preview===true,viewSize:options.viewSize} as NonNullable<ReturnType<typeof voices.get>>
  voices.set(id,voice)
  try {
    let loading=clips.get(sound.url)
    if(!loading){loading=fetch(sound.url).then(r=>{if(!r.ok)throw Error('missing');return r.arrayBuffer()}).then(b=>context!.decodeAudioData(b));clips.set(sound.url,loading)}
    const buffer=await loading
    if(token!==generation||!voices.has(id)||(event!=='selection'&&!options.preview&&!useCharacterSoundStore.getState().document.mixer.sceneEnabled)){voices.delete(id);return false}
    const source=context.createBufferSource(),level=context.createGain(),panner=context.createStereoPanner()
    source.buffer=buffer;source.loop=options.loop===true;source.playbackRate.value=slot.rate*(1+(Math.random()*2-1)*slot.jitter)
    level.gain.value=voiceGain(voice);panner.pan.value=pan
    source.connect(level);level.connect(panner);panner.connect(output!)
    voice.source=source;voice.gain=level;voice.panner=panner
    source.onended=()=>{voices.delete(id);source.disconnect();level.disconnect();panner.disconnect();useAudioQA.setState({active:voices.size})}
    source.start();audioQA(profile,event,sound.id,'played',level.gain.value,pan,actor);return true
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

/** Selection feedback is immediate and independent of camera zoom/distance. */
export async function playSourceSelection(profile: string) {
  stopActorAudio("source-selection")
  selectedAt.set(profile,Date.now()/1000)
  const token = generation, request=++selectionRequest
  if (!await unlockSceneAudio() || token !== generation || request!==selectionRequest) return false
  return emitCharacterAudio(profile, "selection", {actor: "source-selection", preview: true})
}

export function moveActorAudio(actor:string,distance:number,pan:number,intensity?:number) {
  if(!context)return
  for(const voice of voices.values())if(voice.actor===actor && !voice.ending && voice.event!=="selection") {
    const slot=useCharacterSoundStore.getState().document.profiles[voice.profile][voice.event]
    voice.distance=distance
    if(intensity!==undefined)voice.intensity=intensity
    voice.base=slot.volume*distanceGain(distance,slot.range)*voice.intensity
    voice.pan=Math.max(-1,Math.min(1,pan))
    voice.panner?.pan.setTargetAtTime(voice.pan,context.currentTime,.04)
    voice.gain?.gain.setTargetAtTime(voiceGain(voice),context.currentTime,.04)
  }
}

export function hasActorAudio(actor:string) { return [...voices.values()].some(voice=>voice.actor===actor) }

export function fadeActorAudio(actor:string) {
  if(!context)return
  for(const [id,voice] of voices)if(voice.actor===actor&&!voice.ending){
    if(!voice.source){voices.delete(id);continue}
    voice.ending=true
    voice.gain?.gain.setTargetAtTime(0,context.currentTime,.08)
    try{voice.source.stop(context.currentTime+.4)}catch{}
  }
}
