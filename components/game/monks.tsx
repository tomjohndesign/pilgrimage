"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { TERRAIN, TILE_HEIGHT } from "@/lib/game/map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import { monkRegistry, type Monk, type MonkActivity } from "@/lib/game/monks"
import { deriveSeed, makeRng, SEED_STREAM } from "@/lib/game/rng"
import { encodeObjectId, OUTLINE_ID_LAYER_MASK, residentObjectId } from "@/lib/game/render/outline"

/**
 * The brothers, always about the hovel: they drift between the open tiles
 * around it, stand a while, and drift on — enough that the place is plainly
 * lived in. Ambient motion only; they aren't in the traveler sim. Click one
 * to select him — the HUD names him and his office.
 */

const BODY: [number, number, number] = [0.3, 0.55, 0.3]
/** The bare crown of a tonsure, so a monk reads differently from a friar on the road. */
const CROWN: [number, number, number] = [0.14, 0.05, 0.14]
const HABIT_COLOR = "#4e4034"
const CROWN_COLOR = "#d7b58e"

/** How far from the footprint the brothers will wander, in tiles. */
const WANDER_RADIUS = 3
const WALK_SPEED = 0.7
const PAUSE_MIN_SECONDS = 2
const PAUSE_MAX_SECONDS = 7
/** Standing within this many tiles of the hovel's centre counts as keeping vigil. */
const VIGIL_RADIUS = 1.8

/** A click that dragged further than this many pixels is a pan, not a select. */
const CLICK_SLOP_PX = 6

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
      if (inFootprint) continue
      const terrain = tileAt(map, x, z)
      if (!terrain || !TERRAIN[terrain].passable || terrain === "forest") continue
      spots.push({ x: tileToWorldX(map, x), y: TILE_HEIGHT, z: tileToWorldZ(map, z) })
    }
  }
  return { spots, centre }
}

export function Monks({ map, monks }: { map: GameMap; monks: Monk[] }) {
  const selection = useCameraStore((s) => s.selection)
  const groupRefs = useRef<Array<THREE.Group | null>>([])

  const world = useMemo(() => {
    const { spots, centre } = wanderSpots(map)
    const rng = makeRng(deriveSeed(map.seed ?? 0, SEED_STREAM.monkWander))
    const pick = (): Spot => {
      const spot = spots[Math.floor(rng() * spots.length)]
      // Jitter within the tile so two brothers never stand on the same spot.
      return { x: spot.x + (rng() - 0.5) * 0.5, y: spot.y, z: spot.z + (rng() - 0.5) * 0.5 }
    }
    const states: MonkState[] = monks.map(() => {
      const start = pick()
      return { ...start, target: pick(), pause: rng() * PAUSE_MAX_SECONDS }
    })
    const activities = new Map<number, MonkActivity>()
    return { spots, centre, rng, pick, states, activities }
  }, [map, monks])

  // Publish activities so the HUD's monk panel can poll them.
  useEffect(() => {
    monkRegistry.current = world.activities
    return () => {
      if (monkRegistry.current === world.activities) monkRegistry.current = null
    }
  }, [world])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    for (let i = 0; i < world.states.length; i++) {
      const s = world.states[i]
      const group = groupRefs.current[i]
      if (!group) continue

      if (s.pause > 0) {
        s.pause -= dt
        const nearRelic =
          !!world.centre && Math.hypot(s.x - world.centre.x, s.z - world.centre.z) <= VIGIL_RADIUS
        world.activities.set(monks[i].id, nearRelic ? "vigil" : "resting")
      } else {
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
      group.position.set(s.x, s.y, s.z)
    }
  })

  if (world.spots.length === 0) return null

  return (
    <group>
      {monks.map((monk, index) => {
        const id = new THREE.Color(...encodeObjectId(residentObjectId(index)))
        const selected = isSelected(selection, { kind: "monk", id: monk.id })
        const select = (event: { delta: number; stopPropagation: () => void }) => {
          if (event.delta > CLICK_SLOP_PX) return
          event.stopPropagation()
          useCameraStore.getState().select(selected ? null : { kind: "monk", id: monk.id })
        }
        return (
          <group
            key={monk.id}
            ref={(node) => {
              groupRefs.current[index] = node
            }}
          >
            <mesh name="monk" position={[0, BODY[1] / 2, 0]} onClick={select}>
              <boxGeometry args={BODY} />
              <meshLambertMaterial color={HABIT_COLOR} />
            </mesh>
            <mesh position={[0, BODY[1] + CROWN[1] / 2, 0]} onClick={select}>
              <boxGeometry args={CROWN} />
              <meshLambertMaterial color={CROWN_COLOR} />
            </mesh>
            <mesh position={[0, BODY[1] / 2, 0]} layers-mask={OUTLINE_ID_LAYER_MASK}>
              <boxGeometry args={BODY} />
              <meshBasicMaterial color={id} toneMapped={false} />
            </mesh>
            {selected && (
              <mesh position={[0, BODY[1] + 0.35, 0]}>
                <boxGeometry args={[0.2, 0.05, 0.2]} />
                <meshBasicMaterial color="#d8a93f" />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}
