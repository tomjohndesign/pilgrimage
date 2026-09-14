import { SPLITTING_CONTACT, SPLITTING_FRAMES } from "./base-person/splitting"
import { BUILDING_FRAMES } from "./base-person/building"
import type { EventSound } from "./character-sound-store"
import { Vector3, type Object3D, type Camera } from "three"
import { useCameraStore } from "./camera-store"
import { crossedSoundMarker, useCharacterSoundStore } from "./character-sound-store"
import { emitCharacterAudio, stopActorAudio } from "./scene-audio"

export function soundEventForClip(clip:string): "walking"|"work"|"idle"|undefined {
  if (["walk","wearyWalk","carrying","procession"].includes(clip)) return "walking"
  if (["woodcutting","treeFelling","building","performing","playing","drinking","drinkingLow","seatedDrink","seatedMeal","eating"].includes(clip)) return "work"
  if (clip === "idle") return "idle"
}
export function soundImpactPhase(clip:string,slot:Pick<EventSound,'phase'|'rigTiming'>) {
  if(!slot.rigTiming)return slot.phase
  if(clip==='treeFelling')return 23/24
  if(clip==='woodcutting')return SPLITTING_CONTACT/SPLITTING_FRAMES
  if(clip==='building')return Math.ceil(.8*BUILDING_FRAMES)/BUILDING_FRAMES
  return slot.phase
}
export function soundMarkersCrossed(previous:number,current:number,event:string,phase:number) {
  return crossedSoundMarker(previous,current,phase) || (event === "walking" && crossedSoundMarker(previous,current,(phase+.5)%1))
}
const states=new WeakMap<Object3D,{phase:number;clip:string;time:number;idleAt:number}>()
const point=new Vector3()
/** Uses actual rendered stride/action progress, including the crowd batching path. */
export function tickCharacterSound(parent:Object3D,camera:Camera,clip:string,phase:number) {
  const {audioProfile:profile,audioActor:actor}=parent.userData
  if(!profile||!actor)return
  const now=performance.now(),previous=states.get(parent),event=soundEventForClip(clip)
  if(event==='walking')phase%=1
  const state={phase,clip,time:now,idleAt:previous?.idleAt??now+3000+Math.random()*12000}
  states.set(parent,state)
  if(parent.userData.playbackRate===0||parent.userData.motionReset||!parent.visible){stopActorAudio(actor);return}
  if(!event||!previous||previous.clip!==clip||now-previous.time>250)return
  const slot=useCharacterSoundStore.getState().document.profiles[profile]?.[event]
  if(!slot)return
  let current=phase
  // The distance-driven rig wraps its walking phase at one stride.
  if(event==='walking'&&current<previous.phase)current+=1
  const trigger=event==='idle'? now>=state.idleAt:soundMarkersCrossed(previous.phase,current,event,soundImpactPhase(clip,slot))
  if(!trigger)return
  if(event==='idle')state.idleAt=now+Math.max(3,slot.cooldown)*(1+Math.random())*1000
  point.setFromMatrixPosition(parent.matrixWorld)
  const focus=useCameraStore.getState(),distance=Math.hypot(point.x-focus.targetX,point.z-focus.targetZ)
  point.project(camera)
  const visible=parent.userData.audioVisible!==false&&Math.abs(point.x)<=1&&Math.abs(point.y)<=1&&Math.abs(point.z)<=1
  if(!visible){stopActorAudio(actor);return}
  void emitCharacterAudio(profile,event,{actor,distance,pan:point.x,visible})
}
