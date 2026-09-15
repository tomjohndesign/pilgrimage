"use client"

import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { wheelZoomFactor } from "@/lib/game/render/camera-input"

/** Game wheel sensitivity and ground-plane dragging, isolated to this preview. */
export function PreviewNavigation() {
  const { camera, gl, size, invalidate } = useThree()
  useEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return
    const canvas = gl.domElement, controls = new OrbitControls(camera, canvas)
    controls.enableRotate = false; controls.enableZoom = true
    controls.screenSpacePanning = false
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN; controls.mouseButtons.RIGHT = THREE.MOUSE.PAN
    controls.touches.ONE = THREE.TOUCH.PAN; controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
    const direction = camera.getWorldDirection(new THREE.Vector3())
    const distance = Math.abs(direction.y) > .01 ? camera.position.y / -direction.y : 120
    controls.target.copy(camera.position).addScaledVector(direction, distance)
    controls.update()
    const initialZoom = camera.zoom
    controls.minZoom = initialZoom / 4; controls.maxZoom = initialZoom * 12
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation()
      camera.zoom = THREE.MathUtils.clamp(camera.zoom / wheelZoomFactor(event.deltaY, event.deltaMode), initialZoom / 4, initialZoom * 12)
      camera.updateProjectionMatrix(); invalidate()
    }
    let startX = 0, startY = 0, moved = false
    const start = (event: PointerEvent) => { startX = event.clientX; startY = event.clientY; moved = false }
    const move = (event: PointerEvent) => { if (event.buttons && Math.hypot(event.clientX - startX, event.clientY - startY) > 6) moved = true }
    const click = (event: MouseEvent) => { if (moved) { event.preventDefault(); event.stopPropagation() } }
    canvas.addEventListener("pointerdown", start, true); canvas.addEventListener("pointermove", move, true); canvas.addEventListener("click", click, true)
    controls.addEventListener("change", () => invalidate())
    canvas.addEventListener("wheel", wheel, { passive: false, capture: true })
    return () => {
      controls.dispose(); canvas.removeEventListener("wheel", wheel, true)
      canvas.removeEventListener("pointerdown", start, true); canvas.removeEventListener("pointermove", move, true); canvas.removeEventListener("click", click, true)
    }
  }, [camera, gl, size.width, size.height, invalidate])
  return null
}
