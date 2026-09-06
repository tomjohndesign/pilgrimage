"use client"

import { walkingSurface } from "@/lib/game/map/walking-surface"

import { createMonkRoutine, stepMonkRoutine, type MonkRoutine } from "@/lib/game/monk-routine"
import { monkWander, type WanderSpot } from "@/lib/game/monk-wander"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { useSimulationStore } from "@/lib/game/simulation-store"
import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { selectElement } from "@/lib/game/selection"
import { CharacterHitTarget, CharacterSelectionShadow } from "./character-selection"
import type { GameMap } from "@/lib/game/map/types"
import { monkRegistry, type Monk, type MonkActivity } from "@/lib/game/monks"
import { createMonkFlight, monkGroundTime, recallMonkFlight, stepMonkFlight, type MonkFlight } from "@/lib/game/monk-flight"
import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { encodeObjectId, residentObjectId } from "@/lib/game/render/outline"
import { CharacterSprite } from "./character-sprite"
import { monkVisual, monkWalkSpeed, MONK_WALK_TUNING } from "@/lib/game/base-person/monk-assets"
import { rocketMonkVisual, rocketFlightClip } from "@/lib/game/rocket/assets"

/**
 * The brothers follow the grid around the shrine and regularly enter through
 * its gates to kneel beside the relic. Ambient motion only; they aren't in the traveler sim. Click one
 * to select him — the HUD names him and his office. Blaster Pastor sends them
 * on occasional cruises across the map; they return to their life at the shrine
 * between trips. Toggling it off recalls them and stows their packs on landing.
 */

interface MonkState extends MonkRoutine {
  flight?: MonkFlight
  flightWait: number
}

export function Monks({ map, monks, flying = false, characterScale = 1 }: { map: GameMap; monks: Monk[]; flying?: boolean; characterScale?: number }) {
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
    const states: MonkState[] = (spots.length ? monks : []).map((_, index) => ({
      ...createMonkRoutine(wander, index, rng), flightWait: index * 8,
    }))
    const activities = new Map<number, MonkActivity>()
    return { spots, centre, rng, flightRng, pick, states, activities, wander }
  }, [map, monks])

  // Publish activities so the HUD's monk panel can poll them.
  useEffect(() => {
    monkRegistry.current = world.activities
    return () => {
      if (monkRegistry.current === world.activities) monkRegistry.current = null
    }
  }, [world])

  useFrame((_, delta) => {
    const playback = useSimulationStore.getState()
    const dt = playback.paused ? 0 : Math.min(delta, 0.1) * playback.speed
    const airborne = new Set<number>()
    for (let i = 0; i < world.states.length; i++) {
      const s = world.states[i]
      const group = groupRefs.current[i]
      if (!group) continue
      group.userData.initialized = true
      group.userData.phase = i / Math.max(1, monks.length)
      group.userData.playbackRate = playback.paused ? 0 : playback.speed
      group.userData.distance = 0
      if (s.flight) {
        if (!flying) recallMonkFlight(s.flight)
        airborne.add(monks[i].id)
      }
      group.userData.rocketPack = flying || !!s.flight
      const previousX = s.x, previousZ = s.z
      if (playback.paused) continue
      group.userData.moving = false

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
    if (airborne.size !== airborneIds.size || [...airborne].some(id => !airborneIds.has(id))) setAirborneIds(airborne)
  }, -3)

  if (world.spots.length === 0) return null

  return (
    <group>
      {monks.map((monk, index) => {
        const id = new THREE.Color(...encodeObjectId(residentObjectId(index)))
        const selected = isSelected(selection, { kind: "monk", id: monk.id })
        const select = (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "monk", id: monk.id }, event)
        const equipped = flying || airborneIds.has(monk.id)
        return (
          <group
            key={monk.id}
            ref={(node) => {
              groupRefs.current[index] = node
            }}
          >
            <Suspense fallback={null}>
              <CharacterSprite map={map} name="monk" type="friar" characterModel="base" characterScale={characterScale}
                visualOverride={equipped ? rocketMonkVisual(monk.attributes.age) : monkVisual(monk.attributes.age)}
                flightClip={equipped ? rocketFlightClip(monk.attributes.age) : undefined} selected={selected} onClick={select}
                outlineColor={[id.r, id.g, id.b]}
                walkTuning={MONK_WALK_TUNING} />
            </Suspense>
            <CharacterHitTarget onClick={select} />
            {selected && <CharacterSelectionShadow map={map} flying={airborneIds.has(monk.id)} />}
          </group>
        )
      })}
    </group>
  )
}
