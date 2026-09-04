"use client"

import { Suspense } from "react"
import { Canvas } from "@react-three/fiber"

import { parseAsciiMap } from "@/lib/game/map/prototype-map"
import {
  CAM_FAR,
  CAM_NEAR,
  cameraOffset,
  lightOffsetForYaw,
  yawForView,
} from "@/lib/game/render/iso"
import type { TextureEntry } from "@/lib/game/render/textures"

import { TerrainTiles } from "./game/terrain-tiles"

/**
 * A slice of world for the map-edge preview: grass, a road, a patch of bare
 * earth — enough terrain variety to show the dirt cliff under a real map top.
 */
const MAP_EDGE_MAP = parseAsciiMap([
  "......",
  "......",
  "======",
  "..,,..",
  "..,,..",
  "......",
])

const PREVIEW_YAW = yawForView(0)

/**
 * How each `TexturePreviewKind` looks in game. Rendered with the same
 * components, lights, and camera maths as /play — this is the item itself,
 * not an approximation. Scenes are lifted so their visual centre sits at the
 * origin the iso camera studies.
 */
function PreviewScene({ kind }: { kind: TextureEntry["preview"] }) {
  switch (kind) {
    case "map-edge":
      return (
        <group position={[0, 1.4, 0]}>
          <Suspense fallback={null}>
            <TerrainTiles map={MAP_EDGE_MAP} />
          </Suspense>
        </group>
      )
  }
}

export function TexturePreview({ entry }: { entry: TextureEntry }) {
  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{
        position: cameraOffset(PREVIEW_YAW),
        zoom: 34,
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

      <PreviewScene kind={entry.preview} />
    </Canvas>
  )
}
