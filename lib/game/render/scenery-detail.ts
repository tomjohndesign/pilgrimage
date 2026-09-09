import * as THREE from "three"
import { indexFlatGeometry } from "./flat-geometry"

export type SceneryDetail = 0 | 1 | 2
export type SceneryProfile = "desktop" | "mobile"
interface DetailState {
  current: SceneryDetail
  pending: SceneryDetail
  zooming: boolean
  target: number
  density: number
  changedAt: number
  profile: SceneryProfile
  from: SceneryDetail
  fade: number
  fadeStartedAt: number
}
const details = new WeakMap<THREE.Scene, DetailState>()
const ZOOM_QUIET_SECONDS = .18
const DETAIL_FADE_SECONDS = .24

/** Use display size, not distance from an orthographic camera. Hysteresis
 * prevents repeated buffer switches when zoom settles near a boundary. */
export function chooseSceneryDetail(pixelsPerUnit: number, previous: SceneryDetail, profile: SceneryProfile = "desktop"): SceneryDetail {
  const earlier = profile === "mobile" ? 1.6 : 1.15
  if (pixelsPerUnit < (previous === 2 ? 11 : 9) * earlier) return 2
  if (pixelsPerUnit < (previous > 0 ? 19 : 16) * earlier) return 1
  return 0
}

export function updateSceneryDetail(scene: THREE.Scene, camera: THREE.Camera, height: number,
  time: number, requestedViewSize?: number, profile: SceneryProfile = "desktop", minimum: SceneryDetail = 0): SceneryDetail {
  const cam = camera as THREE.OrthographicCamera
  const viewSize = cam.isOrthographicCamera ? (cam.top - cam.bottom) / cam.zoom : 0
  const target = requestedViewSize === undefined ? viewSize : requestedViewSize / cam.zoom
  const density = viewSize > 0 ? height / viewSize : Infinity
  let state = details.get(scene)
  if (!state) {
    const initial = Math.max(minimum, chooseSceneryDetail(density, 0, profile)) as SceneryDetail
    state = { current: initial, pending: initial, zooming: false, target, density, changedAt: time,
      profile, from: initial, fade: 1, fadeStartedAt: -Infinity }
    details.set(scene, state)
  }
  // Keep resident layers through the gesture AND its camera tween. A quarter
  // display pixel at the viewport edge is settled enough; exponential damping
  // never reaches the requested value exactly. New input restarts the quiet
  // period even when the user reverses direction around a detail threshold.
  const tweening = viewSize > 0 && Math.abs(target - viewSize) * height / (2 * viewSize) > .25
  const densityMoving = Number.isFinite(density) && Number.isFinite(state.density)
    && Math.abs(density / state.density - 1) * height / 2 > .25
  if (target !== state.target || tweening || densityMoving || time < state.changedAt) state.changedAt = time
  state.target = target; state.density = density; state.profile = profile
  state.pending = Math.max(minimum, chooseSceneryDetail(density, state.current, profile)) as SceneryDetail
  state.zooming = time - state.changedAt < ZOOM_QUIET_SECONDS
  if (!state.zooming && state.current !== state.pending) {
    state.from = state.current; state.current = state.pending; state.fadeStartedAt = time
  }
  if (state.zooming) state.fadeStartedAt = -Infinity
  state.fade = THREE.MathUtils.smoothstep(time - state.fadeStartedAt, 0, DETAIL_FADE_SECONDS)
  return state.current
}

/** The game updates this once after the camera, before animation callbacks.
 * Standalone asset previews retain their full authored detail. */
export function sceneryDetail(scene: THREE.Scene): SceneryDetail { return details.get(scene)?.current ?? 0 }
export function sceneryFadeProgress(scene: THREE.Scene): number { return details.get(scene)?.fade ?? 1 }
export function sceneryZooming(scene: THREE.Scene): boolean { return details.get(scene)?.zooming ?? false }
export function sceneryCloseOpacity(scene: THREE.Scene): number {
  const state = details.get(scene)
  if (!state) return 1
  return THREE.MathUtils.lerp(state.from === 0 ? 1 : 0, state.current === 0 ? 1 : 0, state.fade)
}

/** Opt-in browser diagnostics; ordinary rendering reads the numeric level. */
export function sceneryDetailStatus(scene: THREE.Scene) {
  const state = details.get(scene)
  return state ? { current: state.current, pending: state.pending, zooming: state.zooming, fade: state.fade, profile: state.profile } : undefined
}

/** Detailed crowns and their representative shapes share the original ID. */
export function scenerySourceVisible(source: THREE.InstancedMesh, detail: SceneryDetail): boolean {
  if (source.userData.sceneryDetail === "grass") return detail === 0
  if (source.userData.sceneryDetail === "canopy") return detail < 2
  if (source.userData.sceneryDetail === "coarse") return detail === 2
  return true
}

export function simplifiedSceneryGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry | undefined {
  if (source.name === "CylinderGeometry" && typeof source.userData.trunkTaper === "number") {
    const geometry = new THREE.CylinderGeometry(source.userData.trunkTaper, 1, 1, 3)
    geometry.translate(0, .5, 0)
    return indexFlatGeometry(geometry)
  }
  if (source.name !== "IcosahedronGeometry" || (source.index?.count ?? 0) <= 60) return
  return indexFlatGeometry(new THREE.IcosahedronGeometry(1, 0))
}

/** Tree-to-tree ink fades with zoom, while selections and other outlines keep
 * their original opacity and pixel width. */
export function treeEdgeOpacity(camera: THREE.Camera, height: number): number {
  const cam = camera as THREE.OrthographicCamera
  if (!cam.isOrthographicCamera) return 1
  const density = height * cam.zoom / (cam.top - cam.bottom)
  return THREE.MathUtils.smoothstep(density, 9, 18)
}
