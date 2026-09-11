"use client"

import { Suspense, useEffect, useMemo, useRef } from "react"
import { useThree, type ThreeEvent } from "@react-three/fiber"
import * as THREE from "three"
import { PixelCanvas } from "@/components/pixel-canvas"
import { TerrainTiles } from "@/components/game/terrain-tiles"
import { Buildings } from "@/components/game/buildings"
import { Shrine } from "@/components/game/shrine"
import { TileCursor } from "@/components/game/tile-cursor"
import { BuildInfluenceOverlay } from "@/components/game/build-influence-overlay"
import { OutlinePass } from "@/components/game/outline-pass"
import { SURFACE_LIGHT } from "@/lib/game/render/lighting"
import { CAM_FAR, CAM_NEAR, cameraOffset, lightOffsetForYaw, yawForView } from "@/lib/game/render/iso"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import { marchToGround } from "@/lib/game/map/ground-pick"
import { useCameraStore } from "@/lib/game/camera-store"
import type { GameBalance } from "@/lib/game/balance"
import type { Resources } from "@/lib/game/settlement"
import type { Relic } from "@/lib/game/relic"
import { worldToTileX, worldToTileZ, type GameMap, type TilePos } from "@/lib/game/map/types"

/** The whole study fits the viewport from any of the game's four isometric views. */
function LabCamera({ view, extent }: { view: number; extent: number }) {
  const { camera, size, invalidate } = useThree()
  useEffect(() => {
    camera.position.set(...cameraOffset(yawForView(view)))
    camera.position.y += TILE_HEIGHT
    camera.lookAt(0, TILE_HEIGHT, 0)
    if (camera instanceof THREE.OrthographicCamera) camera.zoom = Math.min(size.width / (extent * 1.5), size.height / (extent * 0.85))
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    invalidate()
  }, [camera, size, view, extent, invalidate])
  return null
}

/**
 * Hover and click land on the tile under the true terrain surface, using the
 * game's own ray march, so slopes and levelled pads pick where they are drawn.
 */
function GroundPicker({ map, ceiling, onPlace }: { map: GameMap; ceiling: number; onPlace: (at: TilePos) => void }) {
  const setHovered = useCameraStore(s => s.setHovered)
  const hit = useRef(new THREE.Vector3())
  const pick = (event: ThreeEvent<PointerEvent | MouseEvent>): TilePos | null => {
    const ground = marchToGround(map, event.point.clone(), event.ray.direction, -1, hit.current)
    return ground ? { x: worldToTileX(map, ground.x), z: worldToTileZ(map, ground.z) } : null
  }
  return <mesh position={[0, ceiling, 0]} rotation={[-Math.PI / 2, 0, 0]}
    onPointerMove={event => setHovered(pick(event))}
    onPointerOut={() => setHovered(null)}
    onClick={event => {
      if (event.delta > 6) return
      event.stopPropagation()
      const tile = pick(event)
      if (tile) onPlace(tile)
    }}>
    <planeGeometry args={[map.width + 80, map.depth + 80]} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
  </mesh>
}

/** The playground's live world: game terrain, the founded hovel, purchases so far and the placement ghost. */
export function PlacementScene({ map, relic, balance, buildType, resources, view, grid, onPlace }: {
  map: GameMap; relic: Relic; balance: GameBalance; buildType: string | null; resources: Resources
  view: number; grid: boolean; onPlace: (at: TilePos) => void
}) {
  const ceiling = useMemo(() => TILE_HEIGHT + (map.elevation?.height.reduce((a, b) => Math.max(a, b), 0) ?? 0) + 1, [map.elevation])
  return <PixelCanvas frameloop="demand" orthographic camera={{ near: CAM_NEAR, far: CAM_FAR }} outputDpr={1} fallback={<p>This playground needs WebGL.</p>}>
    <color attach="background" args={["#14100a"]} />
    <LabCamera view={view} extent={Math.max(map.width, map.depth)} />
    <ambientLight intensity={SURFACE_LIGHT.ambient} />
    <hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
    <directionalLight position={lightOffsetForYaw(yawForView(view))} intensity={SURFACE_LIGHT.sun} />
    <Suspense fallback={null}>
      <TerrainTiles map={map} showGrid={grid} />
      <Shrine map={map} relic={relic} />
      <Buildings map={map} />
      <TileCursor map={map} buildType={buildType} resources={resources} shrineRenown={1000} balance={balance} />
      <BuildInfluenceOverlay map={map} buildMode={!!buildType} balance={balance} />
      <GroundPicker map={map} ceiling={ceiling} onPlace={onPlace} />
    </Suspense>
    <OutlinePass objects={{ buildings: map.buildings, travelers: [], monks: [] }} />
  </PixelCanvas>
}
