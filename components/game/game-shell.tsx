"use client"

import { withTravelParties } from "@/lib/game/travel-parties"
import { townResidents } from "@/lib/game/town-residents"

import { groundHeight } from "@/lib/game/map/elevation"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { createBenchmarkCity, benchmarkCity as cityFixture, type CityBenchmarkMode } from "@/lib/game/city-benchmark"
import { createFootpaths } from "@/lib/game/footpaths"
import { useBuildStore } from "@/lib/game/build-store"
import { useCameraStore } from "@/lib/game/camera-store"
import { CHARACTER_PIXELS_PER_UNIT } from "@/lib/game/render/pixel-scale"
import { ROAD_TIERS } from "@/lib/game/map/road"
import { randomSeed } from "@/lib/game/rng"
import { loadDefaultMapSize, saveDefaultMapSize } from "@/lib/game/map-size-storage"
import { useSimulationStore, type SimulationSpeed } from "@/lib/game/simulation-store"
import { saveMatchesWorld, saveResumesQuery } from "@/lib/game/save/resume"
import type { GameSave } from "@/lib/game/save/schema"
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_WORLD_SETTINGS,
  displaySettingsOf,
  worldSettingsOf,
  type DisplaySettings,
  type WorldSettings,
} from "@/lib/game/save/settings"
import { loadDisplaySettings, loadGameSave, storeDisplaySettings } from "@/lib/game/save/storage"
import { applyViewSnapshot, loadViewSnapshot } from "@/lib/game/save/view"
import { playQuery } from "@/lib/game/save/url"
import { generateMonks } from "@/lib/game/monks"
import { tileToWorldX, tileToWorldZ } from "@/lib/game/map/types"
import { generateRelic, visitChance } from "@/lib/game/relic"
import { roadsideEvangelism } from "@/lib/game/monk-evangelism"
import { generateTravelers, travelerCountForMap } from "@/lib/game/travelers"
import type { PlayLab } from "@/lib/game/save/url"
import { generateMap } from "@/lib/game/map/generate-map"

import { useAutosave } from "@/hooks/use-autosave"
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
const loadGameCanvas = () => import("./game-canvas")
const GameCanvas = dynamic(() => loadGameCanvas().then((m) => m.GameCanvas), {
  ssr: false,
  loading: () => null,
})

/**
 * Map tuning knobs, in HUD units: the world's generation inputs (which travel
 * in the URL and the save) plus this device's display preferences.
 */
export interface MapSettings extends WorldSettings, DisplaySettings {}

export const DEFAULT_SETTINGS: MapSettings = { ...DEFAULT_WORLD_SETTINGS, ...DEFAULT_DISPLAY_SETTINGS }

export function GameShell({
  initialSeed,
  initialWorld = {},
  initialDisplay = {},
  pixelation,
  benchmarkCity = false,
  lab = false,
  expectResume = false,
  resumeViewSize = null,
  mode = "play",
}: {
  initialSeed?: number
  benchmarkCity?: false | CityBenchmarkMode
  /** A test world for one system; never resumes or overwrites the saved game. */
  lab?: false | PlayLab
  /** The server saw the resume cookie: a saved world is expected on this browser. */
  expectResume?: boolean
  /** The zoom the cookie names, so the loading overlay is at scale before the save is read. */
  resumeViewSize?: number | null
  /**
   * The landing page (/) picks a seed and size and hands over to /play, which
   * is always the game: the saved world when there is one, else a new one.
   */
  mode?: "landing" | "play"
  /** Generation inputs named in the link; they decide whether the save resumes. */
  initialWorld?: Partial<WorldSettings>
  /** Display tuning from older links; overrides this device's preferences. */
  initialDisplay?: Partial<DisplaySettings>
  /** Tune the world pixel renderer without changing map or simulation settings. */
  pixelation?: PixelationProps
}) {
  const router = useRouter()
  const playing = mode === "play"
  const [starting, setStarting] = useState(playing)
  const [started, setStarted] = useState(playing)

  // With no ?seed= in the URL the seed is chosen client-side in an effect, so
  // the server and client never render from different seeds.
  const [seed, setSeed] = useState<number | null>(initialSeed ?? null)
  const [landmarkRoad, setLandmarkRoad] = useState<GameMap["road"] | null>(null)
  const [revealStatus, setRevealStatus] = useState<{ road: GameMap["road"]; phase: MapRevealPhase } | null>(null)
  const openingViewSize = useCameraStore(s => s.viewSize)
  const loadingOverlay = useRef<HTMLDivElement>(null)
  const [blasterPastor, setBlasterPastor] = useState(false)
  const [lastMarch, setLastMarch] = useState(false)
  const [masterBuilder, setMasterBuilder] = useState(false)
  const [settings, setSettings] = useState<MapSettings>({
    ...DEFAULT_SETTINGS,
    ...initialDisplay,
    ...initialWorld,
  })
  // The browser's save and preferences are read once after mounting, so the
  // server and client never render from different worlds. Undefined until then.
  const [restore, setRestore] = useState<GameSave | null | undefined>(undefined)
  const booted = restore !== undefined
  // The first map a matching save was applied to; a regenerated world starts fresh.
  const restoredRoad = useRef<GameMap["road"] | null>(null)
  const [pixelationOverrides, setPixelationOverrides] = useState<PixelationProps>({})
  const pixelationSettings = {
    pixelsPerUnit: pixelationOverrides.pixelsPerUnit ?? pixelation?.pixelsPerUnit ?? CHARACTER_PIXELS_PER_UNIT,
    outputDpr: pixelationOverrides.outputDpr ?? pixelation?.outputDpr ?? 1,
    pixelated: pixelationOverrides.pixelated ?? pixelation?.pixelated ?? true,
  }

  useEffect(() => {
    // Load the renderer and its published assets without creating a world/canvas.
    void loadGameCanvas().catch(() => { /* The dynamic component retries on Play. */ })
    void import("@/lib/game/render/preload-assets").then(async m => {
      await m.prepareOpeningCharacters()
      await m.preloadGameAssets(settings.characterModel)
    })
      .catch(() => { /* Ordinary scene loading remains available on Play. */ })
  }, [settings.characterModel])

  useEffect(() => {
    if (!starting || started) return
    // Let the landmark return to centre and paint its indicators before generation.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const timer = window.setTimeout(() => setStarted(true), reducedMotion ? 32 : 480)
    return () => window.clearTimeout(timer)
  }, [starting, started])

  useEffect(() => {
    // Resolve the browser's preferences and save before generating terrain or
    // writing the URL. A link that names a different world wins over the save.
    const size = loadDefaultMapSize()
    const { save } = loadGameSave()
    // The landing page keeps the save only to offer "Continue"; its own seed is a fresh roll.
    const resuming = playing && save && !benchmarkCity && !lab && saveResumesQuery(save, initialSeed, initialWorld) ? save : null
    setSettings(current => ({
      ...current,
      ...loadDisplaySettings(),
      ...initialDisplay,
      ...(resuming ? { ...worldSettingsOf(resuming.world), treeModel: resuming.simulation.treeModel }
        : initialWorld.size === undefined ? { size } : {}),
    }))
    if (resuming) setSeed(resuming.world.seed)
    else setSeed(current => current ?? randomSeed())
    setRestore(playing ? resuming : save)
    // The play page's resume script may have painted the last view already;
    // this settles it either way, and clears it when the link names another world.
    applyViewSnapshot(resuming ? loadViewSnapshot(resuming) : null)
    // The link is read once at boot; later edits arrive through state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the world's identity in the URL so any map can be bookmarked and revisited.
  useEffect(() => {
    if (!started || seed === null || !booted) return
    window.history.replaceState(null, "", `?${playQuery(seed, settings, benchmarkCity, lab)}`)
  }, [seed, settings, benchmarkCity, lab, booted, started])

  // Display tuning is this browser's preference, kept across new maps.
  useEffect(() => {
    if (booted) storeDisplaySettings(displaySettingsOf(settings))
  }, [booted, settings])

  const generatedMap = useMemo(
    () =>
      !started || seed === null || !booted
        ? null
        : generateMap({
            seed,
            generation: settings.generation,
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
      started,
      booted,
      settings.elevation,
      settings.generation,
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

  const baseMap = useMemo(() => generatedMap && benchmarkCity ? createBenchmarkCity(generatedMap, benchmarkCity) : generatedMap, [generatedMap, benchmarkCity])

  // A save applies to exactly one generated map: the first that matches it.
  // Editing the seed or a generation input afterwards starts a fresh settlement.
  const resumable = restore && saveMatchesWorld(restore, seed, settings) ? restore : null
  const resumeWorld = resumable && (restoredRoad.current === null || (baseMap !== null && restoredRoad.current === baseMap.road)) ? resumable : null
  const activeRestore = resumeWorld && baseMap ? resumeWorld : null
  // The opening differs: a fresh world is revealed from its church, a resumed
  // one from where the player left off, at the same zoom.
  const resuming = starting && (resumeWorld !== null || (!booted && expectResume))
  const activeRestoreRef = useRef(activeRestore)
  activeRestoreRef.current = activeRestore

  const movement = useMemo(() => ({ variation: settings.paceVariation, pathEase: settings.pathEase, acceleration: settings.acceleration }),
    [settings.paceVariation, settings.pathEase, settings.acceleration])
  const walkTuning = useMemo(() => ({ sync: settings.walkSync, stride: settings.stride }), [settings.walkSync, settings.stride])

  // A famous relic for the lab, so its draw never holds anyone back.
  const labRenown = lab === "relic-line" ? 100000 : 0
  // Identities live outside the canvas so the HUD can name whoever is selected.
  const travelerCount = baseMap ? travelerCountForMap(baseMap, settings.traffic) : 0
  const roadTravelers = useMemo(
    () => {
      if (!baseMap || seed === null) return []
      const cast = generateTravelers(seed, travelerCount)
      // The relic-line lab: everyone devout enough to turn in every time.
      return withTravelParties(lab === "relic-line" ? cast.map(t => ({ ...t, attributes: { ...t.attributes, piety: 100 } })) : cast, seed)
    },
    [seed, travelerCount, baseMap, lab],
  )

  // The relic and the brothers who keep it, fixed per seed like the travelers.
  const relic = useMemo(() => (!started || seed === null ? null : generateRelic(seed)), [seed, started])
  const roadLook = useMemo(
    () => ({
      opacity: settings.roadOpacity,
      shade: settings.roadShade,
      edgeLine: settings.roadEdgeLine,
      edgeWidth: settings.roadEdgeWidth,
    }),
    [settings.roadOpacity, settings.roadShade, settings.roadEdgeLine, settings.roadEdgeWidth],
  )
  const founders = useMemo(() => (!started || seed === null ? [] : generateMonks(seed)), [seed, started])
  const joinedMonks = useBuildStore(s => s.joinedMonks)
  const simulation = useBuildStore(s => s.simulation)
  const monks = useMemo(() => [...founders, ...(simulation?.world.road === baseMap?.road ? joinedMonks : [])],
    [founders, joinedMonks, simulation, baseMap?.road])
  const economy = useSettlement(baseMap, monks, relic, activeRestore?.settlement ?? null, masterBuilder)
  const footpaths = useMemo(() => createFootpaths(baseMap ?? undefined), [baseMap])
  useEffect(() => { footpaths.paved = ROAD_TIERS[settings.road]?.paved ?? false }, [footpaths, settings.road])
  // Keep one live map for the canvas and HUD readers, including roadside preaching.
  const map = useMemo(() => economy.map ? { ...economy.map, footpaths } : null, [economy.map, footpaths])
  const travelers = useMemo(() => map ? [...roadTravelers, ...townResidents(map).map(resident => resident.traveler),
      ...(JOB_PREVIEW ? previewResidents(map).map(resident => resident.traveler) : [])] : roadTravelers,
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
    const resume = activeRestoreRef.current
    if (resume) {
      restoredRoad.current = map.road
      useSimulationStore.setState({ paused: resume.playback.paused, speed: resume.playback.speed as SimulationSpeed })
    }
    const hovel = map.buildings.find((b) => b.id === map.site?.hovelId)
    const city = cityFixture(map)
    if (resume) {
      useCameraStore.setState({ ...resume.camera })
      camera.setMapSize(map.width, map.depth)
    } else if (city) {
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
    if (revealPhase === "complete") applyViewSnapshot(null)
  }, [revealPhase, map?.road])
  useLayoutEffect(() => () => { useCameraStore.setState({ inputLocked: false }) }, [])

  useAutosave({
    enabled: revealPhase === "complete" && !benchmarkCity && !lab && !BUILDING_PREVIEW,
    seed,
    settings,
    settlement: economy.settlement,
    road: map?.road,
  })

  // A new cast of travelers invalidates whoever was selected.
  useEffect(() => {
    useCameraStore.getState().select(null)
  }, [travelers])

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ backgroundColor: GAME_BACKGROUND }}>
      <LoadingChurch showChurch={!resuming && (!openingMap || !map || landmarkRoad !== map.road || revealPhase === "loading")}
        generating={starting && revealPhase === "loading"} idle={!starting}
        phase={revealPhase} overlayRef={loadingOverlay} view={openingView} resuming={resuming}
        viewSize={resumeWorld ? resumeWorld.camera.viewSize : !booted && expectResume && resumeViewSize ? resumeViewSize : openingViewSize}
        groundOffset={resuming ? 0 : undefined}
        focus={resuming && resumeWorld ? { camera: resumeWorld.camera, size: resumeWorld.world.size } : null}
        onStop={() => router.push("/")} />
      {map && relic ? (
        <GameCanvas
          {...pixelationSettings}
          map={map}
          restore={activeRestore?.simulation ?? null}
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
          shrineRenown={(renown?.total ?? 0) + labRenown}
          baseRenown={(renown?.total ?? 0) - (renown?.visits ?? 0) + labRenown}
          buildType={economy.buildType}
          resources={economy.settlement.resources}
          onPlace={economy.place}
        />
      ) : null}
      <GameHud
        playing={revealPhase === "complete"}
        starting={starting}
        canStart={seed !== null && booted}
        onPlay={() => {
          if (seed === null) return
          // The last size chosen becomes the default for links that name none.
          saveDefaultMapSize(settings.size)
          router.push(`/play?${playQuery(seed, settings)}`)
        }}
        continueHref={!playing && booted && restore ? "/play" : null}
        cheats={{ blasterPastor, lastMarch, masterBuilder }}
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
        onNewMap={({ size, seed }) => {
          saveDefaultMapSize(size)
          setSettings(current => ({ ...current, size }))
          setSeed(seed)
        }}
        onSeedChange={setSeed}
      />
      {revealPhase === "complete" && <CheatBar
        blasterPastor={blasterPastor}
        lastMarch={lastMarch}
        masterBuilder={masterBuilder}
        onBlasterPastor={() => setBlasterPastor(active => !active)}
        onLastMarch={() => setLastMarch(active => !active)}
        onMasterBuilder={() => setMasterBuilder(active => !active)}
        onGrant={economy.grant}
        onGrantRenown={economy.bless}
      />}
    </div>
  )
}
