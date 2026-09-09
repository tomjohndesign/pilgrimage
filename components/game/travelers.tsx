"use client"

import { travelerWeariness } from "@/lib/game/traveler-weariness"
import { benchmarkWork } from "@/lib/game/benchmark-work"
import { withWorkerRouteMemory } from "@/lib/game/worker-route-memory"

import { withTerrainCornerQueries } from "@/lib/game/map/cliff-corners"
import { JOB_PREVIEW } from "@/lib/game/building-preview"
import { previewResidents, placePreviewResident } from "@/lib/game/jobs/preview"
import { settlementJob, type SettlementJob } from "@/lib/game/jobs/design"
import { wildlifeRegistry } from "@/lib/game/wildlife/registry"

import { monkRegistry } from "@/lib/game/monks"
import { processionRegistry } from "@/lib/game/relic-procession"
import { frameProfile } from "@/lib/game/render/frame-profile"
import { isWorldVisible } from "@/lib/game/render/visibility"
import { figureMounts } from "@/lib/game/render/figure-mounts"
import { CrowdBudget, crowdRanks, crowdRenderControl, crowdRenderStatus } from "@/lib/game/render/crowd-budget"
import { sceneryZooming } from "@/lib/game/render/scenery-detail"
import { frameQuality } from "@/lib/game/render/frame-quality"
import { walkingSurface } from "@/lib/game/map/walking-surface"

import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { travelerAppearance } from "@/lib/game/base-person/population"
import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { routeBenchmarkCity } from "@/lib/game/city-benchmark"
import { simulationFrameStep, useSimulationStore } from "@/lib/game/simulation-store"
import { markPerson, selectElement } from "@/lib/game/selection"
import { CharacterHitTarget, CharacterSelectionOutline } from "./character-selection"
import { useBalanceStore } from "@/lib/game/balance-store"
import { setFootpathObstacles } from "@/lib/game/footpaths"
import { jobBuildings } from "@/lib/game/settlement"
import { useBuildStore } from "@/lib/game/build-store"
import type { Relic } from "@/lib/game/relic"
import type { TreePlacement } from "@/lib/game/trees/placement"
import { tileAt, worldToTileX, worldToTileZ, type GameMap } from "@/lib/game/map/types"
import { GAME_DAY_SECONDS, createSim, simRegistry, stepSim } from "@/lib/game/sim"
import { shrineLayout } from "@/lib/game/shrine-layout"
import type { Traveler } from "@/lib/game/travelers"
import { LINEAR_MOVEMENT, type MovementTuning, type WalkTuning } from "@/lib/game/motion"
import type { CharacterModel } from "@/lib/game/character-assets"
import { playCharacterSound, stopCharacterSound } from "@/lib/game/character-audio"
import {
  encodeObjectId,
  travelerObjectId,
} from "@/lib/game/render/outline"

import { BASE_CHARACTER_SCALE } from "@/lib/game/base-person/gait"
import { WoodLog } from "./wood-log"
import { PixelCharacters } from "@/components/pixel-canvas"
import { TravelerFigure } from "./traveler-figure"
import { CharacterSprite } from "./character-sprite"
import { AdmissionEffects } from "./admission-effects"
import { knightLoadout } from "@/lib/game/knights"
import { cartLoadout, SHOP_SECONDS } from "@/lib/game/transport/assets"

/**
 * People on the road: directional walking sprites driven by the simulation in
 * lib/game/sim.ts — walking, camping in clearings, chasing vendors. Identity
 * comes from the travelers prop; all per-frame state lives in the sim, and this
 * component copies position, heading and motion out of it. Select a person — the
 * HUD names it and shows its live stats. The figure itself lives in
 * traveler-figure.tsx so the character gallery can draw the same one.
 */


/**
 * Radius of the sphere a figure is culled by, in tiles. Generous: a sprite is
 * anchored at the feet and stands well above that, and a mounted knight or a
 * merchant's cart reaches further still.
 */
const FIGURE_RADIUS = 3

/**
 * Stop (or resume) recomposing a figure's local matrices every pass.
 *
 * Three.js walks the whole graph once per `render`, and this scene is rendered
 * several times a frame, so a culled figure otherwise still pays for a matrix
 * compose per node per pass. Only run on the frames where visibility flips.
 */
function setSubtreeMatrixAutoUpdate(root: THREE.Object3D, enabled: boolean): void {
  root.traverse((object) => { object.matrixAutoUpdate = enabled; object.matrixWorldAutoUpdate = enabled })
}

export const Travelers = memo(function Travelers({
  map,
  travelers,
  speed,
  speedScales,
  characterModel = "callings",
  characterScale = 1,
  characterFps,
  walkTuning,
  movement = LINEAR_MOVEMENT,
  relic,
  trees,
  shrineRenown,
}: {
  map: GameMap
  travelers: Traveler[]
  relic: Relic
  trees: TreePlacement[]
  shrineRenown: number
  /** Reference walking speed in tiles per second, scaled by size and personal pace. */
  speed: number
  speedScales?: ReadonlyMap<number, number>
  /** Swaps only the figure; identities, simulation and selection sounds stay shared. */
  characterModel?: CharacterModel
  /** Uniform size multiplier; leaves the sprite's foot anchor fixed. */
  characterScale?: number
  /** Animation frames per second, independent of movement pace. */
  characterFps?: number
  walkTuning?: WalkTuning
  movement?: MovementTuning
}) {
  const shrine = map.buildings.find(b => b.id === map.site?.hovelId)
  const kneelingHeading = shrine ? shrineLayout(shrine,map.site?.door).rotation + Math.PI : Math.PI
  const appearances = useMemo(() => travelers.map(t => travelerAppearance(map.seed ?? 0, t.id)), [travelers, map.seed])
  const ranks = useMemo(() => crowdRanks(travelers.map(t => t.id)), [travelers])
  const crowdBudget = useMemo(() => new CrowdBudget(), [travelers])
  const selection = useCameraStore((s) => s.selection)
  const [jobs, setJobs] = useState<ReadonlyMap<number, SettlementJob>>(() => new Map(JOB_PREVIEW ? previewResidents(map).map(resident =>
    [resident.traveler.id, settlementJob(resident.building.id, [resident.building])!] as const) : []))
  const currentJobs = useRef(jobs)
  const resourceElapsed = useRef(0)
  const preparedParents = useMemo(() => new Map<THREE.Object3D, boolean>(), [])
  const identityMatrix = useMemo(() => new THREE.Matrix4(), [])
  const obstacleSource = useRef<{ trees: TreePlacement[]; felled: number } | null>(null)
  // Simulation retains the entire population. Mount detailed figures only in a
  // padded camera neighborhood, retaining a bounded cache for camera returns. Hidden rigs skip posing.
  const [mounted, setMounted] = useState<number[]>([])
  const mountedRef = useRef<number[]>([])
  const root = useRef<THREE.Group>(null)
  const visualStale = useRef(false)
  const groupRefs = useRef<Array<THREE.Group | null>>([])
  const logRefs = useRef<Array<THREE.Group | null>>([])
  const [logMounts, setLogMounts] = useState<number[]>([])
  const requestedLogs = useRef(new Set<number>())
  const cull = useMemo(() => ({ frustum: new THREE.Frustum(), viewProjection: new THREE.Matrix4(), view: new THREE.Matrix4(), bounds: new THREE.Sphere(undefined, FIGURE_RADIUS) }), [])

  const sim = useMemo(() => createSim([], map, [], relic.stats), [map.road, relic])
  useEffect(() => { requestedLogs.current.clear(); setLogMounts([]) }, [sim])
  useEffect(() => {
    const fresh = createSim(travelers, map, [], relic.stats)
    const residents = JOB_PREVIEW ? new Map(previewResidents(map).map(resident => [resident.traveler.id, resident])) : new Map()
    for (const [id, traveler] of fresh.travelers) {
      if (!sim.travelers.has(id) && !sim.joinedMonks.has(id)) {
        const resident = residents.get(id)
        if (resident) placePreviewResident(traveler, map, resident)
        sim.travelers.set(id, traveler)
      }
    }
    for (const id of sim.travelers.keys()) {
      if (!fresh.travelers.has(id)) {
        sim.travelers.get(id)!.buildingTask = undefined
        sim.travelers.delete(id)
      }
    }
  }, [sim, travelers, map, relic])

  const camps = useMemo(() => jobBuildings(map), [map])

  // Publish the running sim so the HUD's traveler panel can poll live stats.
  useEffect(() => {
    simRegistry.current = sim
    return () => {
      for (const traveler of sim.travelers.values()) traveler.buildingTask = undefined
      if (simRegistry.current === sim) {
        simRegistry.current = null
        Object.assign(crowdRenderStatus, { active: false, budget: 0, rendered: 0, population: 0 })
      }
    }
  }, [sim])

  useEffect(() => {
    // Synchronous subscription keeps playback in the user gesture and also
    // covers selections originating in other controls, not only the canvas.
    const unsubscribe = useCameraStore.subscribe((state, previous) => {
      const next = state.selection
      if (!next || next.kind !== "traveler" || isSelected(previous.selection, next)) return
      const traveler = travelers.find((t) => t.id === next.id)
      if (traveler) void playCharacterSound(traveler.type.id, traveler.id)
    })
    return () => { unsubscribe(); stopCharacterSound() }
  }, [travelers])

  useFrame(({ camera, scene, clock: frameClock }, delta) => withTerrainCornerQueries(map, () => {
    const started = frameProfile.start()
    // A background tab hands us a huge delta; clamp so nobody teleports.
    const build = useBuildStore.getState()
    sim.wildlife = wildlifeRegistry.current
    sim.procession = processionRegistry.current
    sim.shrineKeeperReady = [...(monkRegistry.current?.values() ?? [])].some(activity => activity === "keepingRelic" || activity === "showingRelic")
    sim.buildings = camps
    sim.shrineRenown = shrineRenown
    sim.balance = useBalanceStore.getState().balance
    sim.trees = trees
    if (map.footpaths && (obstacleSource.current?.trees !== trees || obstacleSource.current.felled !== sim.felled.size)) {
      setFootpathObstacles(map.footpaths, trees.flatMap((tree, index) => sim.felled.has(index) ? [] : [{ x: tree.x, z: tree.z, radius: Math.max(.18, (tree.footprint ?? .3) * .5) }]))
      obstacleSource.current = { trees, felled: sim.felled.size }
    }
    const playback = useSimulationStore.getState()
    // Keep each tick bounded at faster speeds, including work and routing.
    if (!playback.paused) {
      const { ticks, dt } = simulationFrameStep(delta, playback.speed)
      for (let tick = 0; tick < ticks; tick++) {
        withWorkerRouteMemory(map, sim.time * GAME_DAY_SECONDS, () => {
        const planning = frameProfile.start()
        routeBenchmarkCity(sim, map)
        frameProfile.end("routePlanning", planning)
        const stepping = frameProfile.start()
        stepSim(sim, travelers, map, speed, dt, movement, speedScales, characterScale)
        frameProfile.end("simulationStep", stepping)
        })
      }
    }
    const nextJobs = new Map<number, SettlementJob>()
    for (const [id, traveler] of sim.travelers) {
      const job = settlementJob(traveler.employer, camps)
      if (job) nextJobs.set(id, job)
    }
    if (nextJobs.size !== currentJobs.current.size || [...nextJobs].some(([id, job]) => currentJobs.current.get(id) !== job)) {
      currentJobs.current = nextJobs
      setJobs(nextJobs)
    }
    resourceElapsed.current += delta
    if (build.resourceRevision !== sim.resourceRevision || build.joinedMonks.length !== sim.joinedMonks.size || resourceElapsed.current >= 0.25) {
      build.syncResources(sim, travelers)
      resourceElapsed.current = 0
    }

    frameProfile.end("simulation", started)
    if (!isWorldVisible(root.current) || (process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1" && !benchmarkWork.characterVisuals)) {
      if (!isWorldVisible(root.current)) {
        Object.assign(crowdRenderStatus, { active: false, budget: travelers.length, population: travelers.length, rendered: 0 })
        if (root.current) Object.assign(root.current.userData, { renderedUnits: 0, missingVisibleUnits: 0 })
      }
      visualStale.current = true
      return
    }
    const poseStarted = frameProfile.start()
    // Everyone keeps walking in the simulation above, but a figure the camera
    // cannot see is not worth posing: the block below is the expensive half,
    // and clearing `visible` also drops the whole subtree from the renderer's
    // traversal in each of the frame's passes.
    const { frustum, viewProjection, view, bounds } = cull
    camera.updateMatrixWorld()
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, view.copy(camera.matrixWorld).invert()))
    const selected = useCameraStore.getState().selection
    const budget = crowdBudget.update(travelers.length,
      crowdRenderControl.enabled && frameQuality(scene) === 2,
      delta, sceneryZooming(scene))
    const nextMounted: number[] = []
    const preparation: Array<{ index: number; distance: number }> = []
    const newLogs: number[] = []
    preparedParents.clear()
    let pendingUnits = 0, missingVisibleUnits = 0, renderedUnits = 0
    for (let i = 0; i < travelers.length; i++) {
      const group = groupRefs.current[i]
      const s = sim.travelers.get(travelers[i].id)
      const joined = sim.joinedMonks.get(travelers[i].id)
      if (joined) {
        if (group) group.visible = false
        if (selected?.kind === "traveler" && selected.id === travelers[i].id) useCameraStore.getState().select({ kind: "monk", id: joined.id })
        continue
      }

      if (!s) continue
      if (ranks[i] >= budget && !(selected?.kind === "traveler" && selected.id === travelers[i].id)) {
        if (group?.visible) { group.visible = false; setSubtreeMatrixAutoUpdate(group, false) }
        const logs = logRefs.current[i]
        if (logs?.visible) { logs.visible = false; setSubtreeMatrixAutoUpdate(logs, false) }
        continue
      }
      bounds.center.set(s.x, s.y, s.z)
      // The selected figure stays live wherever it wanders, so its outline and
      // highlight never depend on where the camera happens to be pointing.
      bounds.radius = FIGURE_RADIUS + 32
      const personNearby = frustum.intersectsSphere(bounds)
      bounds.radius = FIGURE_RADIUS
      const personOnScreen = frustum.intersectsSphere(bounds)
      const parking = s.marketParking ?? s.shrineParking
      if (parking) bounds.center.set(parking.pose.x, walkingSurface(map, parking.pose.x, parking.pose.z).height, parking.pose.z)
      const parkedOnScreen = !!parking && frustum.intersectsSphere(bounds)
      bounds.radius = FIGURE_RADIUS + 32
      if (personNearby || (!!parking && frustum.intersectsSphere(bounds)) || (selected?.kind === "traveler" && selected.id === travelers[i].id)) {
        nextMounted.push(i)
        if (!group) {
          pendingUnits++
          let distance = -Infinity
          for (const plane of frustum.planes) distance = Math.max(distance, -plane.distanceToPoint(bounds.center))
          preparation.push({ index: i, distance })
        }
      }
      bounds.radius = FIGURE_RADIUS
      const onScreen = personOnScreen || parkedOnScreen
        || (selected?.kind === "traveler" && selected.id === travelers[i].id)
      if (!group) { if (onScreen) missingVisibleUnits++; continue }
      const wasVisible = group.visible
      if (wasVisible !== onScreen) {
        group.visible = onScreen
        setSubtreeMatrixAutoUpdate(group, onScreen)
        const logs = logRefs.current[i]
        if (logs && !onScreen) { logs.visible = false; setSubtreeMatrixAutoUpdate(logs, false) }
        else if (logs) setSubtreeMatrixAutoUpdate(logs, true)
      }
      if (!onScreen) continue
      renderedUnits++

      const dx = s.x - group.position.x
      const dz = s.z - group.position.z
      const distance = Math.hypot(dx, dz)
      const moved = !visualStale.current && group.userData.initialized === true && distance < 2 ? distance : 0
      const moving = playback.paused ? group.userData.moving === true : moved > 1e-6
      if (moving && !playback.paused) {
        const target = Math.atan2(dx, dz)
        const difference = target - group.rotation.y
        const turn = difference > Math.PI || difference < -Math.PI ? Math.atan2(Math.sin(difference), Math.cos(difference)) : difference
        const blend = movement.pathEase === 0 ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) / (movement.pathEase * 0.18))
        if (turn !== 0) group.rotation.y += turn * blend
      }
      const workTree = s.tree === null ? undefined : trees[s.tree]
      if ((s.activity === "visiting" || (s.activity === "toRelic" && !moving)) && !!s.shrineSeat) {
        group.rotation.y = kneelingHeading
      }
      if ((s.activity === "performing" || s.activity === "begging") && s.walkFrom) {
        group.rotation.y = Math.atan2(s.walkFrom.x - s.x, s.walkFrom.z - s.z)
      }
      if (s.activity === "listening" && s.musicVisit) {
        const performer = sim.travelers.get(s.musicVisit.performerId)
        if (performer) group.rotation.y = Math.atan2(performer.x - s.x, performer.z - s.z)
      }
      if (s.activity === "building") group.rotation.y = s.buildingTask?.heading ?? Math.PI
      if (s.activity === "givingAlms" && s.almsVisit) {
        const beggar = sim.travelers.get(s.almsVisit.beggarId)
        if (beggar) group.rotation.y = Math.atan2(beggar.x - s.x, beggar.z - s.z)
      }
      group.userData.donated = (s.donationUntil ?? 0) > sim.time * GAME_DAY_SECONDS
      group.userData.workTree = workTree
      if (!playback.paused && !moving && workTree && (s.activity === "working" || s.activity === "gathering")) {
        group.rotation.y = Math.atan2(workTree.x - s.x, workTree.z - s.z)
      }
      group.userData.playbackRate = playback.paused ? 0 : playback.speed
      group.userData.motionReset = visualStale.current || !wasVisible || group.userData.initialized !== true || distance >= 2
      group.userData.distance = playback.paused ? 0 : moved
      const transported = travelers[i].type.id === "vendor" || travelers[i].type.id === "knight"
      group.userData.moving = moving && (transported || !s.praying)
      if (!playback.paused && s.praying && !s.shrineSeat && sim.procession?.position) {
        group.rotation.y = Math.atan2(sim.procession.position.x - s.x, sim.procession.position.z - s.z)
      }
      group.userData.activity = s.praying ? "praying" : s.activity
      group.userData.routineActivity = s.activity
      if (transported) {
        group.userData.transportParking = s.marketParking ?? s.shrineParking
        // Render the same collision-checked pose used by the simulation; a
        // settled keeper leaves that pose in the market's rear yard.
        group.userData.cartProgress = s.convoy && s.activity === "walking" && !s.track && !s.shrineParking && !s.roadShortcut ? s.progress : undefined
        group.userData.cartDirection = s.direction
        group.userData.cartManeuver = !!s.cartPose
        group.userData.cartPose = s.marketParking?.pose ?? s.shrineParking?.pose ?? s.cartPose
        group.userData.animalHeading = undefined
        group.userData.reversing = false
        group.userData.keeperTime = s.keeperTime ?? 0
        group.userData.keeperAudience = s.activity === "vending" && travelers.some(other => {
          const person = sim.travelers.get(other.id)
          return other.id !== s.id && person && Math.hypot(person.x - s.x, person.z - s.z) < 3
        })
        group.userData.shopHeading = s.stallRoute?.heading
        group.userData.shopSide = s.stallRoute?.side ?? 1
        group.userData.shopProgress = s.activity === "openingShop" ? 1 - s.timer / SHOP_SECONDS : s.activity === "packingShop" ? s.timer / SHOP_SECONDS : s.activity === "vending" ? 1 : 0
        group.userData.horseRest = s.horseRest
        group.userData.pasture = s.pasture
        const pastureTerrain = s.pasture ? tileAt(map, worldToTileX(map, s.pasture.x), worldToTileZ(map, s.pasture.z)) : null
        group.userData.pastureY = s.pasture ? walkingSurface(map, s.pasture.x, s.pasture.z).height : s.y
        group.userData.pastureGrass = pastureTerrain === "grass" || pastureTerrain === "clearing"
      }
      group.userData.weary = travelerWeariness(s) > 0
      group.userData.carrying = s.carrying
      group.userData.initialized = true
      group.userData.phase = travelers[i].id * 0.137
      group.userData.heading = group.rotation.y

      const y = walkingSurface(map, s.x, s.z).height
      group.position.set(s.x, y, s.z)
      // Keep baked bodies at their authored proportions.
      group.scale.y = 1
      if (group.rotation.z !== 0) group.rotation.z = 0
      // Resolve shared ancestors once, then each live unit once. Its direct
      // sprite can reuse this matrix instead of revisiting the whole ancestry.
      if (group.parent && !preparedParents.has(group.parent)) {
        group.parent.updateWorldMatrix(true, false)
        preparedParents.set(group.parent, group.parent.matrixWorld.equals(identityMatrix))
      }
      if (group.parent && preparedParents.get(group.parent)) {
        group.updateMatrix(); group.matrixWorld.copy(group.matrix); group.matrixWorldNeedsUpdate = false
      } else group.updateWorldMatrix(false, false)
      group.userData.poseWorldFrame = frameClock.elapsedTime
      const logs = logRefs.current[i]
      const carryingLog = s.carrying > 0 && !s.praying
      if (carryingLog && !requestedLogs.current.has(i)) { requestedLogs.current.add(i); newLogs.push(i) }
      if (logs) {
        logs.visible = carryingLog
        if (carryingLog) {
          logs.position.copy(group.position)
          logs.quaternion.copy(group.quaternion)
        }
      }
    }
    Object.assign(crowdRenderStatus, { active: crowdBudget.active, budget, rendered: renderedUnits, population: travelers.length })
    if (root.current) Object.assign(root.current.userData, { requestedUnits: nextMounted.length, pendingUnits, missingVisibleUnits,
      crowdBudget: budget, densityReduced: crowdBudget.active, renderedUnits })
    if (newLogs.length) setLogMounts(current => [...current, ...newLogs])
    // Prepare the nearest missing figures first; array/ID order can otherwise
    // spend the admission budget on the far edge of the preload margin.
    const desired = preparation.length ? [
      ...preparation.sort((a, b) => a.distance - b.distance).map(entry => entry.index),
      ...nextMounted.filter(index => groupRefs.current[index]),
    ] : nextMounted
    // Retain visited figures up to the population limit. Their clip textures
    // are lazy and hidden poses stay idle; zooming back out should not dispose
    // and recreate thousands of already-loaded rigs beside the camera update.
    const next = figureMounts(mountedRef.current, desired,
      selected?.kind === "traveler" ? travelers.findIndex(t => t.id === selected.id) : -1, 16, travelers.length)
    if (mountedRef.current !== next) {
      mountedRef.current = next
      setMounted(next)
    }
    visualStale.current = false
    frameProfile.end("travelerPositions", poseStarted)
  }), -3)

  if (!map.road || map.road.length < 2 || travelers.length === 0) return null

  return (
    <group name="travelers" ref={root}>
      <PixelCharacters>
        <AdmissionEffects sim={sim} characterScale={characterScale} />
        {mounted.map(index => travelers[index] && <TravelerUnit key={travelers[index].id} index={index}
          traveler={travelers[index]} map={map} appearance={appearances[index]} job={jobs.get(travelers[index].id)} groups={groupRefs}
          selected={isSelected(selection, { kind: "traveler", id: travelers[index].id })}
          characterModel={characterModel} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning} />)}
      </PixelCharacters>
      {/* Geometry shares the camp's world pixel grid; only baked people use the character pass. */}
      {logMounts.map(index => travelers[index] && <TravelerLog key={travelers[index].id} index={index} id={travelers[index].id}
        groups={logRefs} scale={characterScale * (characterModel === "base" ? appearances[index]?.scale ?? 1 : 1)} />)}
    </group>
  )
})

/** Stable neighbors do not rebuild rigs or materials as another figure enters view. */
const TravelerUnit = memo(function TravelerUnit({ index, traveler, map, appearance, groups, selected, job, ...figure }: {
  index: number; traveler: Traveler; map: GameMap; appearance: ReturnType<typeof travelerAppearance>
  groups: RefObject<Array<THREE.Group | null>>; selected: boolean; job?: SettlementJob
  characterModel: CharacterModel; characterScale: number; characterFps?: number; walkTuning?: WalkTuning
}) {
  // Keep frequently read motion fields in one stable object layout. Growing
  // an initially empty userData object field by field sends large crowds
  // through dictionary lookups in both the position and sprite callbacks.
  const motion = useMemo(() => ({
    person: true, travelerId: traveler.id, donated: false, workTree: undefined,
    playbackRate: 0, motionReset: true, distance: 0, moving: false,
    activity: undefined, routineActivity: undefined, weary: false, carrying: 0,
    initialized: false, phase: traveler.id * .137, heading: 0, poseWorldFrame: -1,
    transportParking: undefined, cartProgress: undefined, cartDirection: undefined,
    cartManeuver: false, cartPose: undefined, animalHeading: undefined, reversing: false,
    keeperTime: 0, keeperAudience: false, shopHeading: undefined, shopSide: 1,
    shopProgress: 0, horseRest: undefined, pasture: undefined, pastureY: 0, pastureGrass: false,
  }), [traveler.id])
  const idColor = useMemo(() => new THREE.Color(...encodeObjectId(travelerObjectId(index))), [index])
  const select = useCallback((event: { delta: number; stopPropagation: () => void }) =>
    selectElement({ kind: "traveler", id: traveler.id }, event), [traveler.id])
  const register = useCallback((node: THREE.Group | null) => { markPerson(node); if (node) node.userData.travelerId = traveler.id; groups.current[index] = node }, [groups, index, traveler.id])
  return <group name="traveler-unit" visible={false} ref={register} userData={motion}>
    {job || traveler.type.id === "vendor" || traveler.type.id === "knight" ?
      <TravelerFigure {...figure} map={map} job={job} age={traveler.attributes.age}
        {...(traveler.type.id === "knight" ? knightLoadout(traveler.id) : cartLoadout(traveler.id))}
        appearance={appearance} selected={selected} type={traveler.type} onClick={select} idColor={idColor} /> :
      <Suspense fallback={null}><CharacterSprite {...figure} map={map} age={traveler.attributes.age}
        appearance={appearance} selected={selected} type={traveler.type.id} onClick={select}
        outlineColor={[idColor.r, idColor.g, idColor.b]} /></Suspense>}
    <CharacterHitTarget onClick={select} />
    {selected && <CharacterSelectionOutline />}
  </group>
})

const TravelerLog = memo(function TravelerLog({ index, id, groups, scale }: {
  index: number; id: number; groups: RefObject<Array<THREE.Group | null>>; scale: number
}) {
  const idColor = useMemo(() => new THREE.Color(...encodeObjectId(travelerObjectId(index))), [index])
  const register = useCallback((node: THREE.Group | null) => { groups.current[index] = node }, [groups, index])
  return <group name="carried-logs" visible={false} ref={register}
    onClick={event => selectElement({ kind: "traveler", id }, event)}>
    <group position={[0, .35 * scale / BASE_CHARACTER_SCALE, .2 * scale / BASE_CHARACTER_SCALE]} rotation={[0, 0, Math.PI / 2]}>
      <WoodLog idColor={idColor} characterScale={scale} />
    </group>
  </group>
})
