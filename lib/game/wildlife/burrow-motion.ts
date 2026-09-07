import { easeWing } from "./motion"
import { RIG_TO_WORLD } from "../transport/assets"

export const BURROW_SECONDS = 3
export const BURROW_APPROACH = .78
export const BURROW_STRIDE = .28

/** Entrance faces +Z. All distances are rig units, shared by the map and editor. */
export function burrowMotion(shelter: number, entering: boolean) {
  const t=Math.max(0,Math.min(1,shelter)), travel=easeWing(t)
  const z=BURROW_APPROACH-1.7*travel
  const y=-.88*easeWing((travel-.22)/.78)
  const tuck=easeWing(t/.20)
  return {z,y,heading:entering?Math.PI:0,tuck,
    pitch:(entering?1:-1)*.20*Math.sin(travel*Math.PI),
    stridePhase:(entering?1.7*travel:1.7*(1-travel))/BURROW_STRIDE,
    drive:easeWing(t/.12)*easeWing((1-t)/.12),
    clipPhase:entering?.1+t*.32:.58+(1-t)*.32}
}
export function burrowApproach(hole: {x:number;z:number;heading:number}, scale=1) {
  const distance=BURROW_APPROACH*RIG_TO_WORLD*scale
  return {x:hole.x+Math.sin(hole.heading)*distance,z:hole.z+Math.cos(hole.heading)*distance}
}

/** Pauses at each end. Entry and exit turn only while entirely underground. */
export function burrowPreview(phase: number) {
  const t=((phase%1)+1)%1, entering=t<.5
  const shelter=entering?Math.max(0,Math.min(1,(t-.1)/.32)):Math.max(0,Math.min(1,(.9-t)/.32))
  const pose=burrowMotion(shelter,entering)
  if(t<.1)pose.heading=Math.PI*easeWing(t/.1)
  return {...pose,concealed:t>=.42&&t<=.58}
}
