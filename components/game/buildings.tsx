"use client"

import { useUnitInterior } from "./use-unit-interior"

import { StructureModel } from "@/components/building-lab/building-model"
import { structureParts } from "@/lib/game/building-art/structure"

import { groundHeight } from "@/lib/game/map/elevation"

import { useMemo } from "react"
import * as THREE from "three"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { FOOD_TYPES } from "@/lib/game/storage"
import { selectElement } from "@/lib/game/selection"
import { useBuildStore } from "@/lib/game/build-store"
import { pileOffset } from "@/lib/game/trees/timber"
import { ShelterFire } from "./building-smoke"
import { WoodPile } from "./wood-pile"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import {
  buildingObjectId,
  pileObjectId,
  encodeObjectId,
} from "@/lib/game/render/outline"

/** Built structures share their geometry with the menu and placement preview. */
export function Buildings({ map }: { map: GameMap }) {
  const unitInterior = useUnitInterior(map)
  const selection = useCameraStore(s => s.selection)
  const foodStores = useBuildStore(s => s.foodStores)
  const piles = useBuildStore((s) => s.piles)
  const buildings = map.buildings
  const models = useMemo(() => buildings.map(structureParts), [buildings])
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

        const cutaway = models[index].some(p => p.layer === "roof") && (
          unitInterior === building.id || isSelected(selection, { kind: "building", id: building.id }) ||
          (selection?.kind === "pile" && piles.some(p => p.id === selection.id && p.campId === building.id)))
        if (building.buildType === "storehouse" || building.buildType === "workshop") {
          return (
            <group key={building.id} name={`storage-${building.id}`} position={[centreX, baseY, centreZ]} onClick={(event) => selectElement({ kind: "building", id: building.id }, event)}>
              <StructureModel parts={models[index]} idColor={idColors[index]} ink={false} cutaway={cutaway} />
              {building.buildType === "storehouse" && FOOD_TYPES.map((type, slot) => {
                const amount = foodStores.get(building.id)?.[type] ?? 0
                return amount > 0 && <mesh key={type} position={[(slot - 1.5) * building.w * 0.21, 0.43, -building.d * 0.33]}>
                  <boxGeometry args={[building.w * 0.14, 0.12, building.d * 0.12]} />
                  <meshLambertMaterial color={["#a29978", "#748153", "#a67c56", "#828a88"][slot]} />
                </mesh>
              })}
              {piles.filter((pile) => pile.campId === building.id).map((pile) => {
                const [x, z] = pileOffset(pile.slot)
                const store = building.buildType === "storehouse"
                return <group key={pile.id} position={[store ? x : x * 0.5, store ? 0.35 : 0.03, store ? z * 0.5 - 0.1 : z * 0.3 + 0.24]}><WoodPile pile={pile} objectId={pileObjectId(piles.indexOf(pile))} /></group>
              })}
            </group>
          )
        }

        return (
          <group key={building.id} position={[centreX, baseY, centreZ]} onClick={(event) => selectElement({ kind: "building", id: building.id }, event)}>
            <StructureModel parts={models[index]} idColor={idColors[index]} ink={false} cutaway={cutaway} />
            {building.buildType === "shelter" && <ShelterFire width={building.w} depth={building.d} height={building.height} cutaway={cutaway} />}
          </group>
        )
      })}
    </group>
  )
}
