"use client"

import { useEffect } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import type * as THREE from "three"

import {
  CAM_FAR,
  CAM_NEAR,
  cameraOffset,
  lightOffsetForYaw,
  yawForView,
} from "@/lib/game/render/iso"

/**
 * A still iso view for galleries and labs: the game's exact camera pitch and
 * lighting rig, frozen at one of the four views, looking at the origin. Scenes
 * are expected to lift themselves so their visual centre sits there.
 */
export function PreviewCanvas({
  zoom,
  view = 0,
  children,
}: {
  /** Pixels per world unit. */
  zoom: number
  /** Which of the four game views to freeze at. */
  view?: number
  children: React.ReactNode
}) {
  const yaw = yawForView(view)
  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: cameraOffset(yaw), zoom, near: CAM_NEAR, far: CAM_FAR }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
    >
      <color attach="background" args={["#14100a"]} />

      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#bcd0f0", "#3a2a16", 0.45]} />
      <directionalLight position={lightOffsetForYaw(yaw)} intensity={2.7} />

      {/* Re-aim when the view changes; the camera prop is only read at mount. */}
      <CameraAim view={view} zoom={zoom} />

      {children}
    </Canvas>
  )
}

function CameraAim({ view, zoom }: { view: number; zoom: number }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  useEffect(() => {
    const [x, y, z] = cameraOffset(yawForView(view))
    camera.position.set(x, y, z)
    camera.lookAt(0, 0, 0)
    camera.zoom = zoom
    camera.updateProjectionMatrix()
  }, [camera, view, zoom])
  return null
}
