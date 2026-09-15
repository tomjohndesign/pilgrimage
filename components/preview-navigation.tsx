"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { wheelZoomFactor } from "@/lib/game/render/camera-input"
import { cameraOffset, yawForView } from "@/lib/game/render/iso"

type Framing = { height: number; view?: number; yaw?: number; target?: [number, number, number]; resetKey?: unknown }
/** One camera for scene previews: preserve user framing through sidebar resizing and rotation. */
export function PreviewNavigation({ height, view = 0, yaw = yawForView(view), target = [0, 0, 0], resetKey }: Framing) {
  const { camera, gl, size, invalidate } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  const framing = useRef<{ height: number; viewportHeight: number; resetKey: unknown } | null>(null)
  const focus = useRef(new THREE.Vector3())
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera) || !size.width || !size.height) return
    const previous = framing.current, reset = !previous || previous.resetKey !== resetKey
    if (reset) { focus.current.set(...target); camera.zoom = 1 }
    else {
      // The initial fit may change with viewport aspect; preserve actual pixels per world unit.
      const pixelsPerUnit = previous.viewportHeight / previous.height * camera.zoom
      camera.zoom = pixelsPerUnit * height / size.height
      if (controls.current) focus.current.copy(controls.current.target)
    }
    camera.left = -height * size.width / size.height / 2; camera.right = -camera.left
    camera.top = height / 2; camera.bottom = -camera.top
    camera.position.copy(focus.current).add(new THREE.Vector3(...cameraOffset(yaw))); camera.lookAt(focus.current)
    camera.updateProjectionMatrix(); camera.updateMatrixWorld()
    if (controls.current) { controls.current.target.copy(focus.current); controls.current.update() }
    framing.current = { height, viewportHeight: size.height, resetKey }
    invalidate()
  }, [camera, size.width, size.height, height, yaw, resetKey, target[0], target[1], target[2], invalidate])

  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return
    const canvas = gl.domElement, control = new OrbitControls(camera, canvas)
    control.enableRotate = false; control.screenSpacePanning = false
    control.mouseButtons.LEFT = THREE.MOUSE.PAN; control.mouseButtons.RIGHT = THREE.MOUSE.PAN
    control.touches.ONE = THREE.TOUCH.PAN; control.touches.TWO = THREE.TOUCH.DOLLY_PAN
    control.target.copy(focus.current); controls.current = control; control.update()
    // Bounds use world size, independent of the initial fit and sidebar width.
    const limits = () => { const extent = camera.top - camera.bottom; control.minZoom = extent / 140; control.maxZoom = extent / .5 }
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation(); limits()
      camera.zoom = THREE.MathUtils.clamp(camera.zoom / wheelZoomFactor(event.deltaY, event.deltaMode), control.minZoom, control.maxZoom)
      camera.updateProjectionMatrix(); invalidate()
    }
    let startX = 0, startY = 0, moved = false
    const start = (event: PointerEvent) => { startX = event.clientX; startY = event.clientY; moved = false; limits() }
    const move = (event: PointerEvent) => { if (event.buttons && Math.hypot(event.clientX - startX, event.clientY - startY) > 6) moved = true }
    const click = (event: MouseEvent) => { if (moved) { event.preventDefault(); event.stopPropagation() } }
    canvas.addEventListener("pointerdown", start, true); canvas.addEventListener("pointermove", move, true); canvas.addEventListener("click", click, true)
    control.addEventListener("change", () => invalidate())
    canvas.addEventListener("wheel", wheel, { passive: false, capture: true })
    return () => {
      control.dispose(); controls.current = null; canvas.removeEventListener("wheel", wheel, true)
      canvas.removeEventListener("pointerdown", start, true); canvas.removeEventListener("pointermove", move, true); canvas.removeEventListener("click", click, true)
    }
  }, [camera, gl, invalidate])
  return null
}
