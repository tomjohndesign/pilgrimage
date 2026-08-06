"use client"

import { Canvas } from "@react-three/fiber"

import { PROTOTYPE_MAP } from "@/lib/game/map/prototype-map"
import { CAM_FAR, CAM_NEAR } from "@/lib/game/render/iso"

import { Buildings } from "./buildings"
import { CameraRig } from "./camera-rig"
import { DebugHandle } from "./debug-handle"
import { TerrainTiles } from "./terrain-tiles"
import { TileCursor } from "./tile-cursor"
import { Trees } from "./trees"

const BACKGROUND = "#14100a"

/** Half-extent of the shadow camera. Must cover the whole map plus a margin. */
const SHADOW_EXTENT = 30

export function GameCanvas() {
  return (
    <Canvas
      orthographic
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [20, 20, 20], near: CAM_NEAR, far: CAM_FAR }}
    >
      <color attach="background" args={[BACKGROUND]} />

      {/*
        Light stays fixed to the world, so shadows swing as the view rotates.
        Fill is kept low deliberately — the sun has to do most of the work or
        the boxes lose their form and the cast shadows stop reading.
      */}
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#bcd0f0", "#3a2a16", 0.45]} />
      <directionalLight
        position={[26, 40, 18]}
        intensity={2.7}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
      />

      <TerrainTiles map={PROTOTYPE_MAP} />
      <Trees map={PROTOTYPE_MAP} />
      <Buildings map={PROTOTYPE_MAP} />
      <TileCursor map={PROTOTYPE_MAP} />

      <CameraRig />
      <DebugHandle />
    </Canvas>
  )
}
