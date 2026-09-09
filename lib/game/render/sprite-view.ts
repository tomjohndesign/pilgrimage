import type { Camera } from "three"
import { BASE_PERSON } from "../base-person/pose"

interface SpriteView {
  x: number; z: number; up: number; forward: number
  yaw: number; pitch: number; cosYaw: number; sinYaw: number; depthScale: number; key: string
}
const views = new WeakMap<Camera, SpriteView>()
const bakedPitch = Math.sin(BASE_PERSON.camera.pitch * Math.PI / 180)

/** Every sprite sees the same camera orientation. Reuse its trigonometry and
 * contact key through pans/zooms; inspect the matrix so editor/bake cameras can
 * still change direction several times without advancing a render clock. */
export function spriteView(camera: Camera): SpriteView {
  const m = camera.matrixWorld.elements
  let view = views.get(camera)
  if (view && view.x === m[8] && view.z === m[10] && view.up === m[5] && view.forward === m[9]) return view
  const yaw = Math.atan2(m[8], m[10]), pitch = Math.max(.01, Math.abs(m[9] / m[5]))
  view ??= {} as SpriteView
  view.x = m[8]; view.z = m[10]; view.up = m[5]; view.forward = m[9]
  view.yaw = yaw; view.pitch = pitch; view.cosYaw = Math.cos(yaw); view.sinYaw = Math.sin(yaw)
  view.depthScale = bakedPitch / Math.sin(Math.atan(pitch))
  view.key = `${yaw.toFixed(4)}:${pitch.toFixed(4)}`
  views.set(camera, view)
  return view
}

export const SPRITE_DIRECTIONS = Array.from({ length: 8 }, (_, direction) => ({
  cos: Math.cos(-direction * Math.PI / 4), sin: Math.sin(-direction * Math.PI / 4),
}))
