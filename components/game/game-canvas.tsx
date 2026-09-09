"use client"

import { DEFAULT_SCENE_VISIBILITY, type SceneVisibility } from "@/lib/game/scene-visibility"
import { SURFACE_LIGHT } from "@/lib/game/render/lighting"

import { useEffect, useMemo, useState } from "react"
import { travelerAppearance } from "@/lib/game/base-person/population"
import { populationVisual } from "@/lib/game/base-person/population-assets"
import { walkSpeedScale } from "@/lib/game/base-person/gait"
import { characterVisual } from "@/lib/game/character-assets"
import { useCharacterAssetStore } from "@/lib/game/character-asset-store"
import { usePopulationStore } from "@/lib/game/base-person/population-store"
import { usePersonDesignStore } from "@/lib/game/base-person/design-store"
import { PixelCanvas, PixelCharacters, PixelWorld, type PixelationProps } from "@/components/pixel-canvas"

import { useCameraStore } from "@/lib/game/camera-store"
import type { Resources } from "@/lib/game/settlement"
import type { TilePos } from "@/lib/game/map/types"
import { deriveSeed, SEED_STREAM } from "@/lib/game/rng"
import { growTreePlacements } from "@/lib/game/trees/dimensions"
import { placeTrees } from "@/lib/game/trees/placement"
import { foliageSpacing } from "@/lib/game/trees/foliage/spacing"
import { DEFAULT_TREE_MODEL, treeModelForGame, type TreeModel } from "@/lib/game/trees/render-model"
import { useTreeTuningStore } from "@/lib/game/trees/tree-tuning-store"
import type { GameMap } from "@/lib/game/map/types"
import type { Monk } from "@/lib/game/monks"
import type { Relic } from "@/lib/game/relic"
import type { Traveler } from "@/lib/game/travelers"
import { LINEAR_MOVEMENT, type MovementTuning, type WalkTuning } from "@/lib/game/motion"
import type { CharacterModel } from "@/lib/game/character-assets"
import { CAM_FAR, CAM_NEAR } from "@/lib/game/render/iso"

import { Bridges } from "./bridges"
import { HearthLights } from "./hearth-lights"
import { BuildingBatches } from "./building-batches"
import { Buildings } from "./buildings"
import { BuildInfluenceOverlay } from "./build-influence-overlay"
import { CameraLight } from "./camera-light"
import { CameraRig } from "./camera-rig"
import { PersonPicking } from "./character-selection"
import { DebugHandle } from "./debug-handle"
import { Environment } from "./environment"
import { Monks } from "./monks"
import { OutlinePass } from "./outline-pass"
import { RenownSaturation } from "./renown-saturation"
import { vendorSpeedScale } from "@/lib/game/transport/assets"
import { Shrine } from "./shrine"
import { Signpost } from "./signpost"
import type { RoadLook } from "@/lib/game/map/road"
import { WalkingTerrain } from "./walking-terrain"
import { TileCursor } from "./tile-cursor"
import { CharacterBatches } from "./character-batches"
import { StaticBatches } from "./static-batches"
import { Travelers } from "./travelers"
import { Trees } from "./trees"
import { Wildlife } from "./wildlife"

import { MapRevealState, type MapRevealPhase } from "@/lib/game/render/map-reveal"
import { SceneAssetsContext, SceneAssetBoundary } from "./scene-assets"
import { MapReveal } from "./map-reveal"

import { GAME_BACKGROUND } from "@/lib/game/render/background"

export function GameCanvas({
  map,
  relic,
  monks,
  blasterPastor = false,
  lastMarch = false,
  travelers,
  walkSpeed,
  characterModel = "callings",
  characterScale = 1,
  treeModel: requestedTreeModel = DEFAULT_TREE_MODEL,
  characterFps,
  walkTuning,
  movement = LINEAR_MOVEMENT,
  roadTier,
  relicTraffic,
  roadLook,
  showGrid = false,
  visibility = DEFAULT_SCENE_VISIBILITY,
  buildType,
  shrineRenown,
  baseRenown,
  resources,
  onPlace,
  onLandmarkReady,
  onRevealPhase,
  onRevealProgress,
  ...pixelation
}: {
  map: GameMap
  onLandmarkReady: () => void
  onRevealPhase: (phase: MapRevealPhase) => void
  onRevealProgress: (progress: number, reach: number) => void
  buildType: string | null
  shrineRenown: number
  baseRenown: number
  resources: Resources
  onPlace: (at: TilePos) => void
  relic: Relic
  monks: Monk[]
  blasterPastor?: boolean
  lastMarch?: boolean
  travelers: Traveler[]
  walkSpeed: number
  /** Use the shared base person or the earlier calling-specific sprite sheets. */
  characterModel?: CharacterModel
  /** Uniform size multiplier; leaves the sprite's foot anchor fixed. */
  characterScale?: number
  /** Parametric trees or the baked foliage sprites; sprites stand one to a tile. */
  treeModel?: TreeModel
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
  visibility?: SceneVisibility
} & PixelationProps) {
  const reveal = useMemo(() => new MapRevealState(), [map.road])
  const [revealStatus, setRevealStatus] = useState<{ state: MapRevealState; phase: MapRevealPhase } | null>(null)
  const phase = revealStatus?.state === reveal ? revealStatus.phase : "loading"
  const selection = useCameraStore(s => s.selection)
  useEffect(() => {
    if (!selection) return
    const hidden = selection.kind === "tree" ? !visibility.showTrees
      : selection.kind === "traveler" || selection.kind === "monk" ? !visibility.showCharacters
        : selection.kind === "animal" ? !visibility.showWildlife
          : visibility.buildingVisibility === "hidden"
    if (hidden) useCameraStore.getState().select(null)
  }, [selection, visibility.showTrees, visibility.showCharacters, visibility.showWildlife, visibility.buildingVisibility])
  const population = usePopulationStore(s => s.pack)
  const assets = useCharacterAssetStore(s => s.assets)
  const speedScales = useMemo(() => new Map(travelers.map(traveler => {
    const appearance = travelerAppearance(map.seed ?? 0, traveler.id)
    const visual = characterModel === "base" || traveler.type.id === "beggar" ? populationVisual(traveler.type.id, appearance.variant, population, traveler.attributes.age)
      : characterVisual(assets[traveler.type.id], "callings")
    const scale = characterScale * (characterModel === "base" ? appearance.scale : 1)
    const personSpeedScale = walkSpeedScale(visual.walkStride, scale)
    return [traveler.id, traveler.type.id === "vendor" ? vendorSpeedScale(traveler.id, scale, personSpeedScale) : personSpeedScale]
  })), [travelers, map.seed, characterModel, characterScale, population, assets])
  const foundation = usePersonDesignStore(s => s.design)
  useEffect(() => { void usePersonDesignStore.getState().hydrate() }, [])
  useEffect(() => { void usePopulationStore.getState().prepare(foundation) }, [foundation])
  const species = useTreeTuningStore((s) => s.species)
  const variance = useTreeTuningStore((s) => s.variance)
  const treeModel = treeModelForGame(requestedTreeModel)
  const trees = useMemo(() => growTreePlacements(placeTrees(map, treeModel === "sprites" ? foliageSpacing(species) : species),
    deriveSeed(map.seed ?? 0, SEED_STREAM.treeShapes), species, variance), [map.tiles, species, variance, treeModel])
  return (
    <div className="relative h-full w-full" data-map-reveal={phase}>
    <SceneAssetsContext.Provider value={reveal}>
    <PixelCanvas
      {...pixelation}
      orthographic
      onPointerMissed={(event) => {
        if (event.button === 0) useCameraStore.getState().select(null)
      }}
      camera={{ manual: true, position: [20, 20, 20], near: CAM_NEAR, far: CAM_FAR }}
    >
      <color attach="background" args={[GAME_BACKGROUND]} />

      {/*
        No cast shadows — separation between overlapping objects comes from the
        outline pass instead. The directional sun still does the heavy lifting,
        keying the three visible faces of every box to distinct values; it is
        chained to the camera's yaw (see CameraLight) so the dark faces stay on
        the same side of the screen in every view.
      */}
      <ambientLight intensity={SURFACE_LIGHT.ambient} />
      <hemisphereLight args={[SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere]} />
      <CameraLight />

      <HearthLights><RenownSaturation map={map}>
      <group name="map-reveal-church" userData={{ mapRevealLandmark: true }} visible={visibility.buildingVisibility !== "hidden"}>
        <Shrine map={map} relic={relic} showInteriors={visibility.buildingVisibility === "interiors"} />
      </group>
      <SceneAssetBoundary>
        <PixelWorld>
          <StaticBatches />
          <WalkingTerrain map={map} trees={trees} roadTier={roadTier} traffic={travelers.length}
            relicTraffic={relicTraffic} look={roadLook} showGrid={showGrid} />
          <Bridges map={map} roadTier={roadTier} />
          {/* Keep simulation components mounted when their visual layer is hidden. */}
          <group name="visibility-trees" visible={visibility.showTrees}>
            <Trees map={map} placements={trees} ents={lastMarch} characterScale={characterScale} model={treeModel} />
          </group>
          <group name="visibility-scenery" visible={visibility.showScenery}>
            <Environment map={map} />
            <Signpost map={map} />
          </group>
        </PixelWorld>
        <group name="visibility-wildlife" visible={visibility.showWildlife}>
          <Wildlife map={map} trees={trees} characterScale={characterScale} />
        </group>
        <group name="visibility-buildings" visible={visibility.buildingVisibility !== "hidden"}>
          <BuildingBatches>
            <Buildings map={map} characterScale={characterScale} showInteriors={visibility.buildingVisibility === "interiors"} />
          </BuildingBatches>
        </group>
        <group name="visibility-characters" visible={visibility.showCharacters}>
          <PixelCharacters>
            <Monks map={map} monks={monks} relic={relic} flying={blasterPastor} characterScale={characterScale} />
          </PixelCharacters>
          <CharacterBatches><Travelers map={map} travelers={travelers} speed={walkSpeed} speedScales={speedScales} relic={relic} trees={trees} shrineRenown={baseRenown}
            characterModel={characterModel} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning} movement={movement} /></CharacterBatches>
        </group>
      </SceneAssetBoundary>
      </RenownSaturation></HearthLights>
      <SceneAssetBoundary>
      <TileCursor map={map} buildType={buildType} resources={resources} shrineRenown={shrineRenown} />
      <BuildInfluenceOverlay map={map} buildMode={!!buildType} />

      </SceneAssetBoundary>
      <CameraRig map={map} onPlace={buildType ? onPlace : undefined} />
      <PersonPicking />
      <OutlinePass objects={{ buildings: map.buildings, travelers, monks }} />
      <DebugHandle characterScale={characterScale} map={map} travelers={travelers} speed={walkSpeed} speedScales={speedScales} movement={movement} />
      <MapReveal map={map} state={reveal} onLandmarkReady={onLandmarkReady} onProgress={onRevealProgress} onPhase={phase => {
        setRevealStatus({ state: reveal, phase }); onRevealPhase(phase)
      }} />
    </PixelCanvas>
    </SceneAssetsContext.Provider>
    {phase !== "complete" && <div className="absolute inset-0 z-10"
      onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} />}
    </div>
  )
}
