"use client"

import { Suspense } from "react"
import { Canvas } from "@react-three/fiber"

import { PROTOTYPE_MAP } from "@/lib/game/map/prototype-map"
import { CAM_FAR, CAM_NEAR } from "@/lib/game/render/iso"

import { Buildings } from "./buildings"
import { CameraLight } from "./camera-light"
import { CameraRig } from "./camera-rig"
import { DebugHandle } from "./debug-handle"
import { OutlinePass } from "./outline-pass"
import { TerrainTiles } from "./terrain-tiles"
import { TileCursor } from "./tile-cursor"
import { Trees } from "./trees"

const BACKGROUND = "#14100a"

export function GameCanvas() {
  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [20, 20, 20], near: CAM_NEAR, far: CAM_FAR }}
    >
      <color attach="background" args={[BACKGROUND]} />

      {/*
        No cast shadows — separation between overlapping objects comes from the
        outline pass instead. The directional sun still does the heavy lifting,
        keying the three visible faces of every box to distinct values; it is
        chained to the camera's yaw (see CameraLight) so the dark faces stay on
        the same side of the screen in every view.
      */}
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#bcd0f0", "#3a2a16", 0.45]} />
      <CameraLight />

      {/* The terrain suspends while the dirt texture loads. */}
      <Suspense fallback={null}>
        <TerrainTiles map={PROTOTYPE_MAP} />
      </Suspense>
      <Trees map={PROTOTYPE_MAP} />
      <Buildings map={PROTOTYPE_MAP} />
      <TileCursor map={PROTOTYPE_MAP} />

      <CameraRig />
      <OutlinePass />
      <DebugHandle />
    </Canvas>
  )
}
