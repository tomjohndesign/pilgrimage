"use client"

import { PreviewNavigation } from "@/components/preview-navigation"

import { TERRAIN } from "@/lib/game/map/terrain"

import { SURFACE_LIGHT } from "@/lib/game/render/lighting"

import { useThree } from "@react-three/fiber"

import { PixelCanvas, type PixelationProps } from "@/components/pixel-canvas"

import {
  CAM_FAR,
  CAM_NEAR,
  cameraOffset,
  lightOffsetForYaw,
  yawForView,
} from "@/lib/game/render/iso"

/**
 * An interactive iso view for galleries and labs: the game's exact camera pitch and
 * lighting rig, frozen at one of the four views, looking at the origin. Scenes
 * are expected to lift themselves so their visual centre sits there.
 */
export function PreviewCanvas({
  zoom,
  view = 0,
  children,
  ...pixelation
}: {
  /** Pixels per world unit. */
  zoom: number
  /** Which of the four game views to freeze at. */
  view?: number
  children: React.ReactNode
} & PixelationProps) {
  const yaw = yawForView(view)
  return (
    <PixelCanvas
      {...pixelation}
      orthographic
      camera={{ manual: true, position: cameraOffset(yaw), zoom, near: CAM_NEAR, far: CAM_FAR }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
    >
      <color attach="background" args={[TERRAIN.grass.color]} />

      <ambientLight intensity={SURFACE_LIGHT.ambient} />
      <hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
      <directionalLight position={lightOffsetForYaw(yaw)} intensity={SURFACE_LIGHT.sun} />

      {/* Re-aim when the view changes; the camera prop is only read at mount. */}
      <CameraAim view={view} zoom={zoom} />

      {children}
    </PixelCanvas>
  )
}

function CameraAim({ view, zoom }: { view: number; zoom: number }) {
  const size = useThree(s => s.size)
  return <PreviewNavigation view={view} height={Math.max(1, size.height) / zoom} />
}
