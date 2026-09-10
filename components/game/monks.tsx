"use client"

import { fordSpeedAt } from "@/lib/game/map/fords"

import { SceneAssetBoundary } from "./scene-assets"

import { stepDevotion } from "@/lib/game/wellbeing"
import { useBalanceStore } from "@/lib/game/balance-store"
import { simRegistry } from "@/lib/game/sim"
import { shrineLayout, shrineStations } from "@/lib/game/shrine-layout"
import { tileToWorldX, tileToWorldZ } from "@/lib/game/map/types"
import { monkBeds } from "@/lib/game/housing"
import { recordWalkingPath } from "@/lib/game/footpaths"
import { PietyEffects } from "./admission-effects"
import { PixelCharacters } from "@/components/pixel-canvas"
import { createMonkNeeds, replanMonkAfterMapChange, stepMonkWork, type MonkNeeds } from "@/lib/game/monk-work"
import { preachingRegistry, preachingSpots, stepMonkEvangelism, type PreachingTask } from "@/lib/game/monk-evangelism"
import { useMonkEvangelismStore } from "@/lib/game/monk-evangelism-store"
import { walkingSurface } from "@/lib/game/map/walking-surface"

import { blessByProcession, createRelicProcession, nearProcession, processionGrounds, processionRegistry, startAltarProcession, startProcession, stepProcession } from "@/lib/game/relic-procession"
import { useRelicProcessionStore } from "@/lib/game/relic-procession-store"
import type { Relic } from "@/lib/game/relic"
import { RelicDisplay, RELIC_DISPLAY_HEIGHT } from "./relic-display"

import { createMonkRoutine, stepMonkRoutine, type MonkRoutine } from "@/lib/game/monk-routine"
import { monkWander, type WanderSpot } from "@/lib/game/monk-wander"
import { useEffect, useMemo, useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { useSimulationStore } from "@/lib/game/simulation-store"
import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { markPerson, selectElement } from "@/lib/game/selection"
import { CharacterHitTarget, CharacterSelectionOutline } from "./character-selection"
import type { GameMap } from "@/lib/game/map/types"
import { monkStaminaRegistry, monkRegistry, monkPositionRegistry, type Monk, type MonkActivity } from "@/lib/game/monks"
import { createMonkFlight, monkGroundTime, recallMonkFlight, stepMonkFlight, type MonkFlight } from "@/lib/game/monk-flight"
import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { encodeObjectId, residentObjectId, RELIC_OBJECT_ID } from "@/lib/game/render/outline"
import { CharacterSprite } from "./character-sprite"
import { monkVisual, monkWalkSpeed, monkRelicAttachment, monkRelicTrayWidth, MONK_WALK_TUNING } from "@/lib/game/base-person/monk-assets"
import { rocketMonkVisual, rocketFlightClip } from "@/lib/game/rocket/assets"

/**
 * The keeper stays behind the altar and reveals the relic to individual visitors.
 * Other brothers follow grid routes to work and prayer; players can send them in procession.
 * Blaster Pastor sends them
 * on occasional cruises across the map; they return to their life at the shrine
 * between trips. Toggling it off recalls them and stows their packs on landing.
 */

interface MonkState extends MonkRoutine, MonkNeeds {
  preachingTask?: PreachingTask
  workScale?: number
  flight?: MonkFlight
  piety: number
  happiness: number
  hoursSinceChurch?: number
  flightWait: number
}

export function Monks({ map, monks, relic, flying = false, characterScale = 1 }: { map: GameMap; monks: Monk[]; relic: Relic; flying?: boolean; characterScale?: number }) {
  const keeperStation = useMemo(() => {
    const shrine = map.buildings.find(b => b.id === map.site?.hovelId)
    if (!shrine) return null
    const { keeper } = shrineStations(shrine, map.site?.door)
    const x = tileToWorldX(map, keeper.x), z = tileToWorldZ(map, keeper.z)
    return { x, z, y: walkingSurface(map, x, z).height, heading: shrineLayout(shrine, map.site?.door).rotation }
  }, [map])
  const selection = useCameraStore((s) => s.selection)
  const groupRefs = useRef<Array<THREE.Group | null>>([])
  const [airborneIds, setAirborneIds] = useState<ReadonlySet<number>>(new Set())

  const world = useMemo(() => {
    const wander = monkWander(map)
    const { spots, centre } = wander
    const rng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.monkWander))
    const flightRng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.monkFlight))
    const pick = (): WanderSpot => {
      const spot = spots[Math.floor(rng() * spots.length)]
      return spot
    }
    const states: MonkState[] = (spots.length ? monks : []).map((monk, index) => {
      const routine = createMonkRoutine(wander, index, rng)
      if (index > 0 && keeperStation && routine.prayerSpot && centre) {
        const lateral = (routine.prayerSpot.x - centre.x) * Math.cos(keeperStation.heading)
          - (routine.prayerSpot.z - centre.z) * Math.sin(keeperStation.heading)
        // Keep the keeper's station and the visitors' centre aisle unoccupied.
        if (Math.abs(lateral) < .25) routine.prayerSpot = undefined
      }
      return {
        ...routine, ...createMonkNeeds(index),
        ...(index === 0 && keeperStation ? { ...keeperStation, activity: "keepingRelic" as const, route: [], pause: 0 } : {}),
        piety: monk.attributes.piety, happiness: monk.attributes.happiness, flightWait: index * 8,
      }
    })
    const activities = new Map<number, MonkActivity>()
    return { stamina: new Map<number, number>(), spots, centre, rng, flightRng, pick, states, activities, wander,
      procession: createRelicProcession(), grounds: processionGrounds(map, wander) }
  }, [map.road])
  const beds = monkBeds(map)
  for (let index = world.states.length; index < monks.length && world.spots.length; index++) {
    const monk = monks[index]
    const routine = createMonkRoutine(world.wander, index, world.rng)
    if (keeperStation && routine.prayerSpot && world.centre) {
      const lateral = (routine.prayerSpot.x - world.centre.x) * Math.cos(keeperStation.heading)
        - (routine.prayerSpot.z - world.centre.z) * Math.sin(keeperStation.heading)
      if (Math.abs(lateral) < .25) routine.prayerSpot = undefined
    }
    world.states.push({ ...routine, ...createMonkNeeds(index),
      ...monk.arrival, piety: monk.attributes.piety, happiness: monk.attributes.happiness, flightWait: 8,
      destination: "home", pause: 0 })
  }
  for (let index = 0; index < world.states.length; index++) {
    const monk = monks[index], bed = monk.home ? { home: monk.home, slot: monk.bedSlot ?? 0 } : beds[index]
    world.states[index].home = bed?.home
    world.states[index].bedSlot = bed?.slot
  }
  const navigation = useMemo(() => monkWander(map), [map])
  world.pick = () => navigation.spots[Math.floor(world.rng() * navigation.spots.length)]
  world.wander = navigation
  world.spots = navigation.spots
  world.centre = navigation.centre
  world.grounds = useMemo(() => processionGrounds(map, navigation), [map, navigation])
  // A placed building must not restart the brothers' day: only routes and
  // resting spots a new footprint now blocks get re-planned.
  useEffect(() => {
    for (const state of world.states) {
      if (state.buildingTask || state.flight || state.preachingTask) continue
      replanMonkAfterMapChange(state, map, navigation)
    }
  }, [map, world, navigation])

  useEffect(() => {
    useMonkEvangelismStore.setState({ available: preachingSpots(map).length > 0 })
  }, [map])

  // Publish activities so the HUD's monk panel can poll them.
  useEffect(() => {
    const preachers = { road: map.road, monks: world.states }
    preachingRegistry.current = preachers
    useMonkEvangelismStore.setState({ assigned: new Set() })
    monkRegistry.current = world.activities
    monkStaminaRegistry.current = world.stamina
    const positions = new Map(monks.map((m, i) => [m.id, world.states[i]]))
    monkPositionRegistry.current = positions
    processionRegistry.current = world.procession
    useRelicProcessionStore.setState({ available: !!world.grounds, monkId: null, stage: "idle", returnRequested: false })
    return () => {
      for (const state of world.states) state.buildingTask = undefined
      if (preachingRegistry.current === preachers) {
        preachingRegistry.current = null
        useMonkEvangelismStore.setState({ available: false, assigned: new Set() })
      }
      if (monkPositionRegistry.current === positions) monkPositionRegistry.current = null
      if (monkRegistry.current === world.activities) monkRegistry.current = null
      if (monkStaminaRegistry.current === world.stamina) monkStaminaRegistry.current = null
      if (processionRegistry.current === world.procession) {
        processionRegistry.current = null
        useRelicProcessionStore.setState({ available: false, monkId: null, stage: "idle", returnRequested: false })
      }
    }
  }, [world])

  useEffect(() => {
    for (const [index, monk] of monks.entries()) monkPositionRegistry.current?.set(monk.id, world.states[index])
  }, [world, monks])

  useFrame((_, delta) => {
    const playback = useSimulationStore.getState()
    const dt = playback.paused ? 0 : Math.min(delta, 0.1) * playback.speed
    world.procession.cooldown = Math.max(0, world.procession.cooldown - dt)
    const controls = useRelicProcessionStore.getState()
    if (!playback.paused && controls.monkId !== null && world.procession.stage === "idle" && world.grounds) {
      const index = monks.findIndex(m => m.id === controls.monkId)
      const actor = world.states[index]
      if (actor) actor.buildingTask = undefined
      if (index === 0 || !actor || actor.flight || actor.preachingTask || useMonkEvangelismStore.getState().assigned.has(controls.monkId) || !startProcession(world.procession, controls.monkId, actor, world.grounds)) {
        useRelicProcessionStore.setState({ monkId: null, returnRequested: false })
      }
    }
    if (!playback.paused && world.procession.stage === "idle" && world.grounds) {
      const index = world.states.findIndex((s, index) => index !== 0 && !s.flight && !s.processionConsidered &&
        !s.preachingTask && !useMonkEvangelismStore.getState().assigned.has(monks[index].id) &&
        s.activity === "praying" && s.destination === "prayer" &&
        Math.hypot(s.x - world.grounds!.altar.x, s.z - world.grounds!.altar.z) < .01)
      if (index >= 0 && startAltarProcession(world.procession, monks[index].id, world.states[index], world.grounds, world.rng)) {
        useRelicProcessionStore.setState({ monkId: monks[index].id, stage: "lifting", returnRequested: false })
      }
    }
    // Advance the carrier first so every worshipper sees the same position this tick.
    const carrierIndex = monks.findIndex(m => m.id === world.procession.monkId)
    if (carrierIndex >= 0 && world.grounds && !playback.paused) {
      const actor = world.states[carrierIndex], group = groupRefs.current[carrierIndex]
      const x = actor.x, z = actor.z
      const exit = stepProcession(world.procession, actor, world.grounds, dt, monkWalkSpeed(characterScale), world.pick, controls.returnRequested)
      if (map.footpaths) recordWalkingPath(map.footpaths, map, { x, z }, actor)
      if (exit) { actor.route = exit; actor.pause = 0; actor.destination = "grounds"; actor.activity = "walking" }
      if (group) {
        group.userData.distance = Math.hypot(actor.x - x, actor.z - z)
        group.userData.moving = group.userData.distance > 0
        if (group.userData.moving) group.rotation.y = Math.atan2(actor.x - x, actor.z - z)
        else group.rotation.y = Math.atan2(world.grounds.centre.x - actor.x, world.grounds.centre.z - actor.z)
      }
      if (controls.stage !== world.procession.stage || controls.monkId !== world.procession.monkId) {
        useRelicProcessionStore.setState({ stage: world.procession.stage, monkId: world.procession.monkId,
          ...(exit ? { returnRequested: false } : {}) })
      }
    }
    const airborne = new Set<number>()
    for (let i = 0; i < world.states.length; i++) {
      const s = world.states[i]
      s.workScale = characterScale
      const group = groupRefs.current[i]
      if (!group) continue
      group.userData.initialized = true
      group.userData.phase = i / Math.max(1, monks.length)
      group.userData.playbackRate = playback.paused ? 0 : playback.speed
      if (i !== carrierIndex || playback.paused) group.userData.distance = 0
      if (s.flight) {
        if (!flying) recallMonkFlight(s.flight)
        airborne.add(monks[i].id)
      }
      group.userData.rocketPack = flying || !!s.flight
      const previousX = s.x, previousZ = s.z
      const inChurch = (i === 0 && !!keeperStation) || (!s.flight && !s.buildingTask && !s.preachingTask
        && s.activity === "praying" && s.destination === "prayer" && i !== carrierIndex)
      stepDevotion(s, dt, inChurch, inChurch && s.activity === "praying", useBalanceStore.getState().balance)
      if (i === 0 && keeperStation) {
        const sim = simRegistry.current
        const sameWorld = sim && sim.world.road === map.road
        const showing = sameWorld && world.procession.stage === "idle" && [...sim.travelers.values()]
          .some(visitor => visitor.activity === "visiting" && visitor.shrineSeat?.startsWith("queue-"))
        s.activity = showing ? "showingRelic" : "keepingRelic"
        group.userData.activity = s.activity
        group.userData.moving = false
        group.userData.rocketPack = false
        group.rotation.y = keeperStation.heading
        group.position.set(s.x, s.y, s.z)
        world.activities.set(monks[i].id, s.activity)
        world.stamina.set(monks[i].id, s.stamina)
        if (useMonkEvangelismStore.getState().assigned.has(monks[i].id)) useMonkEvangelismStore.getState().recall(monks[i].id)
        continue
      }
      if (playback.paused) continue
      if (i === carrierIndex) {
        if (dt > 0) blessByProcession(world.procession, `monk:${monks[i].id}`, s)
        const stage = world.procession.stage
        group.userData.activity = stage === "lifting" || stage === "lowering" ? "hoisting" : stage === "approaching" || stage === "idle" ? "walking" : "procession"
        if (stage === "lifting" || stage === "lowering") group.userData.moving = false
        group.userData.lowering = stage === "lowering"
        group.userData.actionProgress = world.procession.elapsed
        world.activities.set(monks[i].id, stage === "approaching" ? "collecting" : stage === "returning" || stage === "lowering" ? "returningRelic" : stage === "idle" ? "walking" : "procession")
        s.y = walkingSurface(map, s.x, s.z).height
        group.position.set(s.x, s.y, s.z)
        continue
      }
      const evangelismRequested = useMonkEvangelismStore.getState().assigned.has(monks[i].id)
      const praying = !evangelismRequested && !s.preachingTask && !s.flight && s.buildingTask?.purpose !== "rest" && nearProcession(world.procession, s, group.userData.activity === "praying")
      group.userData.moving = false
      if (praying && world.procession.position) {
        blessByProcession(world.procession, `monk:${monks[i].id}`, s)
        group.userData.activity = "praying"
        world.activities.set(monks[i].id, "praying")
        group.rotation.y = Math.atan2(world.procession.position.x - s.x, world.procession.position.z - s.z)
        group.position.set(s.x, s.y, s.z)
        continue
      }

      if (flying) {
        s.flightWait -= dt
        if (!evangelismRequested && !s.preachingTask && !s.flight && s.flightWait <= 0 && s.destination === "grounds" && s.activity === "resting" && !s.buildingTask && s.stamina > 25) {
          s.flight = createMonkFlight(s, world.pick(), map, world.flightRng)
        }
      }
      const wasFlying = !!s.flight
      if (s.flight) {
        const flight = s.flight
        for (let tick = 0; tick < playback.speed; tick++) {
          stepMonkFlight(flight, map, world.flightRng, Math.min(delta, 0.1))
        }
        s.x = flight.x
        s.y = flight.y
        s.z = flight.z
        const dx = flight.target.x - flight.x
        const dz = flight.target.z - flight.z
        if (Math.hypot(dx, dz) > 0.001) {
          const heading = Math.atan2(dx, dz)
          const turn = Math.atan2(Math.sin(heading - group.rotation.y), Math.cos(heading - group.rotation.y))
          group.rotation.y += turn * Math.min(1, dt * 5)
        }
        group.rotation.x = flight.phase === "cruising" || flight.phase === "returning" ? 0.15 : 0
        group.position.set(flight.x, flight.y, flight.z)
        if (flight.phase !== "landed") {
          airborne.add(monks[i].id)
          group.userData.activity = "flying"
          world.activities.set(monks[i].id, "flying")
          continue
        }
        s.flight = undefined
        airborne.delete(monks[i].id)
        group.userData.rocketPack = flying
        s.flightWait = monkGroundTime(world.flightRng)
        s.route = []
        s.pause = 2 + world.rng() * 5
        s.activity = "resting"
        s.destination = "grounds"
        s.outings = 0
      }
      group.rotation.x = 0

      const groundSpeed = monkWalkSpeed(characterScale) * fordSpeedAt(map, s.x, s.z)
      const evangelizing = stepMonkEvangelism(s, map, evangelismRequested, groundSpeed, dt,
        world.states.filter(other => other !== s && other.preachingTask).map(other => other.preachingTask!.tile))
      if (evangelismRequested && !evangelizing) useMonkEvangelismStore.getState().recall(monks[i].id)
      if (!evangelizing && !stepMonkWork(s, map, groundSpeed, dt))
        stepMonkRoutine(s, world.wander, world.rng, groundSpeed, dt)
      if (map.footpaths && !wasFlying) recordWalkingPath(map.footpaths, map, { x: previousX, z: previousZ }, s)
      world.stamina.set(monks[i].id, s.stamina)
      if (s.buildingTask && (s.activity === "building" || s.activity === "sleeping")) group.rotation.y = s.buildingTask.heading
      group.userData.activity = s.activity
      world.activities.set(monks[i].id, s.activity)
      if (s.activity === "preaching" && s.preachingTask) {
        group.rotation.y = s.preachingTask.heading
      } else if (s.activity === "praying" && world.centre) {
        group.rotation.y = Math.atan2(world.centre.x - s.x, world.centre.z - s.z)
      } else if (Math.hypot(s.x - previousX, s.z - previousZ) > 0) {
        group.rotation.y = Math.atan2(s.x - previousX, s.z - previousZ)
      }
      const y = walkingSurface(map, s.x, s.z).height
      s.y = y
      group.position.set(s.x, y, s.z)
      group.userData.distance = Math.hypot(s.x - previousX, s.z - previousZ)
      group.userData.moving = group.userData.distance > 0
    }
    if (airborne.size !== airborneIds.size || [...airborne].some(id => !airborneIds.has(id))) setAirborneIds(airborne)
  }, -3)

  if (world.spots.length === 0) return null

  return (
    <group>
      <PixelCharacters><PietyEffects procession={world.procession} characterScale={characterScale} /></PixelCharacters>
      {monks.map((monk, index) => {
        const id = new THREE.Color(...encodeObjectId(residentObjectId(index)))
        const selected = isSelected(selection, { kind: "monk", id: monk.id })
        const select = (event: { delta: number; stopPropagation: () => void; intersections?: Array<{ object: THREE.Object3D }> }) => {
          // Generous body targets overlap both the carried relic and the altar
          // in front of its keeper. Their actual surfaces take click priority.
          const relicHit = event.intersections?.some(hit => {
            for (let object: THREE.Object3D | null = hit.object; object; object = object.parent) {
              if (object.name === "relic" || object.name === "relic-altar") return true
            }
            return false
          })
          selectElement(relicHit ? { kind: "relic" } : { kind: "monk", id: monk.id }, event)
        }
        const equipped = index !== 0 && (flying || airborneIds.has(monk.id))
        return (
          <group
            key={monk.id}
            ref={(node) => {
              markPerson(node)
              groupRefs.current[index] = node
            }}
          >
            <SceneAssetBoundary>
              <CharacterSprite map={map} name="monk" type="friar" characterModel="base" characterScale={characterScale}
                complexion={monk.complexion}
                visualOverride={equipped ? rocketMonkVisual(monk.attributes.age) : monkVisual(monk.attributes.age)}
                flightClip={equipped ? rocketFlightClip(monk.attributes.age) : undefined} attachment={{ ...monkRelicAttachment(monk.attributes.age),
                  restPosition: world.centre ? [world.centre.x, walkingSurface(map, world.centre.x, world.centre.z).height + RELIC_DISPLAY_HEIGHT - .12, world.centre.z] : undefined,
                  content: <RelicDisplay color={relic.color} height={0.12} groundGlow={false} trayWidth={monkRelicTrayWidth(characterScale)}
                    idColor={new THREE.Color(...encodeObjectId(RELIC_OBJECT_ID))}
                    onClick={event => selectElement({ kind: "relic" }, event)} /> }} selected={selected} onClick={select}
                outlineColor={[id.r, id.g, id.b]}
                walkTuning={MONK_WALK_TUNING} />
            </SceneAssetBoundary>
            <CharacterHitTarget onClick={select} />
            {selected && <CharacterSelectionOutline flying={airborneIds.has(monk.id)} />}
          </group>
        )
      })}
    </group>
  )
}
