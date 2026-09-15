"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { Vector3 } from "three"
import type { GameMap } from "@/lib/game/map/types"
import type { TreePlacement } from "@/lib/game/trees/placement"
import { environmentSoundField, type AmbientPoint } from "@/lib/game/environment-sound-field"
import { useCameraStore } from "@/lib/game/camera-store"
import { useBuildStore } from "@/lib/game/build-store"
import { useSimulationStore } from "@/lib/game/simulation-store"
import { useCharacterSoundStore } from "@/lib/game/character-sound-store"
import { emitCharacterAudio, fadeActorAudio, hasActorAudio, moveActorAudio, stopActorAudio } from "@/lib/game/scene-audio"
import { irregularSoundDelay } from "@/lib/game/scene-sound-sources"

const profiles=['scene/waterfall','scene/stream','scene/shore','scene/wind','scene/birds']

/** Continuous local water/leaves and sparse canopy birds share the existing mixer. */
export function EnvironmentAudio({map,trees,showTrees}:{map:GameMap;trees:readonly TreePlacement[];showTrees:boolean}) {
  const field=useMemo(()=>environmentSoundField(map,trees),[map.tiles,map.water,trees])
  const point=useMemo(()=>new Vector3(),[]),next=useRef(0),birdAt=useRef(0)
  useEffect(()=>()=>{for(const profile of profiles)stopActorAudio(profile)},[field])
  useFrame(({camera})=>{
    const now=performance.now()
    if(now<next.current)return
    next.current=now+250
    if(document.hidden||useSimulationStore.getState().paused){for(const profile of profiles)stopActorAudio(profile);birdAt.current=now+2000;return}
    const focus=useCameraStore.getState()
    const visible=(source:AmbientPoint)=>{point.copy(source).project(camera);return Math.abs(point.x)<=1&&Math.abs(point.y)<=1&&Math.abs(point.z)<=1}
    const sample=field.sample(focus.targetX,focus.targetZ,useBuildStore.getState().felled,visible,showTrees)
    const options=(source:AmbientPoint,intensity=1)=>{
      point.copy(source).project(camera)
      return {actor:source.profile,distance:Math.hypot(source.x-focus.targetX,source.z-focus.targetZ),pan:point.x,intensity}
    }
    for(const profile of ['scene/waterfall','scene/stream','scene/shore','scene/wind']) {
      const source=profile==='scene/waterfall'?sample.waterfall:profile==='scene/wind'?sample.trees:sample.water?.profile===profile?sample.water:undefined
      if(!source){fadeActorAudio(profile);continue}
      const mix=options(source,profile==='scene/wind'?.3+.7*sample.canopy:1)
      moveActorAudio(profile,mix.distance,mix.pan,mix.intensity)
      if(!hasActorAudio(profile))void emitCharacterAudio(profile,'idle',{...mix,loop:true})
    }
    if(!sample.trees){fadeActorAudio('scene/birds');birdAt.current=now+2000;return}
    moveActorAudio('scene/birds',Math.hypot(sample.trees.x-focus.targetX,sample.trees.z-focus.targetZ),options(sample.trees).pan)
    if(now<birdAt.current)return
    birdAt.current=now+irregularSoundDelay(useCharacterSoundStore.getState().document.profiles['scene/birds'].idle.cooldown)
    void emitCharacterAudio('scene/birds','idle',{...options({...sample.trees,profile:'scene/birds'}),intensity:.5+.5*sample.canopy})
  })
  return null
}
