"use client"

import { WaterSources } from "./water-sources"
import { isWaterSource, waterSourcePlacement } from "@/lib/game/water-sources/navigation"
import { CloseScenery } from "./close-scenery"
import { EntranceDetails } from "./entrance-details"
import { ConstructionProgress } from "./construction-progress"
import { ConstructionCostEffects, type ConstructionCostHandle } from "./construction-cost-effects"
import { PixelCharacters } from "@/components/pixel-canvas"
import { buildingYaw, rotatedFootprint } from "@/lib/game/building-rotation"
import { useUnitInterior } from "./use-unit-interior"

import { StructureModel } from "@/components/building-lab/building-model"
import { constructionParts } from "@/lib/game/building-art/construction"
import { isComplete } from "@/lib/game/construction"

import { groundHeight } from "@/lib/game/map/elevation"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { FOOD_TYPES } from "@/lib/game/storage"
import { selectElement } from "@/lib/game/selection"
import { useBuildStore } from "@/lib/game/build-store"
import { workshopPileOffset } from "@/lib/game/workshop-layout"
import { pileOffset } from "@/lib/game/trees/timber"
import { ShelterFire } from "./building-smoke"
import { hasDomesticHearth } from "@/lib/game/building-art/furnishings"
import { WoodPile } from "./wood-pile"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "@/lib/game/map/types"
import {
  buildingObjectId,
  pileObjectId,
  encodeObjectId,
} from "@/lib/game/render/outline"

/** Built structures share their geometry with the menu and placement preview. */
export function Buildings({ map, characterScale = 1.5, showInteriors = false }: { map: GameMap; characterScale?: number; showInteriors?: boolean }) {
  // Authored colors live on the merged vertices. Share the otherwise identical
  // surface material so adjacent buildings reuse lighting and shader uniforms.
  const surfaceMaterial = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), [])
  useEffect(() => () => surfaceMaterial.dispose(), [surfaceMaterial])
  const costs = useRef<ConstructionCostHandle>(null)
  const selectSite = (building: BuildingDef, event: Parameters<typeof selectElement>[1]) => {
    if (selectElement({ kind: "building", id: building.id }, event)) costs.current?.show(building)
  }
  const unitInterior = useUnitInterior(map)
  const selection = useCameraStore(s => s.selection)
  const foodStores = useBuildStore(s => s.foodStores)
  const piles = useBuildStore((s) => s.piles)
  const buildings = map.buildings
  const waterPlacements = useMemo(() => buildings.flatMap((building, index) => isWaterSource(building) && isComplete(building)
    ? [{ ...waterSourcePlacement(map, building), idColor: encodeObjectId(buildingObjectId(index)) }] : []), [map, buildings])
  const models = useMemo(() => buildings.map(building => constructionParts({ ...building, ...rotatedFootprint(building, building.rotation) })), [buildings])
  const idColors = useMemo(
    // Component tuples straight into the working colour space — an ID is data,
    // not a colour, so it must dodge sRGB conversion to survive readback.
    () => buildings.map((_, index) => new THREE.Color(...encodeObjectId(buildingObjectId(index)))),
    [map, buildings],
  )

  return (
    <group>
      {waterPlacements.length > 0 && <WaterSources placements={waterPlacements} />}
      <EntranceDetails map={map} idColors={idColors} onSelect={selectSite} />
      <PixelCharacters><ConstructionCostEffects ref={costs} map={map} characterScale={characterScale} /></PixelCharacters>
      {buildings.map((building, index) => {
        // The hovel has its own geometry (see shrine.tsx); its ID slot stays reserved.
        if (building.id === map.site?.hovelId) return null
        // Footprint centre: the origin tile's centre, offset by half the extra tiles.
        const centreX = tileToWorldX(map, building.x) + (building.w - 1) / 2
        const centreZ = tileToWorldZ(map, building.z) + (building.d - 1) / 2
        const baseY = groundHeight(map, building.x + (building.w - 1) / 2, building.z + (building.d - 1) / 2)

        if (isWaterSource(building) && isComplete(building)) {
          return <group key={building.id}>
            <mesh position={[centreX, baseY + .25, centreZ]} rotation={[0, buildingYaw(building.rotation), 0]} onClick={event => selectSite(building, event)}>
              <boxGeometry args={[building.buildType === "well" ? 1.2 : 2.2, .5, building.buildType === "well" ? 1.2 : 1.6]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
            </mesh>
          </group>
        }
        const local = rotatedFootprint(building, building.rotation)
        const cutaway = models[index].some(p => p.layer === "roof") && (
          showInteriors || unitInterior === building.id || isSelected(selection, { kind: "building", id: building.id }) ||
          (selection?.kind === "pile" && piles.some(p => p.id === selection.id && p.campId === building.id)))
        if (building.buildType === "storehouse" || building.buildType === "workshop") {
          return (
            <group key={building.id} name={`storage-${building.id}`} position={[centreX, baseY, centreZ]} rotation={[0, buildingYaw(building.rotation), 0]} onClick={(event) => selectSite(building, event)}>
              <StructureModel terrainFloors parts={models[index]} idColor={idColors[index]} ink={false} cutaway={cutaway} surfaceMaterial={surfaceMaterial} />
              {!isComplete(building) && <ConstructionProgress building={building} characterScale={characterScale} />}
              <CloseScenery enabled={building.buildType === "storehouse"}>{building.buildType === "storehouse" && FOOD_TYPES.map((type, slot) => {
                const amount = foodStores.get(building.id)?.[type] ?? 0
                return amount > 0 && <mesh key={type} position={[(slot - 1.5) * local.w * 0.21, 0.43, -local.d * 0.33]}>
                  <boxGeometry args={[local.w * 0.14, 0.12, local.d * 0.12]} />
                  <meshLambertMaterial color={["#a29978", "#748153", "#a67c56", "#828a88"][slot]} />
                </mesh>
              })}
              {piles.filter((pile) => pile.campId === building.id).map((pile) => {
                const store = building.buildType === "storehouse"
                const [x, z] = store ? pileOffset(pile.slot) : workshopPileOffset(pile.slot, local.w, local.d)
                return <group key={pile.id} position={[x, store ? 0.35 : 0.08, store ? z * 0.5 - 0.1 : z]}><WoodPile pile={pile} objectId={pileObjectId(piles.indexOf(pile))} /></group>
              })}</CloseScenery>
            </group>
          )
        }

        return (
          <group key={building.id} position={[centreX, baseY, centreZ]} rotation={[0, buildingYaw(building.rotation), 0]} onClick={(event) => selectSite(building, event)}>
            <StructureModel terrainFloors parts={models[index]} idColor={idColors[index]} ink={false} cutaway={cutaway} surfaceMaterial={surfaceMaterial} />
            {!isComplete(building) && <ConstructionProgress building={building} characterScale={characterScale} />}
            {isComplete(building) && hasDomesticHearth(building.buildType) && <ShelterFire buildType={building.buildType} width={local.w} depth={local.d} height={building.height} cutaway={cutaway} />}
          </group>
        )
      })}
    </group>
  )
}
