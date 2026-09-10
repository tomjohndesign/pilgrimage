import manifest from "../../../public/textures/transport/v30/manifest.json"
import { populationVisual } from "../base-person/population-assets"
import { validatePersonDesign } from "../base-person/design"
import { personWalkStride } from "../base-person/gait"
import { BASE_PERSON } from "../base-person/pose"
import type { TravelerTypeId } from "../travelers"
import { PARTY_TRANSPORT_VERSION } from "./assets"

export type HandlerClip = "walk" | "wearyWalk" | "idle"
export const HANDLER_FRAME = manifest.handlerFrame
export function handlerVisual(calling: TravelerTypeId, variant: number, age = 18) {
  const entry = manifest.handlers[calling as keyof typeof manifest.handlers]
  const base = populationVisual(calling, variant, null, age)
  if (!entry) return base
  const design = validatePersonDesign(entry.designs[variant]), scale = .74 * HANDLER_FRAME.cellSize / 48
  const clip = (name: HandlerClip) => ({ url: `/textures/transport/${PARTY_TRANSPORT_VERSION}/handler-${calling}-${name}.png`,
    depth: `/textures/transport/${PARTY_TRANSPORT_VERSION}/depth-handler-${calling}-${name}.png`,
    columns: HANDLER_FRAME.frames[name], strides: 1, rows: 48, stillFrame: 0 })
  return { ...base, walk: clip("walk"), idle: clip("idle"), actions: { ...base.actions, wearyWalk: { ...clip("wearyWalk"), shadow: base.shadow.actions!.wearyWalk! } },
    design, scale, center: [HANDLER_FRAME.anchor[0]/HANDLER_FRAME.cellSize,1-HANDLER_FRAME.anchor[1]/HANDLER_FRAME.cellSize] as [number,number],
    rowOffset: variant*8, reservedTones: true, walkStride: personWalkStride(design,scale) }
}
export function handlerHand(calling: TravelerTypeId, variant: number, clip: HandlerClip, row: number, frame: number) {
  const hands = manifest.handlers[calling as keyof typeof manifest.handlers]?.hands[clip]
  return hands?.[(variant*8+row)*HANDLER_FRAME.frames[clip]+frame]
}
/** Baked socket depth relative to the sprite's ground anchor, in camera space. */
export function handlerHandView(hand: {x:number;y:number;depth:number}, texel: number): [number,number,number] {
  const size=HANDLER_FRAME.cellSize, anchor=HANDLER_FRAME.anchor, extent=BASE_PERSON.camera.viewSize
  const pitch=BASE_PERSON.camera.pitch*Math.PI/180, targetY=(anchor[1]-size/2)/size*extent/Math.cos(pitch)
  const originDepth=(2*(10+targetY*Math.sin(pitch))-30.1)/29.9
  return [(hand.x-anchor[0])*texel,(anchor[1]-hand.y)*texel,(originDepth-hand.depth)*29.9/2*texel*size/extent]
}
