"use client"
import { sceneSoundSources, tickSceneSoundSources } from "@/lib/game/scene-sound-sources"
import { useEffect } from "react"
import { stopAllSounds } from "@/lib/game/character-audio"
import { useSimulationStore } from "@/lib/game/simulation-store"
import { stopSceneAudio, unlockSceneAudio } from "@/lib/game/scene-audio"

export function SceneAudioLifecycle({active=true}:{active?:boolean}) {
  useEffect(()=>{
    if(!active){stopAllSounds();return}
    const unlock=()=>{void unlockSceneAudio()}
    const visibility=()=>{if(document.hidden){stopAllSounds();sceneSoundSources.clear()}}
    const unsubscribe=useSimulationStore.subscribe((s,p)=>{if(s.paused&&!p.paused){stopSceneAudio();sceneSoundSources.clear()}})
    const timer=setInterval(()=>{if(!document.hidden&&!useSimulationStore.getState().paused)tickSceneSoundSources()},200)
    window.addEventListener('pointerdown',unlock)
    window.addEventListener('keydown',unlock)
    document.addEventListener('visibilitychange',visibility)
    return()=>{clearInterval(timer);sceneSoundSources.clear();unsubscribe();window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);document.removeEventListener('visibilitychange',visibility);stopAllSounds()}
  },[active])
  return null
}
