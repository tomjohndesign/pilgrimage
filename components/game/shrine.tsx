"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { selectElement } from "@/lib/game/selection"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import type { Relic } from "@/lib/game/relic"
import {
  buildingObjectId,
  encodeObjectId,
  OUTLINE_ID_LAYER_MASK,
  RELIC_OBJECT_ID,
} from "@/lib/game/render/outline"

/**
 * The monks' hovel: four low walls with a doorway toward the track, a ring of
 * thatch around an open centre, and the relic on a plinth in the middle where
 * the sky can see it. It pulses — faintly — so the eye finds it from any zoom.
 * The building and the relic have separate selections and inspectors.
 */

const WALL_HEIGHT = 0.6
const WALL_THICKNESS = 0.16
/** Walls sit this far from the footprint centre; the roof overhangs a little. */
const WALL_HALF = 0.85
const ROOF_HALF = 0.95
/** Half-width of the opening in the roof and of the doorway in the wall. */
const OPENING_HALF = 0.4
const DOOR_HALF = 0.3
const ROOF_THICKNESS = 0.1
const FLOOR_THICKNESS = 0.05

const PLINTH: [number, number, number] = [0.3, 0.22, 0.3]
const RELIC_SIZE = 0.16
const HALO_RADIUS = 0.26

/** Pulse: slow and shallow, a breath rather than a beacon. */
const PULSE_PERIOD_SECONDS = 3.2
const EMISSIVE_BASE = 0.35
const EMISSIVE_SWING = 0.15
const HALO_BASE = 0.07
const HALO_SWING = 0.05
const LIGHT_BASE = 0.55
const LIGHT_SWING = 0.2

const WALL_COLOR = "#8c7658"
const FLOOR_COLOR = "#5a4a38"
const PLINTH_COLOR = "#9a958a"
const HALO_COLOR = "#f6e7b0"
const LIGHT_COLOR = "#ffd98a"

type Side = "north" | "south" | "west" | "east"

interface Piece {
  args: [number, number, number]
  position: [number, number, number]
  color: string
}

/** Wall segments for one side, split around the doorway when it's the door side. */
function wallPieces(side: Side, hasDoor: boolean): Piece[] {
  const along = WALL_HALF * 2 + WALL_THICKNESS
  const y = WALL_HEIGHT / 2
  const place = (offset: number, length: number): Piece => {
    const horizontal = side === "north" || side === "south"
    const fixed = side === "north" || side === "west" ? -WALL_HALF : WALL_HALF
    return {
      args: horizontal ? [length, WALL_HEIGHT, WALL_THICKNESS] : [WALL_THICKNESS, WALL_HEIGHT, length],
      position: horizontal ? [offset, y, fixed] : [fixed, y, offset],
      color: WALL_COLOR,
    }
  }
  if (!hasDoor) return [place(0, along)]
  const segment = along / 2 - DOOR_HALF
  const centre = DOOR_HALF + segment / 2
  return [place(-centre, segment), place(centre, segment)]
}

function roofPieces(roofColor: string): Piece[] {
  const y = WALL_HEIGHT + ROOF_THICKNESS / 2
  const span = ROOF_HALF * 2
  const band = ROOF_HALF - OPENING_HALF
  const bandCentre = OPENING_HALF + band / 2
  const inner = OPENING_HALF * 2
  return [
    { args: [span, ROOF_THICKNESS, band], position: [0, y, -bandCentre], color: roofColor },
    { args: [span, ROOF_THICKNESS, band], position: [0, y, bandCentre], color: roofColor },
    { args: [band, ROOF_THICKNESS, inner], position: [-bandCentre, y, 0], color: roofColor },
    { args: [band, ROOF_THICKNESS, inner], position: [bandCentre, y, 0], color: roofColor },
  ]
}

export function Shrine({ map, relic }: { map: GameMap; relic: Relic }) {
  const relicMaterial = useRef<THREE.MeshStandardMaterial>(null)
  const haloMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const light = useRef<THREE.PointLight>(null)

  const hovelIndex = map.buildings.findIndex((b) => b.id === map.site?.hovelId)
  const hovel = hovelIndex >= 0 ? map.buildings[hovelIndex] : null

  const layout = useMemo(() => {
    if (!hovel || !map.site) return null
    const door = map.site.door
    const doorSide: Side =
      door.x < hovel.x ? "west" : door.x >= hovel.x + hovel.w ? "east" : door.z < hovel.z ? "north" : "south"
    const sides: Side[] = ["north", "south", "west", "east"]
    const pieces: Piece[] = [
      {
        args: [WALL_HALF * 2, FLOOR_THICKNESS, WALL_HALF * 2],
        position: [0, FLOOR_THICKNESS / 2, 0],
        color: FLOOR_COLOR,
      },
      ...sides.flatMap((side) => wallPieces(side, side === doorSide)),
      ...roofPieces(hovel.roofColor),
      { args: PLINTH, position: [0, FLOOR_THICKNESS + PLINTH[1] / 2, 0], color: PLINTH_COLOR },
    ]
    return {
      pieces,
      centreX: tileToWorldX(map, hovel.x) + (hovel.w - 1) / 2,
      centreZ: tileToWorldZ(map, hovel.z) + (hovel.d - 1) / 2,
      baseY: TILE_HEIGHT,
      relicY: FLOOR_THICKNESS + PLINTH[1] + RELIC_SIZE / 2 + 0.02,
    }
  }, [map, hovel])

  const shrineId = useMemo(
    () => new THREE.Color(...encodeObjectId(buildingObjectId(Math.max(0, hovelIndex)))),
    [hovelIndex],
  )
  const relicId = useMemo(() => new THREE.Color(...encodeObjectId(RELIC_OBJECT_ID)), [])

  useFrame(({ clock }) => {
    const phase = Math.sin((clock.elapsedTime / PULSE_PERIOD_SECONDS) * Math.PI * 2)
    if (relicMaterial.current) relicMaterial.current.emissiveIntensity = EMISSIVE_BASE + EMISSIVE_SWING * phase
    if (haloMaterial.current) haloMaterial.current.opacity = HALO_BASE + HALO_SWING * phase
    if (light.current) light.current.intensity = LIGHT_BASE + LIGHT_SWING * phase
  })

  if (!layout || !hovel) return null

  const select = (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "relic" }, event)

  return (
    <group position={[layout.centreX, layout.baseY, layout.centreZ]}>
      {layout.pieces.map((piece, i) => (
        <group key={i} position={piece.position}>
          <mesh onClick={(event) => selectElement({ kind: "building", id: hovel.id }, event)}>
            <boxGeometry args={piece.args} />
            <meshLambertMaterial color={piece.color} />
          </mesh>
          <mesh layers-mask={OUTLINE_ID_LAYER_MASK}>
            <boxGeometry args={piece.args} />
            <meshBasicMaterial color={shrineId} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* The relic itself, set on its corner so it reads as a gem, not a crate. */}
      <group position={[0, layout.relicY, 0]} rotation={[0, Math.PI / 4, 0]}>
        <mesh name="relic" onClick={select}>
          <boxGeometry args={[RELIC_SIZE, RELIC_SIZE, RELIC_SIZE]} />
          <meshStandardMaterial
            ref={relicMaterial}
            color={relic.color}
            emissive={relic.color}
            emissiveIntensity={EMISSIVE_BASE}
            roughness={0.4}
          />
        </mesh>
        <mesh layers-mask={OUTLINE_ID_LAYER_MASK}>
          <boxGeometry args={[RELIC_SIZE, RELIC_SIZE, RELIC_SIZE]} />
          <meshBasicMaterial color={relicId} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[0, layout.relicY, 0]}>
        <sphereGeometry args={[HALO_RADIUS, 16, 12]} />
        <meshBasicMaterial
          ref={haloMaterial}
          color={HALO_COLOR}
          transparent
          opacity={HALO_BASE}
          depthWrite={false}
        />
      </mesh>
      <pointLight
        ref={light}
        position={[0, WALL_HEIGHT, 0]}
        color={LIGHT_COLOR}
        intensity={LIGHT_BASE}
        distance={3.5}
        decay={2}
      />
    </group>
  )
}
