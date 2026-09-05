"use client"

import { Suspense, useEffect, useMemo } from "react"
import { Canvas } from "@react-three/fiber"

import { CameraLight } from "@/components/game/camera-light"
import { CameraRig } from "@/components/game/camera-rig"
import { OutlinePass } from "@/components/game/outline-pass"
import { TerrainTiles } from "@/components/game/terrain-tiles"
import { Trees } from "@/components/game/trees"
import { useCameraStore } from "@/lib/game/camera-store"
import { generateMap } from "@/lib/game/map/generate-map"
import { CAM_FAR, CAM_NEAR } from "@/lib/game/render/iso"

/**
 * The game's terrain and trees on a generated map, with the game's own camera
 * rig, lights and outline pass — but none of the simulation (no relic, monks
 * or travelers), so species tuning can be judged against the forest as a whole
 * without the lab depending on world state. Same controls as /play: drag to
 * pan, scroll to zoom, Q/E to rotate, O to cycle outlines.
 */
export function TreeMapPreview({ seed, size }: { seed: number; size: number }) {
  const map = useMemo(() => generateMap({ seed, width: size, depth: size }), [seed, size])

  useEffect(() => {
    const store = useCameraStore.getState()
    store.setMapSize(map.width, map.depth)
    store.reset()
  }, [map])

  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [20, 20, 20], near: CAM_NEAR, far: CAM_FAR }}
    >
      <color attach="background" args={["#14100a"]} />
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#bcd0f0", "#3a2a16", 0.45]} />
      <CameraLight />

      <Suspense fallback={null}>
        <TerrainTiles map={map} />
      </Suspense>
      <Trees map={map} />

      <CameraRig map={map} />
      <OutlinePass />
    </Canvas>
  )
}
