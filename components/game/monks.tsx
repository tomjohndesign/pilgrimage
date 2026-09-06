"use client"

import { groundHeight } from "@/lib/game/map/elevation"
import { bridgeLayout } from "@/lib/game/map/bridges"

import { buildingAt } from "@/lib/game/settlement"
import { Suspense, useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { useSimulationStore } from "@/lib/game/simulation-store"
import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { selectElement } from "@/lib/game/selection"
import { CharacterHitTarget, CharacterSelectionShadow } from "./character-selection"
import { surfaceHeight } from "@/lib/game/map/bridges"
import { TERRAIN } from "@/lib/game/map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import { monkRegistry, type Monk, type MonkActivity } from "@/lib/game/monks"
import { createMonkFlight, monkGroundTime, stepMonkFlight, type MonkFlight } from "@/lib/game/monk-flight"
import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { encodeObjectId, residentObjectId } from "@/lib/game/render/outline"
import { CharacterSprite } from "./character-sprite"
import { MONK_VISUAL } from "@/lib/game/base-person/monk-assets"
import { MonkRocketGear, ROCKET_EXHAUST_NAME } from "./monk-rocket-gear"

/**
 * The brothers drift between the open tiles around the hovel,
 * stand a while, and drift on — enough that the place is plainly
 * lived in. Ambient motion only; they aren't in the traveler sim. Click one
 * to select him — the HUD names him and his office. Blaster Pastor sends them
 * on occasional cruises across the map; they return to their life at the shrine
 * between trips, keeping their rocket-powered gear equipped.
 */

/** How far from the footprint the brothers will wander, in tiles. */
const WANDER_RADIUS = 3
const WALK_SPEED = 0.22
const PAUSE_MIN_SECONDS = 2
const PAUSE_MAX_SECONDS = 7
/** Standing within this many tiles of the hovel's centre counts as keeping vigil. */
const VIGIL_RADIUS = 1.8

interface Spot {
  x: number
  y: number
  z: number
}

interface MonkState {
  x: number
  y: number
  z: number
  target: Spot
  pause: number
  flight?: MonkFlight
  flightWait: number
}

/** Open ground around the hovel a monk may stand on: never the walls, never the woods. */
function wanderSpots(map: GameMap): { spots: Spot[]; centre: { x: number; z: number } | null } {
  const hovel = map.buildings.find((b) => b.id === map.site?.hovelId)
  if (!hovel) return { spots: [], centre: null }
  const centre = {
    x: tileToWorldX(map, hovel.x) + (hovel.w - 1) / 2,
    z: tileToWorldZ(map, hovel.z) + (hovel.d - 1) / 2,
  }
  const spots: Spot[] = []
  for (let z = hovel.z - WANDER_RADIUS; z < hovel.z + hovel.d + WANDER_RADIUS; z++) {
    for (let x = hovel.x - WANDER_RADIUS; x < hovel.x + hovel.w + WANDER_RADIUS; x++) {
      const inFootprint = x >= hovel.x && x < hovel.x + hovel.w && z >= hovel.z && z < hovel.z + hovel.d
      if (inFootprint || buildingAt(map, x, z)) continue
      const terrain = tileAt(map, x, z)
      if (!terrain || !TERRAIN[terrain].passable || terrain === "forest") continue
      spots.push({ x: tileToWorldX(map, x), y: surfaceHeight(map, x, z), z: tileToWorldZ(map, z) })
    }
  }
  return { spots, centre }
}

export function Monks({ map, monks, flying = false, characterScale = 1 }: { map: GameMap; monks: Monk[]; flying?: boolean; characterScale?: number }) {
  const selection = useCameraStore((s) => s.selection)
  const groupRefs = useRef<Array<THREE.Group | null>>([])

  const world = useMemo(() => {
    const { spots, centre } = wanderSpots(map)
    const rng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.monkWander))
    const flightRng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.monkFlight))
    const pick = (): Spot => {
      const spot = spots[Math.floor(rng() * spots.length)]
      // Jitter within the tile so two brothers never stand on the same spot.
      return { x: spot.x + (rng() - 0.5) * 0.5, y: spot.y, z: spot.z + (rng() - 0.5) * 0.5 }
    }
    const states: MonkState[] = (spots.length ? monks : []).map((_, index) => {
      const start = pick()
      // One immediate demonstration; the other brothers take off in their own time.
      return { ...start, target: pick(), pause: rng() * PAUSE_MAX_SECONDS, flightWait: index * 8 }
    })
    const activities = new Map<number, MonkActivity>()
    return { spots, centre, rng, flightRng, pick, states, activities }
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
        s.target = world.pick()
        s.pause = PAUSE_MIN_SECONDS + world.rng() * (PAUSE_MAX_SECONDS - PAUSE_MIN_SECONDS)
      }
      if (exhaust) exhaust.visible = false
      group.rotation.x = 0

      if (s.pause > 0) {
        s.pause -= dt
        const nearRelic =
          !!world.centre && Math.hypot(s.x - world.centre.x, s.z - world.centre.z) <= VIGIL_RADIUS
        group.userData.activity = nearRelic ? "vigil" : "resting"
        world.activities.set(monks[i].id, group.userData.activity)
        if (nearRelic && world.centre) group.rotation.y = Math.atan2(world.centre.x - s.x, world.centre.z - s.z)
      } else {
        group.userData.activity = "walking"
        world.activities.set(monks[i].id, "walking")
        const dx = s.target.x - s.x
        const dz = s.target.z - s.z
        const dist = Math.hypot(dx, dz)
        const step = WALK_SPEED * dt
        if (dist <= step) {
          s.x = s.target.x
          s.z = s.target.z
          s.y = s.target.y
          s.target = world.pick()
          s.pause = PAUSE_MIN_SECONDS + world.rng() * (PAUSE_MAX_SECONDS - PAUSE_MIN_SECONDS)
        } else {
          s.x += (dx / dist) * step
          s.z += (dz / dist) * step
          s.y += (s.target.y - s.y) * Math.min(1, step / dist)
          group.rotation.y = Math.atan2(dx, dz)
        }
      }
      const tx = Math.floor(s.x + map.width / 2), tz = Math.floor(s.z + map.depth / 2)
      const bridge = bridgeLayout(map).rise[tz * map.width + tx]
      const y = map.elevation && !bridge
        ? groundHeight(map, s.x + map.width / 2 - 0.5, s.z + map.depth / 2 - 0.5) : s.y
      group.position.set(s.x, y, s.z)
      group.userData.distance = Math.hypot(s.x - previousX, s.z - previousZ)
      group.userData.moving = group.userData.distance > 0
    }
  })

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
              <CharacterSprite name="monk" type="friar" characterModel="base" characterScale={characterScale}
                visualOverride={MONK_VISUAL} selected={selected} onClick={select}
                outlineColor={[id.r, id.g, id.b]}
                walkTuning={{ sync: true, stride: 0.44 }} />
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
