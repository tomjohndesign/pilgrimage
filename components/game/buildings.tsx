"use client"

import { TERRAIN } from "@/lib/game/map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"

/** Shrink the body slightly so neighbouring footprints don't visually merge. */
const BODY_INSET = 0.86
const ROOF_INSET = 0.98
const ROOF_THICKNESS = 0.18

/**
 * Placeholder structures. A body box plus a thin contrasting cap — enough to
 * read as a building at this camera angle and to prove footprint placement.
 */
export function Buildings({ map }: { map: GameMap }) {
  return (
    <group>
      {map.buildings.map((building) => {
        // Footprint centre: the origin tile's centre, offset by half the extra tiles.
        const centreX = tileToWorldX(map, building.x) + (building.w - 1) / 2
        const centreZ = tileToWorldZ(map, building.z) + (building.d - 1) / 2
        const groundTerrain = tileAt(map, building.x, building.z)
        const baseY = groundTerrain ? TERRAIN[groundTerrain].height : 0

        return (
          <group key={building.id} position={[centreX, baseY, centreZ]}>
            <mesh position={[0, building.height / 2, 0]} castShadow receiveShadow>
              <boxGeometry
                args={[building.w * BODY_INSET, building.height, building.d * BODY_INSET]}
              />
              <meshLambertMaterial color={building.color} />
            </mesh>
            <mesh position={[0, building.height + ROOF_THICKNESS / 2, 0]} castShadow receiveShadow>
              <boxGeometry
                args={[building.w * ROOF_INSET, ROOF_THICKNESS, building.d * ROOF_INSET]}
              />
              <meshLambertMaterial color={building.roofColor} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
