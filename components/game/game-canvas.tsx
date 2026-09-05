"use client"

import { Suspense, useMemo } from "react"
import { PixelCanvas, type PixelationProps } from "@/components/pixel-canvas"

import { deriveSeed, SEED_STREAM } from "@/lib/game/rng"
import { growTreePlacements } from "@/lib/game/trees/dimensions"
import { placeTrees } from "@/lib/game/trees/placement"
import { useTreeTuningStore } from "@/lib/game/trees/tree-tuning-store"
import type { GameMap } from "@/lib/game/map/types"
import type { Monk } from "@/lib/game/monks"
import type { Relic } from "@/lib/game/relic"
import type { Traveler } from "@/lib/game/travelers"
import { CAM_FAR, CAM_NEAR } from "@/lib/game/render/iso"

import { Bridges } from "./bridges"
import { Buildings } from "./buildings"
import { CameraLight } from "./camera-light"
import { CameraRig } from "./camera-rig"
import { DebugHandle } from "./debug-handle"
import { Environment } from "./environment"
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
  blasterPastor = false,
  lastMarch = false,
  travelers,
  walkSpeed,
  roadTier,
  relicTraffic,
  roadLook,
  showGrid = false,
  ...pixelation
}: {
  map: GameMap
  relic: Relic
  monks: Monk[]
  blasterPastor?: boolean
  lastMarch?: boolean
  travelers: Traveler[]
  walkSpeed: number
  /** Road development tier — index into ROAD_TIERS. */
  roadTier?: number
  /** How many of the travelers turn aside for the relic; wears its track. */
  relicTraffic?: number
  /** Tunable look of the road surface. */
  roadLook?: RoadLook
  /** Draw the global tile lattice over the ground. Off by default. */
  showGrid?: boolean
} & PixelationProps) {
  const species = useTreeTuningStore((s) => s.species)
  const variance = useTreeTuningStore((s) => s.variance)
  const trees = useMemo(() => growTreePlacements(placeTrees(map, species),
    deriveSeed(map.seed ?? 0, SEED_STREAM.treeShapes), species, variance), [map, species, variance])
  return (
    <PixelCanvas
      {...pixelation}
      orthographic
      camera={{ manual: true, position: [20, 20, 20], near: CAM_NEAR, far: CAM_FAR }}
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
        <TerrainTiles
          map={map}
          roadTier={roadTier}
          traffic={travelers.length}
          relicTraffic={relicTraffic}
          look={roadLook}
          showGrid={showGrid}
        />
      </Suspense>
      <Bridges map={map} roadTier={roadTier} />
      <Trees map={map} placements={trees} ents={lastMarch} />
      <Environment map={map} />
      <Buildings map={map} />
      <Shrine map={map} relic={relic} />
      <Monks map={map} monks={monks} flying={blasterPastor} />
      <Travelers map={map} travelers={travelers} speed={walkSpeed} relic={relic} trees={trees} />
      <TileCursor map={map} />

      <CameraRig map={map} />
      <OutlinePass />
      <DebugHandle map={map} travelers={travelers} speed={walkSpeed} />
    </PixelCanvas>
  )
}
