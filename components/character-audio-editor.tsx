"use client"

import { ChromeSelect, ChromeButton, ChromeCheckbox } from "@/components/ui/chrome-controls"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { AssetEditorPanels, AssetEditorSection } from "./asset-editor-frame"
import { Tuner } from "./game/property-controls"
import { AUDIO_EVENTS, AUDIO_PROFILES, SCENE_AUDIO_PROFILES, previewSoundViewSize, zoomSoundGain, useCharacterSoundStore, type CharacterAudioEvent } from "@/lib/game/character-sound-store"
import { characterBark, SOUND_AUDITIONS, SFX_AUDITIONS, VOICE_AUDITIONS } from "@/lib/game/sound-catalog"
import { playCharacterSound, stopAllSounds, stopCharacterSound, useSoundPlaybackStore } from "@/lib/game/character-audio"
import { emitCharacterAudio, playSourceSelection, sampleAudioPeak, setPreviewSoundViewSize, stopActorAudio, unlockSceneAudio, useAudioQA } from "@/lib/game/scene-audio"
import { irregularSoundDelay } from "@/lib/game/scene-sound-sources"
import { soundEventForClip, soundMarkersCrossed, soundImpactPhase } from "@/lib/game/character-sound-motion"
import { useVoiceSubtitleStore } from "@/lib/game/voice-subtitle-store"
import { useCharacterAssetStore } from "@/lib/game/character-asset-store"
import type { TravelerTypeId } from "@/lib/game/travelers"
import type { BaseClip } from "@/lib/game/base-person/pose"
import type { BodyType } from "@/lib/game/voice-lines"

function AudioPeakSampler({ active }: { active: boolean }) {
  useEffect(() => { if (!active) return; const timer = setInterval(sampleAudioPeak, 200); return () => clearInterval(timer) }, [active])
  return null
}

/** Sound sections live inside the existing character controls and share its JSON dialog. */
export function CharacterAudioEditor({profile:subjectProfile,bodyType,voiceVariant,previewZoom,clip,frame,frames,playing,active,selected,onSelect,onDeselect,onPreviewClip,files,flat = false}:{
  flat?:boolean;files?:ReactNode;profile:string;bodyType:BodyType;voiceVariant:number;previewZoom:number;clip:string;frame:number;frames:number;playing:boolean;active:boolean
  selected:boolean;onSelect:()=>void;onDeselect:()=>void;onPreviewClip:(clip:BaseClip)=>void
}) {
  const {document:d,patchEvent,patchMixer}=useCharacterSoundStore()
  const [layer,setLayer]=useState('subject')
  const profile=layer==='subject'?subjectProfile:layer
  const source=profile in SCENE_AUDIO_PROFILES,animal=profile.startsWith('animal/'),cart=profile==='vehicle/cart'
  const [event,setEvent]=useState<CharacterAudioEvent>(subjectProfile==='vehicle/cart'?'walking':'selection'),[sync,setSync]=useState(false)
  const [distance,setDistance]=useState(0),[pan,setPan]=useState(0)
  const muted=useCharacterAssetStore(s=>s.muted),setMuted=useCharacterAssetStore(s=>s.setMuted)
  const qa=useAudioQA(),slot=d.profiles[profile][event]
  const type=(profile.startsWith('job/')?'peasant':profile) as TravelerTypeId
  const greeting=source?null:characterBark(type,bodyType,0,1,undefined,profile,d.profiles[profile].selection.clips,voiceVariant)
  const playback=useSoundPlaybackStore()
  const spokenLine=useVoiceSubtitleStore(s=>s.line)
  const displayedLine=spokenLine??greeting?.line
  const previous=useRef<{frame:number;clip:string;profile:string}|undefined>(undefined)
  useEffect(()=>{setEvent(layer!=='subject'?'idle':subjectProfile==='vehicle/cart'?'walking':'selection');setSync(false)},[layer,subjectProfile])
  const actor='character-editor'
  const viewSize=previewSoundViewSize(previewZoom)
  useEffect(()=>{setPreviewSoundViewSize(viewSize)},[viewSize])
  useEffect(()=>{if(!active||!sync||!playing)stopActorAudio(actor);if(!active){stopCharacterSound();setSync(false)}},[active,sync,playing])
  useEffect(()=>{stopActorAudio(actor);stopActorAudio("source-selection");stopCharacterSound();previous.current=undefined;return()=>{stopActorAudio(actor);stopActorAudio("source-selection");stopCharacterSound()}},[profile,bodyType,voiceVariant,clip])
  useEffect(()=>{
    const prev=previous.current
    previous.current={frame,clip,profile}
    if(source||!active||!sync||!playing||!prev||prev.clip!==clip||prev.profile!==profile)return
    const e=soundEventForClip(clip);if(!e||e==='idle')return
    const old=(prev.frame%frames)/frames,now=(frame%frames)/frames
    // Scrubbing and resets do not fire; preview advances one frame at a time.
    if((frame-prev.frame+frames)%frames!==1)return
    if(soundMarkersCrossed(old,now<old?now+1:now,e,soundImpactPhase(clip,d.profiles[profile][e])))void emitCharacterAudio(profile,e,{actor,preview:true,distance,pan,viewSize})
  },[source,frame,frames,clip,profile,playing,active,sync,distance,pan,viewSize,d.profiles])
  useEffect(()=>{
    if(!active||!sync||!playing)return
    const e=source?(cart?'walking':'idle'):'idle'
    if(!source&&clip!=='idle')return
    if(['scene/stream','scene/shore','scene/waterfall','scene/wind'].includes(profile)){void emitCharacterAudio(profile,'idle',{actor,preview:true,distance,pan,viewSize,loop:true});return()=>stopActorAudio(actor)}
    let timer:ReturnType<typeof setTimeout>,cancelled=false
    const schedule=()=>{timer=setTimeout(()=>{
      if(cancelled)return
      void emitCharacterAudio(profile,e,{actor,preview:true,distance,pan,viewSize})
      schedule()
    },irregularSoundDelay(d.profiles[profile][e].cooldown))}
    schedule()
    return()=>{cancelled=true;clearTimeout(timer)}
  },[source,cart,active,sync,playing,clip,profile,distance,pan,viewSize,d.profiles])
  const audition=async()=>{if(event==='selection'&&source){await playSourceSelection(profile);return}if(event==='selection'&&!source){onSelect();void unlockSceneAudio();await playCharacterSound(type,0,bodyType,profile,{voiceVariant})}else{await unlockSceneAudio();stopActorAudio(actor);await emitCharacterAudio(profile,event,{actor,preview:true,distance,pan,viewSize,loop:['scene/stream','scene/shore','scene/waterfall','scene/wind'].includes(profile)})}}
  const available=event==='selection'&&!source?VOICE_AUDITIONS.filter(s=>s.character===type&&s.bodyType===bodyType):SFX_AUDITIONS.filter(s=>!s.loop||profile.startsWith('scene/'))
  const selectedClips=event==='selection'&&!source?SOUND_AUDITIONS.filter(s=>s.url===(playback.url??greeting?.url)):SOUND_AUDITIONS.filter(s=>slot.clips.includes(s.id))
  const updateEvent=(next:CharacterAudioEvent)=>{
    setEvent(next)
    if(source)return
    if(next==='walking')onPreviewClip('walk')
    if(next==='work')onPreviewClip(profile==='job/tavern'?'seatedDrink':['peasant','friar','job/woodcutter'].includes(profile)?'treeFelling':'building')
    if(next==='idle')onPreviewClip('idle')
  }
  const numberControl=(key:'volume'|'rate'|'jitter'|'cooldown'|'range'|'phase',label:string,min:number,max:number,step:number,display?:string)=><Tuner key={key} label={label} labelClassName="w-28" value={slot[key]} display={display??slot[key].toFixed(2)} min={min} max={max} step={step} onChange={value=>patchEvent(profile,event,{[key]:value})}/>
  const assigned=event==='selection'&&!source?VOICE_AUDITIONS.filter(s=>slot.clips.includes(s.id)):selectedClips
  return <>
    <label className="person-choice">Sound source<ChromeSelect aria-label="Sound source" value={layer} onChange={e=>setLayer(e.target.value)}><option value="subject">{AUDIO_PROFILES[subjectProfile]}</option>{Object.entries(SCENE_AUDIO_PROFILES).filter(([id])=>id.startsWith('scene/')).map(([id,label])=><option value={id} key={id}>{label}</option>)}</ChromeSelect></label>
    <AssetEditorPanels flat={flat}><AssetEditorSection title="Event">
      <p className="person-hint">{AUDIO_PROFILES[profile]}{!source&&` · ${bodyType}`}</p>
      <label className="person-choice">Event<ChromeSelect aria-label="Sound event" value={event} onChange={e => updateEvent(e.target.value as CharacterAudioEvent)}>
        {AUDIO_EVENTS.filter(e=>!source||(animal?e==='selection'||e==='idle':cart?e==='walking':e==='idle')).map(e=><option key={e} value={e}>{e==='selection'?animal?'Selection call':'Greeting':e==='walking'?cart?'Rolling wheels':'Footsteps':e==='work'?'Work':source?animal?'Occasional calls':profile==='scene/crowd'?'Conversation':'Ambience':'Idle'}</option>)}
      </ChromeSelect></label>
      <div className="person-presets">
        <ChromeButton className="hud-action" onClick={audition}>Play {event}</ChromeButton>
        <ChromeButton className="hud-action" onClick={()=>{setSync(false);stopAllSounds()}}>Stop sounds</ChromeButton>
      </div>
      {selected&&<ChromeButton className="hud-action" onClick={onDeselect}>Deselect character</ChromeButton>}
      <label className="person-check"><ChromeCheckbox type="checkbox" checked={slot.enabled} onChange={e=>patchEvent(profile,event,{enabled:e.target.checked})}/>Enable {event}</label>
      {event!=='selection'&&<label className="person-check"><ChromeCheckbox type="checkbox" checked={sync} onChange={e=>{setSync(e.target.checked);void unlockSceneAudio()}}/>Hear animation events</label>}
      {source&&<p className="person-hint">{animal?'In the game, moving animals call at irregular intervals.':cart?'In the game, wheels sound only while the cart moves.':profile==='scene/crowd'||profile==='scene/crowd-accents'?'Soft murmurs overlap as more NPCs enter view. Each person has their own timer and position; brief laughs and calls are separate, rarer reactions.':profile==='scene/stream'||profile==='scene/shore'||profile==='scene/waterfall'?'Water fades in near visible rivers or pond edges.':'Birds and leaf rustle follow nearby standing trees.'}</p>}
      {event!=='selection'&&<p className="person-hint">Use Play in the animation toolbar to hear this character moving. One-shot playback works while paused.</p>}
      {numberControl('volume','Event volume',0,1,.01,`${Math.round(slot.volume*100)}%`)}
      {numberControl('rate','Playback speed',.5,1.5,.01,`${slot.rate.toFixed(2)}×`)}
      {event==='selection'&&!source&&displayedLine&&greeting&&<p role="status" className="person-hint">“{displayedLine.text}”<br/>{displayedLine.gloss}<br/>{greeting.tongue}</p>}
    </AssetEditorSection>
    <AssetEditorSection title="Clips">
      {event==='selection'&&greeting&&<label className="person-check"><ChromeCheckbox type="checkbox" checked={!slot.clips.length} onChange={e=>patchEvent(profile,event,{clips:e.target.checked?[]:[greeting.id]})}/>Use this character’s greeting</label>}
      {event==='selection'&&greeting&&!slot.clips.length&&<p className="person-hint">{selectedClips[0]?.label??greeting.id}</p>}
      {assigned.map(s=><div key={s.id} className="person-choice"><span>{s.label??s.id}</span><ChromeButton className="hud-action" aria-label={`Remove ${s.label??s.id}`} onClick={()=>patchEvent(profile,event,{clips:slot.clips.filter(id=>id!==s.id)})}>Remove</ChromeButton></div>)}
      <label className="person-choice">Add clip<ChromeSelect aria-label="Add sound clip" value="" onChange={e=>{if(e.target.value)patchEvent(profile,event,{clips:[...slot.clips,e.target.value]})}}><option value="">Choose a recording…</option>{available.filter(s=>!slot.clips.includes(s.id)).map(s=><option key={s.id} value={s.id}>{s.label??s.id}</option>)}</ChromeSelect></label>
      <p className="person-hint">{source?'Short recordings alternate; occasional calls use an irregular interval.':'Variations alternate between contacts. Greeting choices match the selected body voice.'}</p>
    </AssetEditorSection>
    <AssetEditorSection title="Timing">
      {event==='selection'?<p className="person-hint">{source?'The selected animal answers at a consistent volume, independent of zoom.':'Greetings play on selection. Each person starts on a consistent line; repeated selections cycle the bank.'}</p>:<>
        {numberControl('jitter','Pitch variation',0,.2,.01,`±${Math.round(slot.jitter*100)}%`)}
        {numberControl('cooldown','Minimum interval',0,60,.1,`${slot.cooldown.toFixed(1)} s`)}
        {event==='work'&&<label className="person-check"><ChromeCheckbox type="checkbox" checked={slot.rigTiming} onChange={e=>patchEvent(profile,event,{rigTiming:e.target.checked})}/>Follow the rig’s impact frame</label>}
        {(!source&&(event==='walking'||(event==='work'&&!slot.rigTiming)))&&numberControl('phase','Contact phase',0,.99,.01,`${Math.round(slot.phase*100)}%`)}
        {event==='work'&&slot.rigTiming&&<p className="person-hint">Current impact: {Math.round(soundImpactPhase(clip,slot)*100)}% of the animation.</p>}
      </>}
    </AssetEditorSection>
    <AssetEditorSection title="Mix">
      <label className="person-check"><ChromeCheckbox type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)} />Mute sounds</label>
      {(['master','selection','foley','ambience','ducking'] as const).map(key=><Tuner key={key} label={({master:'Master',selection:'Greetings',foley:'Effects',ambience:'Idle ambience',ducking:'Under dialogue'})[key]} labelClassName="w-28" display={`${Math.round(d.mixer[key]*100)}%`} value={d.mixer[key]} min={0} max={1} step={.01} onChange={value=>patchMixer({[key]:value})}/>)}
      <Tuner label="Background mix" labelClassName="w-28" value={d.mixer.background} display={`${Math.round(d.mixer.background*100)}%`} min={0} max={2} step={.01} onChange={background=>patchMixer({background})}/>
      <Tuner label="Zoom falloff" labelClassName="w-28" value={d.mixer.zoomRolloff} display={`${d.mixer.zoomRolloff.toFixed(1)}×`} min={.5} max={4} step={.1} onChange={zoomRolloff=>patchMixer({zoomRolloff})}/>
      <p className="person-hint">Footsteps, conversation, animal calls and wheels follow stage zoom; selection sounds keep their level. Minstrel music follows zoom too. Current ambience retains {Math.round(zoomSoundGain(viewSize,d.mixer.zoomRolloff,profile.startsWith('scene/')||profile==='minstrel'?24:12)*100)}% of the close-up level. Higher falloff makes distant scenes quieter.</p>
      {event!=='selection'&&numberControl('range','Audible range',1,80,1,`${slot.range} tiles`)}
      <Tuner label="Maximum voices" labelClassName="w-28" value={d.mixer.maxVoices} display={String(d.mixer.maxVoices)} min={1} max={32} onChange={maxVoices=>patchMixer({maxVoices})}/>
      <label className="person-choice">Solo event<ChromeSelect aria-label="Solo event" value={d.mixer.solo} onChange={e=>patchMixer({solo:e.target.value as typeof d.mixer.solo})}>{['none',...AUDIO_EVENTS].map(e=><option key={e}>{e}</option>)}</ChromeSelect></label>
      <label className="person-check"><ChromeCheckbox type="checkbox" checked={d.mixer.sceneEnabled} onChange={e=>patchMixer({sceneEnabled:e.target.checked})}/>Scene action sounds</label>
    </AssetEditorSection>
    <AssetEditorSection title="Inspect"><AudioPeakSampler active={active} />
      <Tuner label="Preview distance" labelClassName="w-28" display={`${distance} tiles`} value={distance} min={0} max={80} onChange={setDistance}/>
      <Tuner label="Preview pan" labelClassName="w-28" display={pan.toFixed(2)} value={pan} min={-1} max={1} step={.05} onChange={setPan}/>
      <p role="status" className="person-hint">{qa.active} / {d.mixer.maxVoices} effect voices · output peak {qa.peak?`${(20*Math.log10(qa.peak)).toFixed(1)} dBFS`:'silent'}</p>
      {selectedClips.map(s=><p role="status" className="person-hint" key={s.id}>{s.id}<br/>{s.duration}s · peak {s.peakDb??'unmeasured'} dBFS · RMS {s.rmsDb??'unmeasured'} dBFS<br/><a href={s.url} download>Download WAV</a></p>)}
      <ChromeButton className="hud-action" onClick={()=>useAudioQA.setState({history:[]})}>Clear event log</ChromeButton>
      <div role="log" aria-label="Sound event log">{qa.history.slice(0,4).map(r=><p className="person-hint" key={r.id}>{r.profile} · {r.event} · {r.result}{r.actor&&<> · {r.actor}</>}<br/>{r.clip||'No clip'} · gain {r.gain.toFixed(3)} · pan {r.pan.toFixed(2)}</p>)}</div>
    </AssetEditorSection>
    {files && <AssetEditorSection title="Files">{files}</AssetEditorSection>}
    </AssetEditorPanels>
  </>
}
