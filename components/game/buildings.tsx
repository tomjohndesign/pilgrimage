"use client"

import { useMemo } from "react"
import * as THREE from "three"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
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
  const selection = useCameraStore((s) => s.selection)
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
        const baseY = TILE_HEIGHT

        const cross = building.buildType === "cross"
        const selected = isSelected(selection, { kind: "building", id: building.id })
        const capY = cross ? building.height * 0.72 : building.height + ROOF_THICKNESS / 2
        const bodyArgs: [number, number, number] = [
          cross ? 0.14 : building.w * BODY_INSET,
          building.height,
          cross ? 0.14 : building.d * BODY_INSET,
        ]
        const roofArgs: [number, number, number] = [
          cross ? 0.7 : building.w * ROOF_INSET,
          ROOF_THICKNESS,
          cross ? 0.14 : building.d * ROOF_INSET,
        ]

        return (
          <group key={building.id} position={[centreX, baseY, centreZ]} onClick={(event) => {
            if (event.delta > 6) return
            event.stopPropagation()
            useCameraStore.getState().select(selected ? null : { kind: "building", id: building.id })
          }}>
            {selected && <mesh position={[0, building.height + 0.4, 0]}><boxGeometry args={[0.2, 0.05, 0.2]} /><meshBasicMaterial color="#d8a93f" /></mesh>}
            <mesh position={[0, building.height / 2, 0]}>
              <boxGeometry args={bodyArgs} />
              <meshLambertMaterial color={building.color} />
            </mesh>
            <mesh position={[0, capY, 0]}>
              <boxGeometry args={roofArgs} />
              <meshLambertMaterial color={building.roofColor} />
            </mesh>

            {/* ID silhouette for the outline pass. */}
            <mesh position={[0, building.height / 2, 0]} layers-mask={OUTLINE_ID_LAYER_MASK}>
              <boxGeometry args={bodyArgs} />
              <meshBasicMaterial color={idColors[index]} toneMapped={false} />
            </mesh>
            <mesh
              position={[0, capY, 0]}
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
