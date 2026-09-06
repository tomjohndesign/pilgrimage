"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

import { groundHeight } from "@/lib/game/map/elevation"
import { surfaceHeight, ropeHeightAt } from "@/lib/game/map/bridges"
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

    let dragPointerId: number | null = null
    let lastX = 0
    let lastY = 0
    let startX = 0
    let startY = 0
    let dragged = false

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
      if (dragPointerId !== null) return
      dragPointerId = event.pointerId
      lastX = startX = event.clientX
      lastY = startY = event.clientY
      dragged = false
      canvas.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId === dragPointerId) {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 6) dragged = true
        const dx = event.clientX - lastX
        const dy = event.clientY - lastY
        lastX = event.clientX
        lastY = event.clientY
        if (dx !== 0 || dy !== 0) {
          canvas.style.cursor = "grabbing"
          const scale = worldPerPixel(displayViewSize.current, canvas.clientHeight)
          const delta = panDelta(displayYaw.current, dx, dy, scale)
          pan(delta.dx, delta.dz)
        }
        // Panning moves the world under a stationary cursor, so re-pick.
        updateHover(event)
        return
      }
      updateHover(event)
    }

    const endDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) return
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      dragPointerId = null
      canvas.style.cursor = "grab"
      if (event.type === "pointerup" && event.button === 0 && !dragged && Math.hypot(event.clientX - startX, event.clientY - startY) <= 6) {
        updateHover(event)
        const tile = useCameraStore.getState().hovered
        if (tile) placeRef.current?.(tile)
      }
    }

    const onPointerLeave = () => {
      if (dragPointerId === null) setHovered(null)
    }

    // Suppress the context menu so right-drag panning stays available later.
    const onContextMenu = (event: Event) => event.preventDefault()

    canvas.style.cursor = "grab"
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", endDrag)
    canvas.addEventListener("pointercancel", endDrag)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("contextmenu", onContextMenu)

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
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
      // Normalise line-mode deltas so a mouse wheel and a trackpad feel similar.
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      zoomBy(Math.exp(delta * 0.0015))
    }

    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [gl])

  // --- Keyboard: pan, rotate, zoom, reset -------------------------------------
  useEffect(() => {
    const { rotate, zoomBy, reset, cycleOutlineMode } = useCameraStore.getState()

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || target?.closest("input, textarea, select, [contenteditable=true]")) return
      const key = event.key.toLowerCase()
      const build = useBuildStore.getState()
      if (event.metaKey && !event.ctrlKey && !event.altKey && build.tool && (key === "q" || key === "e")) {
        event.preventDefault()
        if (!event.repeat) build.rotateBuilding(key === "q" ? -1 : 1)
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
    const { targetX, targetZ, viewIndex, viewSize, pan } = useCameraStore.getState()
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
    cam.position.set(targetX + ox, oy, targetZ + oz)
    cam.lookAt(targetX, 0, targetZ)
    cam.updateProjectionMatrix()
  }, -2)

  return null
}
