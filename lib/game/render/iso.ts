/**
 * Isometric camera math. Pure functions — no three.js, no React — so the
 * projection and panning behaviour can be unit-tested headlessly.
 *
 * The camera is orthographic with a fixed pitch. It orbits a `target` point on
 * the ground plane (y = 0); panning moves that target, keyboard rotation steps
 * by quarter turns, touch twists snap on release, and zoom changes the frustum height.
 */

/** True isometric: atan(1/√2) ≈ 35.264°, so a cube's top face is a regular rhombus. */
export const ISO_PITCH = Math.atan(1 / Math.SQRT2)

/** View 0 looks down the +X/+Z diagonal, so grid lines run diagonally on screen. */
export const ISO_YAW_BASE = Math.PI / 4

export const VIEW_COUNT = 4

/**
 * Distance from target to camera. Irrelevant to scale under an orthographic
 * projection — it only has to be far enough to keep the scene inside the near
 * and far planes.
 */
export const CAM_DISTANCE = 120
export const CAM_NEAR = 0.1
export const CAM_FAR = 400

/** Orthographic frustum height, in world units. Smaller = more zoomed in. */
export const MIN_VIEW_SIZE = 8
/**
 * Hard ceiling on zoom-out, deliberately independent of map size. On maps too
 * large to frame at this height the player pans (or uses the minimap) instead —
 * that bound on the visible tile count is what keeps huge maps affordable to
 * render, so it must never scale with the map.
 */
export const MAX_VIEW_SIZE = 140
export const DEFAULT_VIEW_SIZE = 32 / 1.5

/**
 * The ratio that framed a 128-tile map at MAX_VIEW_SIZE — the tuning the cap
 * was originally sized against. Smaller maps cap proportionally lower so
 * zooming out never shows a sliver of world adrift in the void.
 */
const FRAME_RATIO = MAX_VIEW_SIZE / 128

/** Zoom-out limit for a given map: frame it fully, but never past the ceiling. */
export function maxViewSizeForMap(width: number, depth: number): number {
  return Math.min(
    MAX_VIEW_SIZE,
    Math.max(MIN_VIEW_SIZE, FRAME_RATIO * Math.max(width, depth)),
  )
}

/** Yaw in radians for a view index. The index is unbounded so tweens can wrap. */
export function yawForView(viewIndex: number): number {
  return ISO_YAW_BASE + viewIndex * (Math.PI / 2)
}

/** 0–3, for display and for keying view-dependent art later. */
export function normalizeViewIndex(viewIndex: number): number {
  return ((viewIndex % VIEW_COUNT) + VIEW_COUNT) % VIEW_COUNT
}

/** Camera position offset from its ground target. */
export function cameraOffset(yaw: number): [number, number, number] {
  const cp = Math.cos(ISO_PITCH)
  const sp = Math.sin(ISO_PITCH)
  return [CAM_DISTANCE * Math.sin(yaw) * cp, CAM_DISTANCE * sp, CAM_DISTANCE * Math.cos(yaw) * cp]
}

/**
 * Ground-plane (XZ) unit vectors corresponding to screen right and screen up.
 * `fwd` points away from the camera, which is "up" on screen.
 */
export function screenBasis(yaw: number) {
  return {
    rightX: Math.cos(yaw),
    rightZ: -Math.sin(yaw),
    fwdX: -Math.sin(yaw),
    fwdZ: -Math.cos(yaw),
  }
}

/**
 * Convert a mouse drag in pixels into a change in the camera target, such that
 * the terrain under the cursor stays under the cursor.
 *
 * The two axes carry opposite signs. Moving the target along `right` slides the
 * fixed world left on screen, so a rightward drag needs a negative step. But
 * screen y grows downward while `fwd` points up the screen, and those two
 * inversions cancel — a downward drag needs a positive step along `fwd`.
 *
 * The vertical term is divided by sin(pitch) because ground movement toward or
 * away from the camera is foreshortened by exactly that factor on screen.
 */
export function panDelta(
  yaw: number,
  dxPixels: number,
  dyPixels: number,
  worldPerPixel: number,
): { dx: number; dz: number } {
  const b = screenBasis(yaw)
  const alongRight = dxPixels * worldPerPixel
  const alongFwd = (dyPixels * worldPerPixel) / Math.sin(ISO_PITCH)
  return {
    dx: -alongRight * b.rightX + alongFwd * b.fwdX,
    dz: -alongRight * b.rightZ + alongFwd * b.fwdZ,
  }
}

/**
 * Where a ground-plane offset (dx, dz) at height y lands on screen, in the
 * frustum's world units: x grows right, y grows down. The loading overlay's
 * remembered tiles and the rendered terrain agree through this one projection.
 */
export function projectGround(dx: number, dz: number, y: number, yaw: number): { x: number; y: number } {
  const b = screenBasis(yaw)
  const right = dx * b.rightX + dz * b.rightZ
  const up = (dx * b.fwdX + dz * b.fwdZ) * Math.sin(ISO_PITCH) + y * Math.cos(ISO_PITCH)
  return { x: right, y: -up }
}

/** World units covered by one screen pixel, given the frustum height. */
export function worldPerPixel(viewSize: number, canvasHeightPx: number): number {
  return viewSize / Math.max(1, canvasHeightPx)
}

export function clampViewSize(viewSize: number, maxViewSize: number = MAX_VIEW_SIZE): number {
  return Math.min(maxViewSize, Math.max(MIN_VIEW_SIZE, viewSize))
}

/**
 * The sun. Its yaw is fixed relative to the *camera*, not the world, so the
 * same screen-relative faces of every box stay lit in all four views. The rig
 * repositions it each frame from the camera's tweened yaw, which makes the
 * shading swing smoothly — not snap — while a rotation tween plays.
 *
 * Southeast means screen right and toward the viewer. The elevated source
 * projects below/right at the isometric pitch, independently of actor heading.
 * Sprite bakers use yaw zero with this same source before rotating each pose.
 */
export const LIGHT_RELATIVE_YAW = Math.atan2(32, 48)
export const LIGHT_HORIZONTAL_DISTANCE = Math.hypot(32, 48)
export const LIGHT_HEIGHT = 24

/** Sun position (relative to its target at the origin) for a camera yaw. */
export function lightOffsetForYaw(yaw: number): [number, number, number] {
  const lightYaw = yaw + LIGHT_RELATIVE_YAW
  return [
    LIGHT_HORIZONTAL_DISTANCE * Math.sin(lightYaw),
    LIGHT_HEIGHT,
    LIGHT_HORIZONTAL_DISTANCE * Math.cos(lightYaw),
  ]
}

/**
 * Recover the camera's yaw from its ground-plane forward direction — the
 * inverse of `cameraOffset`, letting the light track the *displayed* camera
 * mid-tween rather than the snapped view index.
 */
export function yawFromForward(fx: number, fz: number): number {
  return Math.atan2(-fx, -fz)
}
