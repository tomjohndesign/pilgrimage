"use client"

import { Suspense } from "react"
import { Canvas } from "@react-three/fiber"

import { parseAsciiMap } from "@/lib/game/map/prototype-map"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import {
  CAM_FAR,
  CAM_NEAR,
  cameraOffset,
  lightOffsetForYaw,
  yawForView,
} from "@/lib/game/render/iso"
import type { TravelerTypeDef } from "@/lib/game/travelers"

import { TerrainTiles } from "./game/terrain-tiles"
import { TravelerFigure } from "./game/traveler-figure"

/** A stretch of road through grass for the figure to stand on. */
const ROAD_MAP = parseAsciiMap([
  ".....",
  ".....",
  "=====",
  ".....",
  ".....",
])

const PREVIEW_YAW = yawForView(0)

/**
 * One calling as it appears in game: the same figure component, lights, and
 * camera maths as /play, standing on a real road tile. The scene is lifted so
 * the figure's middle sits at the origin the iso camera studies. Vendors are
 * shown mid-sale, awning up, since that is when the cart is most recognisable.
 */
export function CharacterPreview({ type }: { type: TravelerTypeDef }) {
  const roadTop = TILE_HEIGHT
  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{
        position: cameraOffset(PREVIEW_YAW),
        zoom: 110,
        near: CAM_NEAR,
        far: CAM_FAR,
      }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
    >
      <color attach="background" args={["#14100a"]} />

      {/* Same lighting rig as the game, frozen at view 0. */}
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#bcd0f0", "#3a2a16", 0.45]} />
      <directionalLight position={lightOffsetForYaw(PREVIEW_YAW)} intensity={2.7} />

      <group position={[0, -roadTop - 0.3, 0]}>
        <Suspense fallback={null}>
          <TerrainTiles map={ROAD_MAP} />
        </Suspense>
        {/* Face east along the road so the vendor's cart trails visibly. */}
        <group position={[0, roadTop, 0]} rotation={[0, Math.PI / 2, 0]}>
          <TravelerFigure type={type} awning={type.id === "vendor"} />
        </group>
      </group>
    </Canvas>
  )
}
