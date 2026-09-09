import * as THREE from "three"
import type { GameMap } from "../map/types"
import type { SpriteClip } from "../character-assets"
import { spriteRow } from "../character-assets"
import { BASE_PERSON } from "../base-person/pose"
import { activityClip } from "../base-person/activity"
import { crossedWalkSupport, plantFoot, reducedWalkFrame, type FootPlant, type FootPlantResult } from "../base-person/gait"
import { advanceWalkPhase, walkClipFrame } from "../motion"
import { walkingSurface } from "../map/walking-surface"
import type { SceneryDetail } from "./scenery-detail"
import type { CharacterBatchEntry } from "./character-batch"
import type { spriteGait } from "./sprite-gait"
import { type spriteView, SPRITE_DIRECTIONS } from "./sprite-view"
import { updateTranslatedWorld } from "./sprite-transforms"

export interface SpritePoseState {
  phase: number; actionTime: number; clip: string; seeded: boolean; plant: FootPlant | null
  texture: THREE.Texture | null; frame: number; row: number
}

export interface CrowdWalk {
  map: GameMap
  walk: SpriteClip
  weary?: SpriteClip
  wearyIndex?: number
  sources: THREE.Texture[]
  depths: ReadonlyMap<number, THREE.Texture>
  rowOffset: number
  size: number
  stride: number
  authoredStride: number
  fps: number
  rig: ReturnType<typeof spriteGait>
  state: SpritePoseState
  inverse: THREE.Matrix4
  origin: THREE.Vector3
  contact: THREE.Vector3
  corrected: THREE.Vector3
  planted: FootPlantResult
  groundAt: (x: number, z: number) => number
  key: { action: string; detail: number; direction: number; view: string; size: number; left: string; right: string }
  uv: THREE.Vector4
}

/** Ordinary walking has no work alignment, furniture, sockets or action events.
 * Keep its hot state together while using the same authored poses and contact
 * equations as the full sprite. False leaves that state untouched for fallback. */
export function updateCrowdWalk(walk: CrowdWalk, parent: THREE.Object3D, pose: THREE.Object3D,
  entry: CharacterBatchEntry, view: ReturnType<typeof spriteView>, detail: SceneryDetail, delta: number): boolean {
  const motion = parent.userData
  if (!motion.moving || motion.activity === "flying" || motion.activity === "performing") return false
  const requested = activityClip(motion.activity, true, motion.carrying, motion.weary === true)
  if (requested !== "walk" && requested !== "wearyWalk") return false
  const action = requested === "wearyWalk" ? walk.weary : undefined
  const clip = action ?? walk.walk, index = action ? walk.wearyIndex! : 0
  const depth = walk.depths.get(index)
  if (!depth) return false
  const state = walk.state, strides = clip.strides ?? 1
  const dt = Math.min(delta, .1) * motion.playbackRate
  if (!state.seeded && motion.initialized) { state.phase = (motion.phase ?? 0) % 1; state.seeded = true }
  if (motion.motionReset) state.plant = null
  if (state.clip !== requested) { state.actionTime = 0; state.clip = requested }
  state.actionTime += dt
  const previousPhase = state.phase, distance = motion.playbackRate === 0 ? 0 : motion.distance ?? 0
  state.phase = advanceWalkPhase(state.phase, distance, dt, walk.walk.columns, walk.fps, walk.stride, true, walk.walk.strides ?? 1)
  const frame = reducedWalkFrame(walkClipFrame(state.phase, clip.columns, strides), clip.columns, strides, detail)
  const direction = spriteRow(motion.heading, view.yaw), row = walk.rowOffset + direction
  const data = entry.sprite.userData
  data.walkPhase = state.phase; data.walkStride = walk.authoredStride; data.distance = motion.distance ?? 0
  data.walkDetail = detail; data.displayedFrame = frame; data.clip = action ? requested : "walk"

  if (crossedWalkSupport(previousPhase, distance / Math.max(.01, walk.stride), clip.columns, strides)) state.plant = null
  const foot = walk.rig.contact(frame, clip.columns, strides), turn = SPRITE_DIRECTIONS[direction]
  const scale = walk.size / BASE_PERSON.camera.viewSize
  const x = (foot.x * turn.cos + foot.z * turn.sin) * scale
  const z = (-foot.x * turn.sin + foot.z * turn.cos) * scale * view.depthScale
  walk.contact.set(x * view.cosYaw + z * view.sinYaw, 0, -x * view.sinYaw + z * view.cosYaw)
  const key = walk.key
  if (key.action !== requested || key.detail !== detail || key.direction !== direction || key.view !== view.key || key.size !== walk.size) {
    key.action = requested; key.detail = detail; key.direction = direction; key.view = view.key; key.size = walk.size
    key.left = `${requested}:${detail}:left:${direction}:${view.key}:${walk.size}`
    key.right = `${requested}:${detail}:right:${direction}:${view.key}:${walk.size}`
  }
  walk.origin.setFromMatrixPosition(parent.matrixWorld)
  const planted = plantFoot(state.plant, key[foot.side], walk.origin, walk.contact, walk.groundAt, walk.planted)
  state.plant = planted.plant
  walk.corrected.set(walk.origin.x + planted.offset.x, walk.origin.y + planted.offset.y, walk.origin.z + planted.offset.z)
  walk.inverse.copy(parent.matrixWorld).invert()
  pose.position.copy(walk.corrected.applyMatrix4(walk.inverse))
  updateTranslatedWorld(pose)
  walk.corrected.setFromMatrixPosition(pose.matrixWorld)
  const surface = walkingSurface(walk.map, walk.corrected.x, walk.corrected.z)
  entry.ground.value.set(-surface.dx, 1, -surface.dz,
    surface.dx * walk.corrected.x + surface.dz * walk.corrected.z - surface.height)
  entry.depth.map.value = depth; entry.depth.enabled.value = true
  const texture = walk.sources[index]
  entry.color = texture; entry.uv = walk.uv
  if (state.texture !== texture || state.frame !== frame || state.row !== row) {
    state.texture = texture; state.frame = frame; state.row = row
    walk.uv.set(1 / clip.columns, 1 / clip.rows, frame / clip.columns, (clip.rows - 1 - row) / clip.rows)
  }
  return true
}
