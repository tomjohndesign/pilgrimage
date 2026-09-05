"use client"

import { useMemo } from "react"
import * as THREE from "three"

import { useBuildStore } from "@/lib/game/build-store"
import { pileOffset } from "@/lib/game/trees/timber"
import { WoodPile } from "./wood-pile"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import {
  buildingObjectId,
  placedObjectId,
  encodeObjectId,
  OUTLINE_ID_LAYER_MASK,
} from "@/lib/game/render/outline"

/** Shrink the body slightly so neighbouring footprints don't visually merge. */
const BODY_INSET = 0.86
const ROOF_INSET = 0.98
const ROOF_THICKNESS = 0.18

/**
 * Placeholder structures. A body box plus a thin contrasting cap — enough to
 * read as a building at this camera angle and to prove footprint placement.
 *
 * Each building also renders a flat ID-coloured copy of itself on the outline
 * layer. Body and roof share one ID, so the outline pass never draws a line
 * between a building and its own roof — only against *other* objects.
 */
export function Buildings({ map }: { map: GameMap }) {
  const piles = useBuildStore((s) => s.piles)
  const placed = useBuildStore((s) => s.buildings)
  const buildings = useMemo(() => [...map.buildings, ...placed], [map, placed])
  const idColors = useMemo(
    // Component tuples straight into the working colour space — an ID is data,
    // not a colour, so it must dodge sRGB conversion to survive readback.
    () => buildings.map((_, index) => new THREE.Color(...encodeObjectId(index < map.buildings.length ? buildingObjectId(index) : placedObjectId(index - map.buildings.length)))),
    [map, buildings],
  )

  return (
    <group>
      {buildings.map((building, index) => {
        // The hovel has its own geometry (see shrine.tsx); its ID slot stays reserved.
        if (building.id === map.site?.hovelId) return null
        // Footprint centre: the origin tile's centre, offset by half the extra tiles.
        const centreX = tileToWorldX(map, building.x) + (building.w - 1) / 2
        const centreZ = tileToWorldZ(map, building.z) + (building.d - 1) / 2
        const baseY = TILE_HEIGHT

        if (building.id.startsWith("lumberCamp-")) {
          return (
            <group key={building.id} name={`lumber-yard-${building.id}`} position={[centreX, baseY, centreZ]}>
              <mesh position={[0, 0.022, 0]}>
                <boxGeometry args={[building.w * 0.98, 0.044, building.d * 0.98]} />
                <meshLambertMaterial color="#a18a60" />
              </mesh>
              {/* Low corner pegs mark the open yard without hiding its stacks. */}
              {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
                <mesh key={`${x}:${z}`} position={[x * (building.w / 2 - 0.12), 0.13, z * (building.d / 2 - 0.12)]}>
                  <boxGeometry args={[0.08, 0.26, 0.08]} /><meshLambertMaterial color="#705135" />
                </mesh>
              )))}
              {piles.filter((pile) => pile.campId === building.id).map((pile) => {
                const [x, z] = pileOffset(pile.slot)
                return <group key={pile.id} position={[x, 0.03, z]}><WoodPile pile={pile} /></group>
              })}
            </group>
          )
        }
        const bodyArgs: [number, number, number] = [
          building.w * BODY_INSET,
          building.height,
          building.d * BODY_INSET,
        ]
        const roofArgs: [number, number, number] = [
          building.w * ROOF_INSET,
          ROOF_THICKNESS,
          building.d * ROOF_INSET,
        ]

        return (
          <group key={building.id} position={[centreX, baseY, centreZ]}>
            <mesh position={[0, building.height / 2, 0]}>
              <boxGeometry args={bodyArgs} />
              <meshLambertMaterial color={building.color} />
            </mesh>
            <mesh position={[0, building.height + ROOF_THICKNESS / 2, 0]}>
              <boxGeometry args={roofArgs} />
              <meshLambertMaterial color={building.roofColor} />
            </mesh>

            {/* ID silhouette for the outline pass. */}
            <mesh position={[0, building.height / 2, 0]} layers-mask={OUTLINE_ID_LAYER_MASK}>
              <boxGeometry args={bodyArgs} />
              <meshBasicMaterial color={idColors[index]} toneMapped={false} />
            </mesh>
            <mesh
              position={[0, building.height + ROOF_THICKNESS / 2, 0]}
              layers-mask={OUTLINE_ID_LAYER_MASK}
            >
              <boxGeometry args={roofArgs} />
              <meshBasicMaterial color={idColors[index]} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
