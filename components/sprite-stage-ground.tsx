"use client"
import { Suspense, useEffect, useMemo } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { PixelCanvas } from "./pixel-canvas"
import { TerrainTiles } from "./game/terrain-tiles"
import { cameraOffset, yawForView, lightOffsetForYaw } from "@/lib/game/render/iso"
import { TERRAIN, TILE_HEIGHT } from "@/lib/game/map/terrain"
import type { GameMap } from "@/lib/game/map/types"
import { CHARACTER_PIXEL_SIZE } from "@/lib/game/render/pixel-scale"
import { SURFACE_LIGHT } from "@/lib/game/render/lighting"

function GroundCamera({ pixelsPerUnit, offset }: { pixelsPerUnit: number; offset: [number, number] }) {
  const { camera, size, invalidate } = useThree()
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.left = (-size.width / 2 - offset[0]) / pixelsPerUnit; cam.right = (size.width / 2 - offset[0]) / pixelsPerUnit
    cam.top = (size.height / 2 + offset[1]) / pixelsPerUnit; cam.bottom = (-size.height / 2 + offset[1]) / pixelsPerUnit
    cam.position.set(...cameraOffset(yawForView(0))); cam.position.y += TILE_HEIGHT; cam.lookAt(0, TILE_HEIGHT, 0)
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(); invalidate()
  }, [camera, size, pixelsPerUnit, offset[0], offset[1], invalidate])
  return null
}
/** Game ground under a sprite inspector, using the sprite's existing scale and foot anchor. */
export function SpriteStageGround({ zoom, offset, cellSize = 64, anchor = 48.5, worldSize = 64 * CHARACTER_PIXEL_SIZE }: {
  zoom: number; offset: [number, number]; cellSize?: number; anchor?: number; worldSize?: number
}) {
  const map = useMemo<GameMap>(() => ({ width: 32, depth: 32, seed: 42, buildings: [], tiles: Array(32 * 32).fill("grass") }), [])
  return <div className="chrome-sprite-ground" aria-hidden="true"><PixelCanvas orthographic frameloop="demand" camera={{ manual: true, near: .1, far: 400 }}>
    <color attach="background" args={[TERRAIN.grass.color]} />
    <ambientLight intensity={SURFACE_LIGHT.ambient} /><hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
    <directionalLight intensity={SURFACE_LIGHT.sun} position={lightOffsetForYaw(yawForView(0))} />
    <GroundCamera pixelsPerUnit={cellSize * zoom / worldSize} offset={[offset[0], offset[1] + (anchor - cellSize / 2) * zoom]} />
    <Suspense fallback={null}><TerrainTiles map={map} showGrid vegetation={false} slab={false} /></Suspense>
  </PixelCanvas></div>
}
