"use client"

import { StructureModel } from "@/components/building-lab/building-model"
import { isProceduralStructure, structureParts } from "@/lib/game/building-art/structure"

import { groundHeight } from "@/lib/game/map/elevation"

import { useMemo } from "react"
import * as THREE from "three"

import { selectElement } from "@/lib/game/selection"
import { useBuildStore } from "@/lib/game/build-store"
import { pileOffset } from "@/lib/game/trees/timber"
import { WoodPile } from "./wood-pile"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import {
  buildingObjectId,
  pileObjectId,
  encodeObjectId,
} from "@/lib/game/render/outline"

/** Built structures share their geometry with the menu and placement preview. */
export function Buildings({ map }: { map: GameMap }) {
  const piles = useBuildStore((s) => s.piles)
  const buildings = map.buildings
  const models = useMemo(() => buildings.map((building) => structureParts({ ...building, buildType: building.buildType ?? (building.id.startsWith("lumberCamp-") ? "lumberCamp" : undefined) })), [buildings])
  const idColors = useMemo(
    // Component tuples straight into the working colour space — an ID is data,
    // not a colour, so it must dodge sRGB conversion to survive readback.
    () => buildings.map((_, index) => new THREE.Color(...encodeObjectId(buildingObjectId(index)))),
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
        const baseY = groundHeight(map, building.x + (building.w - 1) / 2, building.z + (building.d - 1) / 2)

        if (building.buildType === "lumberCamp" || building.id.startsWith("lumberCamp-")) {
          return (
            <group key={building.id} name={`lumber-yard-${building.id}`} position={[centreX, baseY, centreZ]} onClick={(event) => selectElement({ kind: "building", id: building.id }, event)}>
              <StructureModel parts={models[index]} idColor={idColors[index]} ink={false} />
              {piles.filter((pile) => pile.campId === building.id).map((pile) => {
                const [x, z] = pileOffset(pile.slot)
                return <group key={pile.id} position={[x, 0.03, z]}><WoodPile pile={pile} objectId={pileObjectId(piles.indexOf(pile))} /></group>
              })}
            </group>
          )
        }

        return (
          <group key={building.id} position={[centreX, baseY, centreZ]} onClick={(event) => selectElement({ kind: "building", id: building.id }, event)}>
            <StructureModel parts={models[index]} idColor={idColors[index]} ink={isProceduralStructure(building.buildType)} />
          </group>
        )
      })}
    </group>
  )
}
