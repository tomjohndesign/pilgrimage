"use client"

import { useEffect, useRef, useState } from "react"
import { Section, Tuner } from "./game/property-controls"
import { AUDIO_EVENTS, AUDIO_PROFILES, previewSoundViewSize, zoomSoundGain, useCharacterSoundStore, type CharacterAudioEvent } from "@/lib/game/character-sound-store"
import { characterBark, SOUND_AUDITIONS, SFX_AUDITIONS, VOICE_AUDITIONS } from "@/lib/game/sound-catalog"
import { playCharacterSound, stopAllSounds, stopCharacterSound, useSoundPlaybackStore } from "@/lib/game/character-audio"
import { emitCharacterAudio, sampleAudioPeak, setPreviewSoundViewSize, stopActorAudio, unlockSceneAudio, useAudioQA } from "@/lib/game/scene-audio"
import { soundEventForClip, soundMarkersCrossed, soundImpactPhase } from "@/lib/game/character-sound-motion"
import { useVoiceSubtitleStore } from "@/lib/game/voice-subtitle-store"
import { useCharacterAssetStore } from "@/lib/game/character-asset-store"
import type { TravelerTypeId } from "@/lib/game/travelers"
import type { BaseClip } from "@/lib/game/base-person/pose"
import type { BodyType } from "@/lib/game/voice-lines"

/** Sound sections live inside the existing character controls and share its JSON dialog. */
export function CharacterAudioEditor({profile,bodyType,voiceVariant,previewZoom,clip,frame,frames,playing,active,selected,onSelect,onDeselect,onPreviewClip}:{
  profile:string;bodyType:BodyType;voiceVariant:number;previewZoom:number;clip:string;frame:number;frames:number;playing:boolean;active:boolean
  selected:boolean;onSelect:()=>void;onDeselect:()=>void;onPreviewClip:(clip:BaseClip)=>void
}) {
  const {document:d,patchEvent,patchMixer}=useCharacterSoundStore()
  const [event,setEvent]=useState<CharacterAudioEvent>('selection'),[sync,setSync]=useState(false)
  const [open,setOpen]=useState<Record<string,boolean>>({'Event preview':true,'Clip bank':true})
  const [distance,setDistance]=useState(0),[pan,setPan]=useState(0)
  const muted=useCharacterAssetStore(s=>s.muted),setMuted=useCharacterAssetStore(s=>s.setMuted)
  const qa=useAudioQA(),slot=d.profiles[profile][event]
  const type=(profile.startsWith('job/')?'peasant':profile) as TravelerTypeId
  const greeting=characterBark(type,bodyType,0,1,undefined,profile,d.profiles[profile].selection.clips,voiceVariant)
  const playback=useSoundPlaybackStore()
  const spokenLine=useVoiceSubtitleStore(s=>s.line)
  const displayedLine=spokenLine??greeting.line
  const previous=useRef<{frame:number;clip:string;profile:string}|undefined>(undefined)
  const section=(title:string)=>({title,open:open[title]??false,onToggle:()=>setOpen(s=>({...s,[title]:!s[title]}))})
  const actor='character-editor'
  const viewSize=previewSoundViewSize(previewZoom)
  useEffect(()=>{setPreviewSoundViewSize(viewSize)},[viewSize])
  useEffect(()=>{if(!active||!sync||!playing)stopActorAudio(actor);if(!active){stopCharacterSound();setSync(false)}},[active,sync,playing])
  useEffect(()=>{stopActorAudio(actor);stopCharacterSound();previous.current=undefined;return()=>{stopActorAudio(actor);stopCharacterSound()}},[profile,bodyType,voiceVariant,clip])
  useEffect(()=>{
    const prev=previous.current
    previous.current={frame,clip,profile}
    if(!active||!sync||!playing||!prev||prev.clip!==clip||prev.profile!==profile)return
    const e=soundEventForClip(clip);if(!e||e==='idle')return
    const old=(prev.frame%frames)/frames,now=(frame%frames)/frames
    // Scrubbing and resets do not fire; preview advances one frame at a time.
    if((frame-prev.frame+frames)%frames!==1)return
    if(soundMarkersCrossed(old,now<old?now+1:now,e,soundImpactPhase(clip,d.profiles[profile][e])))void emitCharacterAudio(profile,e,{actor,preview:true,distance,pan,viewSize})
  },[frame,frames,clip,profile,playing,active,sync,distance,pan,viewSize,d.profiles])
  useEffect(()=>{
    if(!active||!sync||!playing||clip!=='idle')return
    const timer=setInterval(()=>{void emitCharacterAudio(profile,'idle',{actor,preview:true,distance,pan,viewSize})},Math.max(3,d.profiles[profile].idle.cooldown)*1000)
    return()=>clearInterval(timer)
  },[active,sync,playing,clip,profile,distance,pan,viewSize,d.profiles])
  useEffect(()=>{if(!active||!open['Sound QA'])return;const timer=setInterval(sampleAudioPeak,200);return()=>clearInterval(timer)},[active,open])
  const audition=async()=>{if(event==='selection'){onSelect();void unlockSceneAudio();await playCharacterSound(type,0,bodyType,profile,{voiceVariant})}else{await unlockSceneAudio();await emitCharacterAudio(profile,event,{actor,preview:true,distance,pan,viewSize})}}
  const available=event==='selection'?VOICE_AUDITIONS.filter(s=>s.character===type&&s.bodyType===bodyType):SFX_AUDITIONS.filter(s=>!s.loop)
  const selectedClips=event==='selection'?SOUND_AUDITIONS.filter(s=>s.url===(playback.url??greeting.url)):SOUND_AUDITIONS.filter(s=>slot.clips.includes(s.id))
  const updateEvent=(next:CharacterAudioEvent)=>{
    setEvent(next)
    if(next==='walking')onPreviewClip('walk')
    if(next==='work')onPreviewClip(profile==='job/tavern'?'seatedDrink':['peasant','friar','job/woodcutter'].includes(profile)?'treeFelling':'building')
    if(next==='idle')onPreviewClip('idle')
  }
  const numberControl=(key:'volume'|'rate'|'jitter'|'cooldown'|'range'|'phase',label:string,min:number,max:number,step:number,display?:string)=><Tuner key={key} label={label} labelClassName="w-28" value={slot[key]} display={display??slot[key].toFixed(2)} min={min} max={max} step={step} onChange={value=>patchEvent(profile,event,{[key]:value})}/>
  const assigned=event==='selection'?VOICE_AUDITIONS.filter(s=>slot.clips.includes(s.id)):selectedClips
  return <>
    <Section {...section('Event preview')}>
      <p className="person-hint">{AUDIO_PROFILES[profile]} · {bodyType}</p>
      <div className="person-presets" role="group" aria-label="Sound event">
        {AUDIO_EVENTS.map(e=><button key={e} className="hud-action" aria-pressed={event===e} onClick={()=>updateEvent(e)}>{e==='selection'?'Greeting':e==='walking'?'Footsteps':e==='work'?'Work':'Idle'}</button>)}
      </div>
      <div className="person-presets">
        <button className="hud-action" onClick={audition}>Play {event}</button>
        <button className="hud-action" onClick={()=>{setSync(false);stopAllSounds()}}>Stop sounds</button>
      </div>
      {selected&&<button className="hud-action" onClick={onDeselect}>Deselect character</button>}
      <label className="person-check"><input type="checkbox" checked={slot.enabled} onChange={e=>patchEvent(profile,event,{enabled:e.target.checked})}/>Enable {event}</label>
      {event!=='selection'&&<label className="person-check"><input type="checkbox" checked={sync} onChange={e=>{setSync(e.target.checked);void unlockSceneAudio()}}/>Hear animation events</label>}
      {event!=='selection'&&<p className="person-hint">Use Play in the animation toolbar to hear this character moving. One-shot playback works while paused.</p>}
      {numberControl('volume','Event volume',0,1,.01,`${Math.round(slot.volume*100)}%`)}
      {numberControl('rate','Playback speed',.5,1.5,.01,`${slot.rate.toFixed(2)}×`)}
      {event==='selection'&&<p className="person-hint">“{displayedLine.text}”<br/>{displayedLine.gloss}<br/>{greeting.tongue}</p>}
    </Section>
    <Section {...section('Clip bank')}>
      {event==='selection'&&<label className="person-check"><input type="checkbox" checked={!slot.clips.length} onChange={e=>patchEvent(profile,event,{clips:e.target.checked?[]:[greeting.id]})}/>Use this character’s greeting</label>}
      {event==='selection'&&!slot.clips.length&&<p className="person-hint">{selectedClips[0]?.label??greeting.id}</p>}
      {assigned.map(s=><div key={s.id} className="person-choice"><span>{s.label??s.id}</span><button className="hud-action" aria-label={`Remove ${s.label??s.id}`} onClick={()=>patchEvent(profile,event,{clips:slot.clips.filter(id=>id!==s.id)})}>Remove</button></div>)}
      <label className="person-choice">Add clip<select aria-label="Add sound clip" value="" onChange={e=>{if(e.target.value)patchEvent(profile,event,{clips:[...slot.clips,e.target.value]})}}><option value="">Choose a recording…</option>{available.filter(s=>!slot.clips.includes(s.id)).map(s=><option key={s.id} value={s.id}>{s.label??s.id}</option>)}</select></label>
      <p className="person-hint">Variations alternate between contacts. Greeting choices match the selected body voice.</p>
    </Section>
    <Section {...section('Timing and variation')}>
      {event==='selection'?<p className="person-hint">Greetings play on selection. Each person starts on a consistent line; repeated selections cycle the bank.</p>:<>
        {numberControl('jitter','Pitch variation',0,.2,.01,`±${Math.round(slot.jitter*100)}%`)}
        {numberControl('cooldown','Minimum interval',0,60,.1,`${slot.cooldown.toFixed(1)} s`)}
        {event==='work'&&<label className="person-check"><input type="checkbox" checked={slot.rigTiming} onChange={e=>patchEvent(profile,event,{rigTiming:e.target.checked})}/>Follow the rig’s impact frame</label>}
        {(event==='walking'||(event==='work'&&!slot.rigTiming))&&numberControl('phase','Contact phase',0,.99,.01,`${Math.round(slot.phase*100)}%`)}
        {event==='work'&&slot.rigTiming&&<p className="person-hint">Current impact: {Math.round(soundImpactPhase(clip,slot)*100)}% of the animation.</p>}
      </>}
    </Section>
    <Section {...section('Mix and zoom')}>
      <button className="hud-action" onClick={()=>setMuted(!muted)}>{muted?'Unmute sounds':'Mute sounds'}</button>
      {(['master','selection','foley','ambience','ducking'] as const).map(key=><Tuner key={key} label={({master:'Master',selection:'Greetings',foley:'Effects',ambience:'Idle ambience',ducking:'Under dialogue'})[key]} labelClassName="w-28" display={`${Math.round(d.mixer[key]*100)}%`} value={d.mixer[key]} min={0} max={1} step={.01} onChange={value=>patchMixer({[key]:value})}/>)}
      <Tuner label="Zoom falloff" labelClassName="w-28" value={d.mixer.zoomRolloff} display={`${d.mixer.zoomRolloff.toFixed(1)}×`} min={.5} max={4} step={.1} onChange={zoomRolloff=>patchMixer({zoomRolloff})}/>
      <p className="person-hint">Footsteps and idle ambience follow the stage zoom; greetings and work cues keep their level. Current ambience retains {Math.round(zoomSoundGain(viewSize,d.mixer.zoomRolloff)*100)}% of the close-up level. Higher falloff makes distant scenes quieter.</p>
      {event!=='selection'&&numberControl('range','Audible range',1,80,1,`${slot.range} tiles`)}
      <Tuner label="Maximum voices" labelClassName="w-28" value={d.mixer.maxVoices} display={String(d.mixer.maxVoices)} min={1} max={32} onChange={maxVoices=>patchMixer({maxVoices})}/>
      <label className="person-choice">Solo event<select aria-label="Solo event" value={d.mixer.solo} onChange={e=>patchMixer({solo:e.target.value as typeof d.mixer.solo})}>{['none',...AUDIO_EVENTS].map(e=><option key={e}>{e}</option>)}</select></label>
      <label className="person-check"><input type="checkbox" checked={d.mixer.sceneEnabled} onChange={e=>patchMixer({sceneEnabled:e.target.checked})}/>Scene action sounds</label>
    </Section>
    <Section {...section('Sound QA')}>
      <Tuner label="Preview distance" labelClassName="w-28" display={`${distance} tiles`} value={distance} min={0} max={80} onChange={setDistance}/>
      <Tuner label="Preview pan" labelClassName="w-28" display={pan.toFixed(2)} value={pan} min={-1} max={1} step={.05} onChange={setPan}/>
      <p className="person-hint">{qa.active} / {d.mixer.maxVoices} effect voices · output peak {qa.peak?`${(20*Math.log10(qa.peak)).toFixed(1)} dBFS`:'silent'}</p>
      {selectedClips.map(s=><p className="person-hint" key={s.id}>{s.id}<br/>{s.duration}s · peak {s.peakDb??'unmeasured'} dBFS · RMS {s.rmsDb??'unmeasured'} dBFS<br/><a href={s.url} download>Download WAV</a></p>)}
      <button className="hud-action" onClick={()=>useAudioQA.setState({history:[]})}>Clear event log</button>
      <div aria-label="Sound event log">{qa.history.slice(0,4).map(r=><p className="person-hint" key={r.id}>{r.profile} · {r.event} · {r.result}<br/>{r.clip||'No clip'} · gain {r.gain.toFixed(3)} · pan {r.pan.toFixed(2)}</p>)}</div>
    </Section>
  </>
}
