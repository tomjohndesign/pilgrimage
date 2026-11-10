"use client"
import { sceneSoundSources, tickSceneSoundSources } from "@/lib/game/scene-sound-sources"
import { useEffect } from "react"
import { stopAllSounds } from "@/lib/game/character-audio"
import { useSimulationStore } from "@/lib/game/simulation-store"
import { stopSceneAudio, unlockSceneAudio } from "@/lib/game/scene-audio"

export function SceneAudioLifecycle({active=true}:{active?:boolean}) {
  useEffect(()=>{
    if(!active){stopAllSounds();return}
    // Cheap once running. Touch activation lands on pointerup/touchend/click, not pointerdown.
    const unlock=(create=true)=>{unlockSceneAudio(create).catch(()=>{/* Retried on the next gesture. */})}
    const gesture=()=>unlock()
    // Returning to the tab resumes a context the OS suspended, without creating one unprompted.
    const visibility=()=>{if(document.hidden){stopAllSounds();sceneSoundSources.clear()}else unlock(false)}
    const unsubscribe=useSimulationStore.subscribe((s,p)=>{if(s.paused&&!p.paused){stopSceneAudio();sceneSoundSources.clear()}})
    const timer=setInterval(()=>{if(!document.hidden&&!useSimulationStore.getState().paused)tickSceneSoundSources()},200)
    const gestures=['pointerdown','pointerup','touchend','click','keydown'] as const
    for(const type of gestures)window.addEventListener(type,gesture,{passive:true})
    document.addEventListener('visibilitychange',visibility)
    return()=>{clearInterval(timer);sceneSoundSources.clear();unsubscribe();for(const type of gestures)window.removeEventListener(type,gesture);document.removeEventListener('visibilitychange',visibility);stopAllSounds()}
  },[active])
  return null
}
