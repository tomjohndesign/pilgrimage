"use client"

import { DEFAULT_SCENE_VISIBILITY, VISIBILITY_TOGGLES, type SceneVisibility } from "@/lib/game/scene-visibility"
import { DEFAULT_ELEVATION, groundHeight, type ElevationSettings } from "@/lib/game/map/elevation"
import dynamic from "next/dynamic"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { createBenchmarkCity, benchmarkCity as cityFixture } from "@/lib/game/city-benchmark"
import { createFootpaths } from "@/lib/game/footpaths"
import { useBuildStore } from "@/lib/game/build-store"
import { useCameraStore } from "@/lib/game/camera-store"
import { CHARACTER_PIXELS_PER_UNIT } from "@/lib/game/render/pixel-scale"
import { BASE_CHARACTER_SCALE, DEFAULT_WALK_SPEED, DEFAULT_WALK_STRIDE } from "@/lib/game/base-person/gait"
import { BASE_PERSON } from "@/lib/game/base-person/pose"
import { DEFAULT_MOVEMENT } from "@/lib/game/motion"
import type { CharacterModel } from "@/lib/game/character-assets"
import { DEFAULT_TREE_MODEL, type TreeModel } from "@/lib/game/trees/render-model"
import { DEFAULT_ROAD_LOOK, DEFAULT_ROAD_TIER, ROAD_TIERS } from "@/lib/game/map/road"
import { loadSavedSeed } from "@/lib/game/seed-storage"
import { loadDefaultMapSize, saveDefaultMapSize } from "@/lib/game/map-size-storage"
import { generateMonks } from "@/lib/game/monks"
import { tileToWorldX, tileToWorldZ } from "@/lib/game/map/types"
import { generateRelic, visitChance } from "@/lib/game/relic"
import { roadsideEvangelism } from "@/lib/game/monk-evangelism"
import { DEFAULT_TRAFFIC, generateTravelers, travelerCountForMap } from "@/lib/game/travelers"
import {
  DEFAULT_CLEARING_COUNT,
  DEFAULT_DARK_FOREST_COUNT,
  DEFAULT_FOREST_COVERAGE,
  DEFAULT_GLADE_COUNT,
  DEFAULT_MAP_WIDTH,
  DEFAULT_RELIC_DISTANCE,
  DEFAULT_WATER_COVERAGE,
  generateMap,
} from "@/lib/game/map/generate-map"

import { useSettlement } from "@/hooks/use-settlement"
import { previewResidents } from "@/lib/game/jobs/preview"
import { BUILDING_PREVIEW, JOB_PREVIEW } from "@/lib/game/building-preview"

import { GAME_BACKGROUND } from "@/lib/game/render/background"
import { LoadingChurch } from "./loading-church"
import { shrineLayout } from "@/lib/game/shrine-layout"
import { cameraOffset, yawForView } from "@/lib/game/render/iso"
import type { MapRevealPhase } from "@/lib/game/render/map-reveal"
import type { GameMap } from "@/lib/game/map/types"

import { GameHud } from "./game-hud"
import { CheatBar } from "./cheat-bar"
import type { PixelationProps } from "@/components/pixel-canvas"

/**
 * WebGL has no meaningful server render, and three.js touches browser globals on
 * import, so the canvas is client-only. The HUD is plain DOM and renders normally.
 */
const GameCanvas = dynamic(() => import("./game-canvas").then((m) => m.GameCanvas), {
  ssr: false,
  loading: () => null,
})

/** Map tuning knobs, in HUD units (coverage is a percentage for URL cleanliness). */
export interface MapSettings extends SceneVisibility {
  elevation: ElevationSettings
  /** Map edge length in tiles; maps are square. */
  size: number
  /** % of the map left as forest after the glades are carved. */
  coverage: number
  /** Number of open grass glades carved out of the forest. */
  glades: number
  /** Number of small forest-floor clearings scattered through the woods. */
  clearings: number
  /** How many ancient groves grow across the woods. */
  darkForests: number
  /** How far off the road the relic's hovel is sited, in tiles. */
  relicDistance: number
  /** Traffic density, in travelers per 128 × 128 tiles. */
  traffic: number
  /** Walking speed in tiles per second at the reference character size. */
  walkSpeed: number
  characterFps: number
  walkSync: boolean
  stride: number
  paceVariation: number
  pathEase: number
  acceleration: number
  characterModel: CharacterModel
  /** Parametric trees, or the baked pixel foliage sprites from the tree playground. */
  treeModel: TreeModel
  /** Uniform sprite-size multipliers, independently tuned for each model. */
  baseSize: number
  draftSize: number
  /** Road development tier — index into ROAD_TIERS. */
  road: number
  /** Road surface look, 0–1 opacity over the grass. */
  roadOpacity: number
  /** Road surface brightness multiplier. */
  roadShade: number
  /** 0–1 darkness of the line along the road's edge. */
  roadEdgeLine: number
  /** Width of that line in CSS pixels, like the tree and building outlines. */
  roadEdgeWidth: number
  /** Max % of the map under water (rivers, lakes, ponds). */
  water: number
  /** Forced counts for water bodies; −1 lets the seed roll them. */
  rivers: number
  lakes: number
  ponds: number
}

/** Slider value that means "let the seed decide" for water body counts. */
export const WATER_COUNT_AUTO = -1

export const DEFAULT_SETTINGS: MapSettings = {
  ...DEFAULT_SCENE_VISIBILITY,
  elevation: DEFAULT_ELEVATION,
  size: DEFAULT_MAP_WIDTH,
  coverage: Math.round(DEFAULT_FOREST_COVERAGE * 100),
  glades: DEFAULT_GLADE_COUNT,
  clearings: DEFAULT_CLEARING_COUNT,
  darkForests: DEFAULT_DARK_FOREST_COUNT,
  relicDistance: DEFAULT_RELIC_DISTANCE,
  traffic: DEFAULT_TRAFFIC,
  walkSpeed: DEFAULT_WALK_SPEED,
  characterFps: BASE_PERSON.defaultFps,
  walkSync: true,
  stride: DEFAULT_WALK_STRIDE,
  paceVariation: DEFAULT_MOVEMENT.variation,
  pathEase: DEFAULT_MOVEMENT.pathEase,
  acceleration: DEFAULT_MOVEMENT.acceleration,
  characterModel: "base",
  treeModel: DEFAULT_TREE_MODEL,
  baseSize: BASE_CHARACTER_SCALE,
  draftSize: 1,
  road: DEFAULT_ROAD_TIER,
  roadOpacity: DEFAULT_ROAD_LOOK.opacity,
  roadShade: DEFAULT_ROAD_LOOK.shade,
  roadEdgeLine: DEFAULT_ROAD_LOOK.edgeLine,
  roadEdgeWidth: DEFAULT_ROAD_LOOK.edgeWidth,
  water: Math.round(DEFAULT_WATER_COVERAGE * 100),
  rivers: WATER_COUNT_AUTO,
  lakes: WATER_COUNT_AUTO,
  ponds: WATER_COUNT_AUTO,
}

/**
 * Picking a seed is the one legitimate use of Math.random(): it happens outside
 * the simulation, and everything downstream is deterministic in the result.
 */
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

export function GameShell({
  initialSeed,
  initialSettings,
  pixelation,
  benchmarkCity = false,
}: {
  initialSeed?: number
  benchmarkCity?: boolean
  initialSettings?: Partial<MapSettings>
  /** Tune the world pixel renderer without changing map or simulation settings. */
  pixelation?: PixelationProps
}) {
  // With no ?seed= in the URL the seed is chosen client-side in an effect, so
  // the server and client never render from different seeds.
  const [seed, setSeed] = useState<number | null>(initialSeed ?? null)
  const [landmarkRoad, setLandmarkRoad] = useState<GameMap["road"] | null>(null)
  const [revealStatus, setRevealStatus] = useState<{ road: GameMap["road"]; phase: MapRevealPhase } | null>(null)
  const openingViewSize = useCameraStore(s => s.viewSize)
  const loadingOverlay = useRef<HTMLDivElement>(null)
  const [blasterPastor, setBlasterPastor] = useState(false)
  const [lastMarch, setLastMarch] = useState(false)
  const [defaultMapSize, setDefaultMapSize] = useState(DEFAULT_MAP_WIDTH)
  // A bookmarked world is already fully specified. Generate its placement for
  // the page render, so the priority church image faces the right way from the
  // very first paint, before the canvas or browser preferences are available.
  const [mapSizeReady, setMapSizeReady] = useState(initialSettings?.size !== undefined)
  const [mapSizeSaved, setMapSizeSaved] = useState(true)
  const [settings, setSettings] = useState<MapSettings>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  })
  const [pixelationOverrides, setPixelationOverrides] = useState<PixelationProps>({})
  const pixelationSettings = {
    pixelsPerUnit: pixelationOverrides.pixelsPerUnit ?? pixelation?.pixelsPerUnit ?? CHARACTER_PIXELS_PER_UNIT,
    outputDpr: pixelationOverrides.outputDpr ?? pixelation?.outputDpr ?? 1,
    pixelated: pixelationOverrides.pixelated ?? pixelation?.pixelated ?? true,
  }

  useEffect(() => {
    // Resolve the browser preference before generating terrain or writing the URL.
    const size = loadDefaultMapSize()
    setDefaultMapSize(size)
    if (initialSettings?.size === undefined) setSettings(current => ({ ...current, size }))
    setMapSizeReady(true)
  }, [initialSettings?.size])

  useEffect(() => {
    // A seed the player saved takes precedence over a random roll, but never
    // over one named in the URL (that arrives via initialSeed).
    if (seed === null) setSeed(loadSavedSeed() ?? randomSeed())
  }, [seed])

  // Keep seed and tuning in the URL so any map can be bookmarked and revisited.
  useEffect(() => {
    if (seed === null || !mapSizeReady) return
    const query = new URLSearchParams({
      seed: String(seed),
      size: String(settings.size),
      forest: String(settings.coverage),
      glades: String(settings.glades),
      clearings: String(settings.clearings),
      dark: String(settings.darkForests),
      relic: String(settings.relicDistance),
      traffic: String(settings.traffic),
      speed: String(settings.walkSpeed),
      fps: String(settings.characterFps),
      timing: settings.walkSync ? "distance" : "fps",
      stride: String(settings.stride),
      variation: String(settings.paceVariation),
      easing: String(settings.pathEase),
      acceleration: String(settings.acceleration),
      characters: settings.characterModel,
      trees: settings.treeModel,
      baseSize: String(settings.baseSize),
      draftSize: String(settings.draftSize),
      road: String(settings.road),
      opacity: String(settings.roadOpacity),
      shade: String(settings.roadShade),
      edgeline: String(settings.roadEdgeLine),
      edgewidth: String(settings.roadEdgeWidth),
      water: String(settings.water),
      rivers: String(settings.rivers),
      lakes: String(settings.lakes),
      ponds: String(settings.ponds),
    })
    for (const [key] of VISIBILITY_TOGGLES) query.set(key, settings[key] ? "1" : "0")
    query.set("buildingVisibility", settings.buildingVisibility)
    for (const [key, value] of Object.entries(settings.elevation)) query.set(`e_${key}`, String(value))
    if (benchmarkCity) query.set("benchmark", "city")
    window.history.replaceState(null, "", `?${query}`)
  }, [seed, settings, benchmarkCity, mapSizeReady])

  const generatedMap = useMemo(
    () =>
      seed === null || !mapSizeReady
        ? null
        : generateMap({
            seed,
            elevation: settings.elevation,
            width: settings.size,
            depth: settings.size,
            forestCoverage: settings.coverage / 100,
            gladeCount: settings.glades,
            clearingCount: settings.clearings,
            darkForestCount: settings.darkForests,
            relicDistance: settings.relicDistance,
            waterCoverage: settings.water / 100,
            riverCount: settings.rivers >= 0 ? settings.rivers : undefined,
            lakeCount: settings.lakes >= 0 ? settings.lakes : undefined,
            pondCount: settings.ponds >= 0 ? settings.ponds : undefined,
          }),
    [
      seed,
      mapSizeReady,
      settings.elevation,
      settings.size,
      settings.coverage,
      settings.glades,
      settings.clearings,
      settings.darkForests,
      settings.relicDistance,
      settings.water,
      settings.rivers,
      settings.lakes,
      settings.ponds,
    ],
  )

  const baseMap = useMemo(() => generatedMap && benchmarkCity ? createBenchmarkCity(generatedMap) : generatedMap, [generatedMap, benchmarkCity])

  const movement = useMemo(() => ({ variation: settings.paceVariation, pathEase: settings.pathEase, acceleration: settings.acceleration }),
    [settings.paceVariation, settings.pathEase, settings.acceleration])
  const walkTuning = useMemo(() => ({ sync: settings.walkSync, stride: settings.stride }), [settings.walkSync, settings.stride])

  // Identities live outside the canvas so the HUD can name whoever is selected.
  const travelerCount = baseMap ? travelerCountForMap(baseMap, settings.traffic) : 0
  const roadTravelers = useMemo(
    () => (seed === null ? [] : generateTravelers(seed, travelerCount)),
    [seed, travelerCount],
  )

  // The relic and the brothers who keep it, fixed per seed like the travelers.
  const relic = useMemo(() => (seed === null ? null : generateRelic(seed)), [seed])
  const roadLook = useMemo(
    () => ({
      opacity: settings.roadOpacity,
      shade: settings.roadShade,
      edgeLine: settings.roadEdgeLine,
      edgeWidth: settings.roadEdgeWidth,
    }),
    [settings.roadOpacity, settings.roadShade, settings.roadEdgeLine, settings.roadEdgeWidth],
  )
  const founders = useMemo(() => (seed === null ? [] : generateMonks(seed)), [seed])
  const joinedMonks = useBuildStore(s => s.joinedMonks)
  const simulation = useBuildStore(s => s.simulation)
  const monks = useMemo(() => [...founders, ...(simulation?.world.road === baseMap?.road ? joinedMonks : [])],
    [founders, joinedMonks, simulation, baseMap?.road])
  const economy = useSettlement(baseMap, monks, relic)
  const footpaths = useMemo(() => createFootpaths(baseMap ?? undefined), [baseMap])
  useEffect(() => { footpaths.paved = ROAD_TIERS[settings.road]?.paved ?? false }, [footpaths, settings.road])
  // Keep one live map for the canvas and HUD readers, including roadside preaching.
  const map = useMemo(() => economy.map ? { ...economy.map, footpaths } : null, [economy.map, footpaths])
  const travelers = useMemo(() => JOB_PREVIEW && map ? [...roadTravelers, ...previewResidents(map).map(resident => resident.traveler)] : roadTravelers,
    [roadTravelers, map])
  const renown = economy.renown
  const [evangelism, setEvangelism] = useState(0)
  useEffect(() => {
    const read = () => setEvangelism(map ? roadsideEvangelism(map) : 0)
    read()
    const timer = setInterval(read, 250)
    return () => clearInterval(timer)
  }, [map])
  const relicTraffic = useMemo(
    () => (relic ? Math.round(travelers.reduce((sum, t) => sum + visitChance(t.attributes, relic.stats, renown?.total ?? 0, economy.balance, evangelism, t.type.id), 0)) : 0),
    [travelers, relic, renown, economy.balance, evangelism],
  )

  // The camera's pan clamp follows the loaded map's extent, and a new world
  // opens on the hovel — the one landmark every map has.
  useEffect(() => {
    if (!baseMap) return
    const map = baseMap
    useBuildStore.getState().reset()
    const camera = useCameraStore.getState()
    camera.setMapSize(map.width, map.depth)
    if (BUILDING_PREVIEW) useCameraStore.setState({ viewSize: 24 })
    camera.select(null)
    const hovel = map.buildings.find((b) => b.id === map.site?.hovelId)
    const city = cityFixture(map)
    if (city) {
      useCameraStore.setState({ targetX: tileToWorldX(map, city.centre.x), targetZ: tileToWorldZ(map, city.centre.z), viewSize: 36 })
    } else if (hovel) {
      // Centre the church itself, matching its first-paint image. The camera
      // still targets y=0, so project the visual centre back onto that plane.
      const x = hovel.x + (hovel.w - 1) / 2, z = hovel.z + (hovel.d - 1) / 2
      const height = groundHeight(map, x, z) + 1.15
      const [ox, oy, oz] = cameraOffset(yawForView(0))
      useCameraStore.setState({
        viewIndex: 0,
        targetX: tileToWorldX(map, x) - height * ox / oy,
        targetZ: tileToWorldZ(map, z) - height * oz / oy,
      })
    }
  }, [baseMap])

  const revealPhase = revealStatus?.road === map?.road ? revealStatus?.phase ?? "loading" : "loading"
  const openingMap = map ?? baseMap
  const openingHovel = openingMap?.buildings.find(building => building.id === openingMap.site?.hovelId)
  const openingRotation = openingHovel ? shrineLayout(openingHovel, openingMap?.site?.door).rotation : 0
  const openingView = (Math.round(openingRotation / (Math.PI / 2)) + 4) % 4
  useLayoutEffect(() => {
    useCameraStore.setState({ inputLocked: revealPhase !== "complete", hovered: null })
  }, [revealPhase, map?.road])
  useLayoutEffect(() => () => { useCameraStore.setState({ inputLocked: false }) }, [])

  // A new cast of travelers invalidates whoever was selected.
  useEffect(() => {
    useCameraStore.getState().select(null)
  }, [travelers])

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ backgroundColor: GAME_BACKGROUND }}>
      <LoadingChurch showChurch={!!openingMap && (!map || landmarkRoad !== map.road || revealPhase === "loading")}
        phase={revealPhase} overlayRef={loadingOverlay} view={openingView} viewSize={openingViewSize} />
      {map && relic ? (
        <GameCanvas
          {...pixelationSettings}
          map={map}
          onLandmarkReady={() => setLandmarkRoad(map.road)}
          onRevealPhase={phase => setRevealStatus({ road: map.road, phase })}
          onRevealProgress={(progress, reach) => {
            const style = loadingOverlay.current?.style
            if (!style) return
            // Match the terrain shader's wave and fade width on the same frame.
            const radius = Math.max(.001, progress * reach / .82 * 100 / openingViewSize)
            style.setProperty("--reveal-radius-x", `${radius}dvh`)
            style.setProperty("--reveal-radius-y", `${radius / Math.sqrt(3)}dvh`)
            style.setProperty("--reveal-inner", `${Math.max(0, (progress - .18) / Math.max(.001, progress)) * 100}%`)
          }}
          relic={relic}
          monks={monks}
          blasterPastor={blasterPastor}
          lastMarch={lastMarch}
          travelers={travelers}
          walkSpeed={settings.walkSpeed}
          characterFps={settings.characterFps}
          movement={movement}
          walkTuning={walkTuning}
          characterModel={settings.characterModel}
          treeModel={settings.treeModel}
          visibility={settings}
          characterScale={settings.characterModel === "base" ? settings.baseSize : settings.draftSize}
          roadTier={settings.road}
          relicTraffic={relicTraffic}
          roadLook={roadLook}
          shrineRenown={renown?.total ?? 0}
          baseRenown={(renown?.total ?? 0) - (renown?.visits ?? 0)}
          buildType={economy.buildType}
          resources={economy.settlement.resources}
          onPlace={economy.place}
        />
      ) : null}
      <GameHud
        cheats={{ blasterPastor, lastMarch }}
        map={map}
        seed={seed}
        relic={relic}
        monks={monks}
        travelers={travelers}
        relicTraffic={relicTraffic}
        settings={settings}
        economy={economy}
        onSettingsChange={setSettings}
        pixelation={pixelationSettings}
        onPixelationChange={(patch) => setPixelationOverrides((current) => ({ ...current, ...patch }))}
        defaultMapSize={defaultMapSize}
        mapSizeSaved={mapSizeSaved}
        onDefaultMapSizeChange={size => {
          setDefaultMapSize(size)
          setMapSizeSaved(saveDefaultMapSize(size))
        }}
        onNewMap={size => {
          setSettings(current => ({ ...current, size }))
          setSeed(randomSeed())
        }}
        onSeedChange={setSeed}
      />
      <CheatBar blasterPastor={blasterPastor} onBlasterPastor={() => setBlasterPastor(active => !active)} onLastMarch={() => setLastMarch(true)} />
    </div>
  )
}
