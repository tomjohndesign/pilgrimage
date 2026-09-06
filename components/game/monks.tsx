"use client"

import { walkingSurface } from "@/lib/game/map/walking-surface"

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
import { encodeObjectId, residentObjectId } from "@/lib/game/render/outline"
import { CharacterSprite } from "./character-sprite"
import { monkVisual, monkWalkSpeed, MONK_WALK_TUNING } from "@/lib/game/base-person/monk-assets"
import { MonkRocketGear, ROCKET_EXHAUST_NAME } from "./monk-rocket-gear"

/**
 * The brothers drift between the open tiles around the hovel,
 * stand a while, and drift on — enough that the place is plainly
 * lived in. Ambient motion only; they aren't in the traveler sim. Click one
 * to select him — the HUD names him and his office. Blaster Pastor sends them
 * on occasional cruises across the map; they return to their life at the shrine
 * between trips, keeping their rocket-powered gear equipped.
 */

const PAUSE_MIN_SECONDS = 2
const PAUSE_MAX_SECONDS = 7
/** Extra distance beyond the hovel’s half-width that counts as keeping vigil. */
const VIGIL_MARGIN = 1.1

interface MonkState {
  x: number
  y: number
  z: number
  route: WanderSpot[]
  pause: number
  flight?: MonkFlight
  flightWait: number
}

export function Monks({ map, monks, flying = false, characterScale = 1 }: { map: GameMap; monks: Monk[]; flying?: boolean; characterScale?: number }) {
  const selection = useCameraStore((s) => s.selection)
  const groupRefs = useRef<Array<THREE.Group | null>>([])

  const world = useMemo(() => {
    const wander = monkWander(map)
    const { spots, centre } = wander
    const rng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.monkWander))
    const flightRng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.monkFlight))
    const pick = (): WanderSpot => {
      const spot = spots[Math.floor(rng() * spots.length)]
      // Jitter within the tile so two brothers never stand on the same spot.
      const x = spot.x + (rng() - 0.5) * 0.5, z = spot.z + (rng() - 0.5) * 0.5
      return { x, y: walkingSurface(map, x, z).height, z }
    }
    const states: MonkState[] = (spots.length ? monks : []).map((_, index) => {
      const start = pick()
      // One immediate demonstration; the other brothers take off in their own time.
      return { ...start, route: wander.route(start, pick()), pause: rng() * PAUSE_MAX_SECONDS, flightWait: index * 8 }
    })
    const activities = new Map<number, MonkActivity>()
    const hovel = map.buildings.find(b => b.id === map.site?.hovelId)
    const vigilRadius = (hovel ? Math.max(hovel.w, hovel.d) / 2 : 0.7) + VIGIL_MARGIN
    return { spots, centre, rng, flightRng, pick, states, activities, wander, vigilRadius }
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
    for (let i = 0; i < world.states.length; i++) {
      const s = world.states[i]
      const group = groupRefs.current[i]
      if (!group) continue
      group.userData.initialized = true
      group.userData.phase = i / Math.max(1, monks.length)
      group.userData.playbackRate = playback.paused ? 0 : playback.speed
      group.userData.distance = 0
      const previousX = s.x, previousZ = s.z
      if (playback.paused) continue
      group.userData.moving = false

      const exhaust = group.getObjectByName(ROCKET_EXHAUST_NAME)
      if (flying) {
        s.flightWait -= dt
        if (!s.flight && s.flightWait <= 0) {
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
        s.route = world.wander.route(s, world.pick())
        s.pause = PAUSE_MIN_SECONDS + world.rng() * (PAUSE_MAX_SECONDS - PAUSE_MIN_SECONDS)
      }
      if (exhaust) exhaust.visible = false
      group.rotation.x = 0

      if (s.pause > 0) {
        s.pause -= dt
        const nearRelic =
          !!world.centre && Math.hypot(s.x - world.centre.x, s.z - world.centre.z) <= world.vigilRadius
        group.userData.activity = nearRelic ? "vigil" : "resting"
        world.activities.set(monks[i].id, group.userData.activity)
        if (nearRelic && world.centre) group.rotation.y = Math.atan2(world.centre.x - s.x, world.centre.z - s.z)
      } else {
        group.userData.activity = "walking"
        world.activities.set(monks[i].id, "walking")
        const target = s.route[0] ?? s
        const dx = target.x - s.x
        const dz = target.z - s.z
        const dist = Math.hypot(dx, dz)
        const step = monkWalkSpeed(characterScale) * dt
        if (dist <= step) {
          s.x = target.x
          s.z = target.z
          s.y = target.y
          s.route.shift()
          if (!s.route.length) {
            s.route = world.wander.route(s, world.pick())
            s.pause = PAUSE_MIN_SECONDS + world.rng() * (PAUSE_MAX_SECONDS - PAUSE_MIN_SECONDS)
          }
        } else {
          s.x += (dx / dist) * step
          s.z += (dz / dist) * step
          s.y += (target.y - s.y) * Math.min(1, step / dist)
          group.rotation.y = Math.atan2(dx, dz)
        }
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
        const select = (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "monk", id: monk.id }, event)
        return (
          <group
            key={monk.id}
            ref={(node) => {
              groupRefs.current[index] = node
            }}
          >
            <Suspense fallback={null}>
              <CharacterSprite map={map} name="monk" type="friar" characterModel="base" characterScale={characterScale}
                visualOverride={monkVisual(monk.attributes.age)} selected={selected} onClick={select}
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
