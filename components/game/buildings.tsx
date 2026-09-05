"use client"

import { useMemo } from "react"
import * as THREE from "three"

import { TERRAIN } from "@/lib/game/map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import {
  buildingObjectId,
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
  const idColors = useMemo(
    // Component tuples straight into the working colour space — an ID is data,
    // not a colour, so it must dodge sRGB conversion to survive readback.
    () => map.buildings.map((_, index) => new THREE.Color(...encodeObjectId(buildingObjectId(index)))),
    [map],
  )

  return (
    <group>
      {map.buildings.map((building, index) => {
        // The hovel has its own geometry (see shrine.tsx); its ID slot stays reserved.
        if (building.id === map.site?.hovelId) return null
        // Footprint centre: the origin tile's centre, offset by half the extra tiles.
        const centreX = tileToWorldX(map, building.x) + (building.w - 1) / 2
        const centreZ = tileToWorldZ(map, building.z) + (building.d - 1) / 2
        const groundTerrain = tileAt(map, building.x, building.z)
        const baseY = groundTerrain ? TERRAIN[groundTerrain].height : 0

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
