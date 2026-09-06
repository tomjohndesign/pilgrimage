"use client"

import { walkingSurface } from "@/lib/game/map/walking-surface"

import { createRelicProcession, nearProcession, processionGrounds, processionRegistry, startProcession, stepProcession } from "@/lib/game/relic-procession"
import { useRelicProcessionStore } from "@/lib/game/relic-procession-store"
import type { Relic } from "@/lib/game/relic"
import { RelicDisplay, RELIC_DISPLAY_HEIGHT } from "./relic-display"

import { createMonkRoutine, stepMonkRoutine, type MonkRoutine } from "@/lib/game/monk-routine"
import { monkWander, type WanderSpot } from "@/lib/game/monk-wander"
import { Suspense, useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { useSimulationStore } from "@/lib/game/simulation-store"
import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { selectElement } from "@/lib/game/selection"
import { CharacterHitTarget, CharacterSelectionShadow } from "./character-selection"
import type { GameMap } from "@/lib/game/map/types"
import { monkRegistry, type Monk, type MonkActivity } from "@/lib/game/monks"
import { createMonkFlight, monkGroundTime, stepMonkFlight, type MonkFlight } from "@/lib/game/monk-flight"
import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { encodeObjectId, residentObjectId, RELIC_OBJECT_ID } from "@/lib/game/render/outline"
import { CharacterSprite } from "./character-sprite"
import { monkVisual, monkWalkSpeed, monkRelicAttachment, monkRelicTrayWidth, MONK_WALK_TUNING } from "@/lib/game/base-person/monk-assets"
import { MonkRocketGear, ROCKET_EXHAUST_NAME } from "./monk-rocket-gear"

/**
 * The brothers follow grid routes and enter the shrine to pray. Players can
 * send one to carry the relic, drawing nearby monks and travelers into prayer.
 * Blaster Pastor sends them
 * on occasional cruises across the map; they return to their life at the shrine
 * between trips, keeping their rocket-powered gear equipped.
 */

interface MonkState extends MonkRoutine {
  flight?: MonkFlight
  flightWait: number
}

export function Monks({ map, monks, relic, flying = false, characterScale = 1 }: { map: GameMap; monks: Monk[]; relic: Relic; flying?: boolean; characterScale?: number }) {
  const selection = useCameraStore((s) => s.selection)
  const groupRefs = useRef<Array<THREE.Group | null>>([])

  const world = useMemo(() => {
    const wander = monkWander(map)
    const { spots, centre } = wander
    const rng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.monkWander))
    const flightRng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.monkFlight))
    const pick = (): WanderSpot => {
      const spot = spots[Math.floor(rng() * spots.length)]
      return spot
    }
    const states: MonkState[] = (spots.length ? monks : []).map((_, index) => ({
      ...createMonkRoutine(wander, index, rng), flightWait: index * 8,
    }))
    const activities = new Map<number, MonkActivity>()
    return { spots, centre, rng, flightRng, pick, states, activities, wander,
      procession: createRelicProcession(), grounds: processionGrounds(map, wander) }
  }, [map, monks])

  // Publish activities so the HUD's monk panel can poll them.
  useEffect(() => {
    monkRegistry.current = world.activities
    processionRegistry.current = world.procession
    useRelicProcessionStore.setState({ available: !!world.grounds, monkId: null, stage: "idle", returnRequested: false })
    return () => {
      if (monkRegistry.current === world.activities) monkRegistry.current = null
      if (processionRegistry.current === world.procession) {
        processionRegistry.current = null
        useRelicProcessionStore.setState({ available: false, monkId: null, stage: "idle", returnRequested: false })
      }
    }
  }, [world])

  useFrame((_, delta) => {
    const playback = useSimulationStore.getState()
    const dt = playback.paused ? 0 : Math.min(delta, 0.1) * playback.speed
    const controls = useRelicProcessionStore.getState()
    if (!playback.paused && controls.monkId !== null && world.procession.stage === "idle" && world.grounds) {
      const index = monks.findIndex(m => m.id === controls.monkId)
      const actor = world.states[index]
      if (!actor || actor.flight || !startProcession(world.procession, controls.monkId, actor, world.grounds)) {
        useRelicProcessionStore.setState({ monkId: null, returnRequested: false })
      }
    }
    // Advance the carrier first so every worshipper sees the same position this tick.
    const carrierIndex = monks.findIndex(m => m.id === world.procession.monkId)
    if (carrierIndex >= 0 && world.grounds && !playback.paused) {
      const actor = world.states[carrierIndex], group = groupRefs.current[carrierIndex]
      const x = actor.x, z = actor.z
      const exit = stepProcession(world.procession, actor, world.grounds, dt, monkWalkSpeed(characterScale), world.pick, controls.returnRequested)
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
    for (let i = 0; i < world.states.length; i++) {
      const s = world.states[i]
      const group = groupRefs.current[i]
      if (!group) continue
      group.userData.initialized = true
      group.userData.phase = i / Math.max(1, monks.length)
      group.userData.playbackRate = playback.paused ? 0 : playback.speed
      if (i !== carrierIndex || playback.paused) group.userData.distance = 0
      const previousX = s.x, previousZ = s.z
      if (playback.paused) continue
      if (i === carrierIndex) {
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
      const praying = !s.flight && nearProcession(world.procession, s, group.userData.activity === "praying")
      group.userData.moving = false
      if (praying && world.procession.position) {
        group.userData.activity = "praying"
        world.activities.set(monks[i].id, "praying")
        group.rotation.y = Math.atan2(world.procession.position.x - s.x, world.procession.position.z - s.z)
        group.position.set(s.x, s.y, s.z)
        continue
      }

      const exhaust = group.getObjectByName(ROCKET_EXHAUST_NAME)
      if (flying) {
        s.flightWait -= dt
        if (!s.flight && s.flightWait <= 0 && s.destination === "grounds" && s.activity === "resting") {
          s.flight = createMonkFlight(s, world.pick(), map, world.flightRng)
        }
      }
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
          if (exhaust) exhaust.visible = true
          group.userData.activity = "flying"
          world.activities.set(monks[i].id, "flying")
          continue
        }
        s.flight = undefined
        s.flightWait = monkGroundTime(world.flightRng)
        s.route = []
        s.pause = 2 + world.rng() * 5
        s.activity = "resting"
        s.destination = "grounds"
        s.outings = 0
      }
      if (exhaust) exhaust.visible = false
      group.rotation.x = 0

      stepMonkRoutine(s, world.wander, world.rng, monkWalkSpeed(characterScale), dt)
      group.userData.activity = s.activity
      world.activities.set(monks[i].id, s.activity)
      if (s.activity === "praying" && world.centre) {
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
  }, -3)

  if (world.spots.length === 0) return null

  return (
    <group>
      {monks.map((monk, index) => {
        const id = new THREE.Color(...encodeObjectId(residentObjectId(index)))
        const selected = isSelected(selection, { kind: "monk", id: monk.id })
        const select = (event: { delta: number; stopPropagation: () => void; intersections?: Array<{ object: THREE.Object3D }> }) => {
          // The generous body hit target overlaps the raised hands. Give the
          // visible reliquary priority when the ray also hits its actual mesh.
          const relicHit = event.intersections?.some(hit => hit.object.name === "relic")
          selectElement(relicHit ? { kind: "relic" } : { kind: "monk", id: monk.id }, event)
        }
        return (
          <group
            key={monk.id}
            ref={(node) => {
              groupRefs.current[index] = node
            }}
          >
            <Suspense fallback={null}>
              <CharacterSprite map={map} name="monk" type="friar" characterModel="base" characterScale={characterScale}
                visualOverride={monkVisual(monk.attributes.age)} attachment={{ ...monkRelicAttachment(monk.attributes.age),
                  restPosition: world.centre ? [world.centre.x, walkingSurface(map, world.centre.x, world.centre.z).height + RELIC_DISPLAY_HEIGHT - .12, world.centre.z] : undefined,
                  content: <RelicDisplay color={relic.color} height={0.12} groundGlow={false} trayWidth={monkRelicTrayWidth(characterScale)}
                    idColor={new THREE.Color(...encodeObjectId(RELIC_OBJECT_ID))}
                    onClick={event => selectElement({ kind: "relic" }, event)} /> }} selected={selected} onClick={select}
                outlineColor={[id.r, id.g, id.b]}
                walkTuning={MONK_WALK_TUNING} />
            </Suspense>
            {flying && <MonkRocketGear phase={index} outlineColor={id} onClick={select} />}
            <CharacterHitTarget onClick={select} />
            {selected && <CharacterSelectionShadow map={map} flying={flying} />}
          </group>
        )
      })}
    </group>
  )
}
