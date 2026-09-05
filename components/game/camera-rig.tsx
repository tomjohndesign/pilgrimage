"use client"

import { useEffect, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

import { useCameraStore } from "@/lib/game/camera-store"
import { worldToTileX, worldToTileZ, type GameMap } from "@/lib/game/map/types"
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

/**
 * Height of the plane used for cursor picking. Most tiles top out around 0.2,
 * so picking against that plane keeps the tile cursor aligned with what the
 * player sees. Hills read slightly off until real height-aware picking lands.
 */
const PICK_PLANE_Y = 0.2

export function CameraRig({ map }: { map: GameMap }) {
  const { camera, gl, size } = useThree()

  const displayYaw = useRef(yawForView(useCameraStore.getState().viewIndex))
  const displayViewSize = useRef(useCameraStore.getState().viewSize)
  const heldKeys = useRef(new Set<string>())

  const pickPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -PICK_PLANE_Y))
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

    const updateHover = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      ndc.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.current.setFromCamera(ndc.current, camera)
      const hit = raycaster.current.ray.intersectPlane(pickPlane.current, hitPoint.current)
      if (!hit) {
        setHovered(null)
        return
      }
      const tx = worldToTileX(map, hit.x)
      const tz = worldToTileZ(map, hit.z)
      if (tx < 0 || tz < 0 || tx >= map.width || tz >= map.depth) {
        setHovered(null)
        return
      }
      setHovered({ x: tx, z: tz })
    }

    const onPointerDown = (event: PointerEvent) => {
      if (dragPointerId !== null) return
      dragPointerId = event.pointerId
      lastX = event.clientX
      lastY = event.clientY
      canvas.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId === dragPointerId) {
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
      canvas.releasePointerCapture(event.pointerId)
      dragPointerId = null
      canvas.style.cursor = "grab"
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
  }, [camera, gl, map])

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
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return

      const key = event.key.toLowerCase()
      heldKeys.current.add(key)

      // Rotation and zoom fire once per press, not on auto-repeat.
      if (event.repeat) return
      switch (key) {
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
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
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
