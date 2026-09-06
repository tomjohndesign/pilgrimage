"use client"

import { ConstructionProgress } from "./construction-progress"
import { ConstructionCostEffects, type ConstructionCostHandle } from "./construction-cost-effects"
import { PixelCharacters } from "@/components/pixel-canvas"
import { StructureModel } from "@/components/building-lab/building-model"
import { constructionParts } from "@/lib/game/building-art/construction"
import { isComplete } from "@/lib/game/construction"

import { groundHeight } from "@/lib/game/map/elevation"

import { useMemo, useRef } from "react"
import * as THREE from "three"

import { selectElement } from "@/lib/game/selection"
import { useBuildStore } from "@/lib/game/build-store"
import { pileOffset } from "@/lib/game/trees/timber"
import { WoodPile } from "./wood-pile"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "@/lib/game/map/types"
import {
  buildingObjectId,
  pileObjectId,
  encodeObjectId,
} from "@/lib/game/render/outline"

/** Built structures share their geometry with the menu and placement preview. */
export function Buildings({ map, characterScale = 1.5 }: { map: GameMap; characterScale?: number }) {
  const costs = useRef<ConstructionCostHandle>(null)
  const selectSite = (building: BuildingDef, event: Parameters<typeof selectElement>[1]) => {
    if (selectElement({ kind: "building", id: building.id }, event)) costs.current?.show(building)
  }
  const piles = useBuildStore((s) => s.piles)
  const buildings = map.buildings
  const models = useMemo(() => buildings.map((building) => constructionParts({ ...building, buildType: building.buildType ?? (building.id.startsWith("lumberCamp-") ? "lumberCamp" : undefined) })), [buildings])
  const idColors = useMemo(
    // Component tuples straight into the working colour space — an ID is data,
    // not a colour, so it must dodge sRGB conversion to survive readback.
    () => buildings.map((_, index) => new THREE.Color(...encodeObjectId(buildingObjectId(index)))),
    [map, buildings],
  )

  return (
    <group>
      <PixelCharacters><ConstructionCostEffects ref={costs} map={map} characterScale={characterScale} /></PixelCharacters>
      {buildings.map((building, index) => {
        // The hovel has its own geometry (see shrine.tsx); its ID slot stays reserved.
        if (building.id === map.site?.hovelId) return null
        // Footprint centre: the origin tile's centre, offset by half the extra tiles.
        const centreX = tileToWorldX(map, building.x) + (building.w - 1) / 2
        const centreZ = tileToWorldZ(map, building.z) + (building.d - 1) / 2
        const baseY = groundHeight(map, building.x + (building.w - 1) / 2, building.z + (building.d - 1) / 2)

        if (building.buildType === "lumberCamp" || building.id.startsWith("lumberCamp-")) {
          return (
            <group key={building.id} name={`lumber-yard-${building.id}`} position={[centreX, baseY, centreZ]} onClick={(event) => selectSite(building, event)}>
              <StructureModel parts={models[index]} idColor={idColors[index]} ink={false} />
              {!isComplete(building) && <ConstructionProgress building={building} characterScale={characterScale} />}
              {piles.filter((pile) => pile.campId === building.id).map((pile) => {
                const [x, z] = pileOffset(pile.slot)
                return <group key={pile.id} position={[x, 0.03, z]}><WoodPile pile={pile} objectId={pileObjectId(piles.indexOf(pile))} /></group>
              })}
            </group>
          )
        }

        return (
          <group key={building.id} position={[centreX, baseY, centreZ]} onClick={(event) => selectSite(building, event)}>
            <StructureModel parts={models[index]} idColor={idColors[index]} ink={false} />
            {!isComplete(building) && <ConstructionProgress building={building} characterScale={characterScale} />}
          </group>
        )
      })}
    </group>
  )
}
