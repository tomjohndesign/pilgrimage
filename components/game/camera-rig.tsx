"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

import { groundHeight } from "@/lib/game/map/elevation"
import { surfaceHeight, ropeHeightAt } from "@/lib/game/map/bridges"
import { CameraGesture } from "@/lib/game/camera-gesture"
import { useBuildStore } from "@/lib/game/build-store"
import { useCameraStore } from "@/lib/game/camera-store"
import { worldToTileX, worldToTileZ, type GameMap, type TilePos } from "@/lib/game/map/types"
import {
  CAM_FAR,
  CAM_NEAR,
  cameraOffset,
  panDelta,
  screenBasis,
  worldPerPixel,
  yawForView,
} from "@/lib/game/render/iso"

/** How fast the yaw and zoom tweens converge. Higher = snappier. */
const TWEEN_LAMBDA = 9

/** Keyboard pan speed, in world units per second at the default zoom. */
const KEY_PAN_SPEED = 18

export function CameraRig({ map, onPlace }: { map: GameMap; onPlace?: (at: TilePos) => void }) {
  const placeRef = useRef(onPlace)
  placeRef.current = onPlace
  const { camera, gl, size } = useThree()

  const displayYaw = useRef(yawForView(useCameraStore.getState().viewIndex))
  const displayViewSize = useRef(useCameraStore.getState().viewSize)
  const heldKeys = useRef(new Set<string>())

  const minPickY = useMemo(() => (map.water?.surface?.reduce((a, b) => Math.min(a, b), 0) ?? 0) - 0.5, [map.water])
  const pickPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -4.3))
  const raycaster = useRef(new THREE.Raycaster())
  const hitPoint = useRef(new THREE.Vector3())
  const ndc = useRef(new THREE.Vector2())

  // --- Pointer: drag to pan, move to hover ------------------------------------
  useEffect(() => {
    const canvas = gl.domElement
    const { pan, setHovered } = useCameraStore.getState()

    const gesture = new CameraGesture()
    const point = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY })
    const previousTouchAction = canvas.style.touchAction
    canvas.style.touchAction = "none"

    const updateHover = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      ndc.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.current.setFromCamera(ndc.current, camera)
      const ray = raycaster.current.ray
      const hit = ray.intersectPlane(pickPlane.current, hitPoint.current)
      if (!hit) { setHovered(null); return }
      const start = hit.clone()
      const minY = minPickY
      const clearance = (p: THREE.Vector3) => {
        const x = p.x + map.width / 2 - 0.5, z = p.z + map.depth / 2 - 0.5
        const tx = Math.floor(x + 0.5), tz = Math.floor(z + 0.5)
        if (tx < 0 || tz < 0 || tx >= map.width || tz >= map.depth) return Infinity
        const y = ropeHeightAt(map, x, z) ?? surfaceHeight(map, tx, tz)
        const ground = groundHeight(map, tx, tz)
        return p.y - (Math.abs(y - ground) > 0.001 ? y : groundHeight(map, x, z))
      }
      for (let distance = 0; start.y + ray.direction.y * distance >= minY; distance += 0.15) {
        hit.copy(start).addScaledVector(ray.direction, distance)
        if (clearance(hit) > 0) continue
        let lo = Math.max(0, distance - 0.15), hi = distance
        for (let k = 0; k < 10; k++) {
          const mid = (lo + hi) / 2
          hit.copy(start).addScaledVector(ray.direction, mid)
          if (clearance(hit) > 0) lo = mid; else hi = mid
        }
        hit.copy(start).addScaledVector(ray.direction, hi)
        setHovered({ x: worldToTileX(map, hit.x), z: worldToTileZ(map, hit.z) })
        return
      }
      setHovered(null)
    }

    const onPointerDown = (event: PointerEvent) => {
      gesture.start(event.pointerId, point(event))
      canvas.setPointerCapture(event.pointerId)
      if (gesture.pinching) setHovered(null)
    }

    const onPointerMove = (event: PointerEvent) => {
      const movement = gesture.move(event.pointerId, point(event))
      if (!movement) {
        if (event.pointerType !== "touch") updateHover(event)
        return
      }
      if (gesture.dragged) {
        canvas.style.cursor = "grabbing"
        const rect = canvas.getBoundingClientRect()
        const oldScale = worldPerPixel(displayViewSize.current, rect.height)
        if (gesture.pinching) {
          // Touch follows the fingers directly, including during a wheel tween.
          useCameraStore.setState({ viewSize: displayViewSize.current })
          useCameraStore.getState().zoomBy(movement.zoom)
          displayViewSize.current = useCameraStore.getState().viewSize
        }
        const newScale = worldPerPixel(displayViewSize.current, rect.height)
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
        // Preserve the ground point under the moving pinch midpoint, even when
        // zoom reaches its limits. A one-finger drag is the same transform.
        const dx = (movement.after.x - cx) * newScale - (movement.before.x - cx) * oldScale
        const dy = (movement.after.y - cy) * newScale - (movement.before.y - cy) * oldScale
        const delta = panDelta(displayYaw.current, dx, dy, 1)
        pan(delta.dx, delta.dz)
        event.stopPropagation()
        setHovered(null)
      } else updateHover(event)
    }

    const endDrag = (event: PointerEvent) => {
      if (!gesture.has(event.pointerId)) return
      const tap = gesture.end(event.pointerId, point(event), event.type !== "pointerup")
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      canvas.style.cursor = gesture.active ? "grabbing" : "grab"
      if (tap && event.button === 0) {
        updateHover(event)
        const tile = useCameraStore.getState().hovered
        if (tile) placeRef.current?.(tile)
      } else if (!gesture.active && event.pointerType !== "touch" && event.type === "pointerup") {
        updateHover(event)
      } else setHovered(null)
    }

    // Fiber's click distance alone cannot distinguish a pinch from a tap.
    const onClick = (event: MouseEvent) => {
      if (gesture.dragged) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    const onBlur = () => {
      gesture.clear()
      setHovered(null)
      canvas.style.cursor = "grab"
    }
    const onPointerLeave = () => {
      if (!gesture.active) setHovered(null)
    }

    // Suppress the context menu so right-drag panning stays available later.
    const onContextMenu = (event: Event) => event.preventDefault()

    canvas.style.cursor = "grab"
    canvas.addEventListener("pointerdown", onPointerDown, true)
    canvas.addEventListener("click", onClick, true)
    canvas.addEventListener("lostpointercapture", endDrag)
    window.addEventListener("blur", onBlur)
    canvas.addEventListener("pointermove", onPointerMove, true)
    canvas.addEventListener("pointerup", endDrag)
    canvas.addEventListener("pointercancel", endDrag)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("contextmenu", onContextMenu)

    return () => {
      canvas.style.touchAction = previousTouchAction
      canvas.removeEventListener("pointerdown", onPointerDown, true)
      canvas.removeEventListener("click", onClick, true)
      canvas.removeEventListener("lostpointercapture", endDrag)
      window.removeEventListener("blur", onBlur)
      canvas.removeEventListener("pointermove", onPointerMove, true)
      canvas.removeEventListener("pointerup", endDrag)
      canvas.removeEventListener("pointercancel", endDrag)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("contextmenu", onContextMenu)
    }
  }, [camera, gl, map, minPickY])

  // --- Wheel: zoom ------------------------------------------------------------
  useEffect(() => {
    const canvas = gl.domElement
    const { zoomBy } = useCameraStore.getState()

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      // Zoom owns wheel input. Fiber otherwise raycasts every clickable tree
      // and figure for each wheel event, although none handles scrolling.
      event.stopPropagation()
      // Normalise line-mode deltas so a mouse wheel and a trackpad feel similar.
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      zoomBy(Math.exp(delta * 0.0015))
    }

    canvas.addEventListener("wheel", onWheel, { passive: false, capture: true })
    return () => canvas.removeEventListener("wheel", onWheel, true)
  }, [gl])

  // --- Keyboard: pan, rotate, zoom, reset -------------------------------------
  useEffect(() => {
    const { rotate, zoomBy, reset, cycleOutlineMode } = useCameraStore.getState()

    const onKeyDown = (event: KeyboardEvent) => {
      if (useCameraStore.getState().inputLocked) return
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || target?.closest("input, textarea, select, [contenteditable=true]")) return
      const key = event.key.toLowerCase()
      const build = useBuildStore.getState()
      if (!event.ctrlKey && !event.altKey && build.tool && key === "r") {
        event.preventDefault()
        if (!event.repeat) build.rotateBuilding(event.metaKey ? -1 : 1)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      heldKeys.current.add(key)

      // Rotation and zoom fire once per press, not on auto-repeat.
      if (event.repeat) return
      switch (key) {
        case "escape":
          useBuildStore.getState().setTool(null)
          break
        case "q":
        case ",":
          rotate(-1)
          break
        case "e":
        case ".":
          rotate(1)
          break
        case "=":
        case "+":
          zoomBy(1 / 1.25)
          break
        case "-":
        case "_":
          zoomBy(1.25)
          break
        case "0":
          reset()
          break
        case "o":
          cycleOutlineMode()
          break
      }
    }

    const onKeyUp = (event: KeyboardEvent) => heldKeys.current.delete(event.key.toLowerCase())
    const onBlur = () => heldKeys.current.clear()

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    // Opening the cheat bar while holding WASD must stop the existing pan.
    window.addEventListener("focusin", onBlur)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("focusin", onBlur)
    }
  }, [])

  // Update the display pose before lighting, animation, and the pixel render pass.
  // These canvases use a manual camera because this rig owns the frustum.
  // --- Per-frame: tween and drive the camera ----------------------------------
  useFrame((_, delta) => {
    const { viewIndex, viewSize, pan, inputLocked } = useCameraStore.getState()
    if (inputLocked) {
      heldKeys.current.clear()
      displayYaw.current = yawForView(viewIndex)
      displayViewSize.current = viewSize
    }
    // A background tab can hand us a huge delta; clamp so tweens don't overshoot.
    const dt = Math.min(delta, 0.1)

    displayYaw.current = THREE.MathUtils.damp(
      displayYaw.current,
      yawForView(viewIndex),
      TWEEN_LAMBDA,
      dt,
    )
    displayViewSize.current = THREE.MathUtils.damp(
      displayViewSize.current,
      viewSize,
      TWEEN_LAMBDA,
      dt,
    )

    // Keyboard panning is screen-relative, so it follows the current rotation.
    const keys = heldKeys.current
    const up = keys.has("w") || keys.has("arrowup")
    const down = keys.has("s") || keys.has("arrowdown")
    const left = keys.has("a") || keys.has("arrowleft")
    const right = keys.has("d") || keys.has("arrowright")
    if (up || down || left || right) {
      const basis = screenBasis(displayYaw.current)
      // Scale with zoom so panning feels the same at every zoom level.
      const speed = KEY_PAN_SPEED * (displayViewSize.current / 26) * dt
      const forward = (up ? 1 : 0) - (down ? 1 : 0)
      const strafe = (right ? 1 : 0) - (left ? 1 : 0)
      pan(
        basis.fwdX * forward * speed + basis.rightX * strafe * speed,
        basis.fwdZ * forward * speed + basis.rightZ * strafe * speed,
      )
    }

    const cam = camera as THREE.OrthographicCamera
    const halfHeight = displayViewSize.current / 2
    const aspect = size.width / Math.max(1, size.height)
    cam.left = -halfHeight * aspect
    cam.right = halfHeight * aspect
    cam.top = halfHeight
    cam.bottom = -halfHeight
    cam.near = CAM_NEAR
    cam.far = CAM_FAR

    const [ox, oy, oz] = cameraOffset(displayYaw.current)
    const { targetX, targetZ } = useCameraStore.getState()
    cam.position.set(targetX + ox, oy, targetZ + oz)
    cam.lookAt(targetX, 0, targetZ)
    cam.updateProjectionMatrix()
    // Culling, sprite poses, and their batch view anchors must all observe the
    // same transform that the final world and character passes will render.
    cam.updateMatrixWorld()
  }, -4)

  return null
}
