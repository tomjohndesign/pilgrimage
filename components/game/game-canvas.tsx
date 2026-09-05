"use client"

import { useEffect } from "react"
import { usePersonDesignStore } from "@/lib/game/base-person/design-store"
import { Canvas } from "@react-three/fiber"

import type { GameMap } from "@/lib/game/map/types"
import type { Monk } from "@/lib/game/monks"
import type { Relic } from "@/lib/game/relic"
import type { Traveler } from "@/lib/game/travelers"
import { LINEAR_MOVEMENT, type MovementTuning, type WalkTuning } from "@/lib/game/motion"
import type { CharacterModel } from "@/lib/game/character-assets"
import { CAM_FAR, CAM_NEAR } from "@/lib/game/render/iso"

import { Bridges } from "./bridges"
import { Buildings } from "./buildings"
import { CameraLight } from "./camera-light"
import { CameraRig } from "./camera-rig"
import { DebugHandle } from "./debug-handle"
import { Monks } from "./monks"
import { OutlinePass } from "./outline-pass"
import { Shrine } from "./shrine"
import type { RoadLook } from "@/lib/game/map/road"
import { TerrainTiles } from "./terrain-tiles"
import { TileCursor } from "./tile-cursor"
import { Travelers } from "./travelers"
import { Trees } from "./trees"

const BACKGROUND = "#14100a"

export function GameCanvas({
  map,
  relic,
  monks,
  travelers,
  walkSpeed,
  characterModel = "callings",
  characterScale = 1,
  characterFps,
  walkTuning,
  movement = LINEAR_MOVEMENT,
  roadTier,
  relicTraffic,
  roadLook,
  showGrid = false,
}: {
  map: GameMap
  relic: Relic
  monks: Monk[]
  travelers: Traveler[]
  walkSpeed: number
  /** Use the shared base person or the earlier calling-specific sprite sheets. */
  characterModel?: CharacterModel
  /** Uniform size multiplier; leaves the sprite's foot anchor fixed. */
  characterScale?: number
  /** Animation frames per second, independent of movement pace. */
  characterFps?: number
  walkTuning?: WalkTuning
  movement?: MovementTuning
  /** Road development tier — index into ROAD_TIERS. */
  roadTier?: number
  /** How many of the travelers turn aside for the relic; wears its track. */
  relicTraffic?: number
  /** Tunable look of the road surface. */
  roadLook?: RoadLook
  /** Draw the global tile lattice over the ground. Off by default. */
  showGrid?: boolean
}) {
  useEffect(() => { void usePersonDesignStore.getState().hydrate() }, [])
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

      <TerrainTiles
        map={map}
        roadTier={roadTier}
        traffic={travelers.length}
        relicTraffic={relicTraffic}
        look={roadLook}
        showGrid={showGrid}
      />
      <Bridges map={map} roadTier={roadTier} />
      <Trees map={map} />
      <Buildings map={map} />
      <Shrine map={map} relic={relic} />
      <Monks map={map} monks={monks} />
      <Travelers map={map} travelers={travelers} speed={walkSpeed} characterModel={characterModel} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning} movement={movement} />
      <TileCursor map={map} />

      <CameraRig map={map} />
      <OutlinePass />
      <DebugHandle map={map} />
    </Canvas>
  )
}
