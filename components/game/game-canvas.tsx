"use client"

import { Canvas } from "@react-three/fiber"

import type { GameMap } from "@/lib/game/map/types"
import { CAM_FAR, CAM_NEAR } from "@/lib/game/render/iso"

import { Buildings } from "./buildings"
import { CameraRig } from "./camera-rig"
import { DebugHandle } from "./debug-handle"
import { TerrainTiles } from "./terrain-tiles"
import { TileCursor } from "./tile-cursor"
import { Trees } from "./trees"

const BACKGROUND = "#14100a"

export function GameCanvas({ map, treeDensity }: { map: GameMap; treeDensity?: number }) {
  // Half-extent of the shadow camera. Must cover the whole map plus a margin,
  // whatever size the map is.
  const shadowExtent = Math.max(map.width, map.depth) * 0.75 + 6

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
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={1}
        shadow-camera-far={360}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
      />

      <TerrainTiles map={map} />
      <Trees map={map} density={treeDensity} />
      <Buildings map={map} />
      <TileCursor map={map} />

      <CameraRig map={map} />
      <DebugHandle map={map} />
    </Canvas>
  )
}
