"use client"
import { PenFoodStock } from "./pen-food-stock"

import { usePlayerColor } from "./player-color"
import { waterMarkerParts } from "@/lib/game/building-art/water-markers"
import { playerBuildingParts } from "@/lib/game/player-color"

import { tavernStackParts } from "@/lib/game/building-art/stacked"
import { churchWing } from "@/lib/game/church-additions"
import { churchAisleHeight } from "@/lib/game/building-art/church-roof"

import { WaterSources } from "./water-sources"
import { isWaterSource, waterSourcePlacement } from "@/lib/game/water-sources/navigation"
import { CloseScenery } from "./close-scenery"
import { BUILDING_PREVIEW } from "@/lib/game/building-preview"
import { BuildingPreviewCarts } from "./building-preview-carts"
import { EntranceDetails } from "./entrance-details"
import { ConstructionProgress } from "./construction-progress"
import { ConstructionCostEffects, type ConstructionCostHandle } from "./construction-cost-effects"
import { PixelCharacters } from "@/components/pixel-canvas"
import { buildingYaw, rotatedFootprint } from "@/lib/game/building-rotation"
import { useUnitInterior } from "./use-unit-interior"
import { useOccupiedBuildings } from "./use-building-occupancy"

import { StructureModel } from "@/components/building-lab/building-model"
import { constructionParts } from "@/lib/game/building-art/construction"
import { constructionStage, isComplete } from "@/lib/game/construction"

import { groundHeight } from "@/lib/game/map/elevation"

import { useCallback, useEffect, useMemo, useRef } from "react"
import * as THREE from "three"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { FOOD_TYPES } from "@/lib/game/storage"
import { wildlifeRegistry } from "@/lib/game/wildlife/registry"
import { selectElement } from "@/lib/game/selection"
import { useBuildStore } from "@/lib/game/build-store"
import { workshopPileOffset } from "@/lib/game/workshop-layout"
import { pileOffset } from "@/lib/game/trees/timber"
import { InnFlueSmoke, ShelterFire } from "./building-smoke"
import { hasDomesticHearth } from "@/lib/game/building-art/furnishings"
import { buildingRoofJoins, roofOutlineOwners } from "@/lib/game/building-art/roof-joins"
import { WoodPile } from "./wood-pile"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "@/lib/game/map/types"
import {
  buildingObjectId,
  pileObjectId,
  encodeObjectId,
} from "@/lib/game/render/outline"

/** Built structures share their geometry with the menu and placement preview. */
export function Buildings({ map, characterScale = 1.5, showInteriors = false }: { map: GameMap; characterScale?: number; showInteriors?: boolean }) {
  const playerColor = usePlayerColor()
  const waterMarkers = useMemo(() => ({ well: waterMarkerParts("well"), "watering-hole": waterMarkerParts("watering-hole") }), [])
  const ownedWaterMarkers = useMemo(() => ({ well: playerBuildingParts(waterMarkers.well, playerColor), "watering-hole": playerBuildingParts(waterMarkers["watering-hole"], playerColor) }), [waterMarkers, playerColor])
  // Authored colors live on the merged vertices. Share the otherwise identical
  // surface material so adjacent buildings reuse lighting and shader uniforms.
  const surfaceMaterial = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), [])
  useEffect(() => () => surfaceMaterial.dispose(), [surfaceMaterial])
  const costs = useRef<ConstructionCostHandle>(null)
  const selectSite = (building: BuildingDef, event: Parameters<typeof selectElement>[1]) => {
    if (selectElement({ kind: "building", id: building.id }, event)) costs.current?.show(building)
  }
  const unitInterior = useUnitInterior(map)
  // Hearths only smoke for someone; a market stall carries wares and cloth only under a keeper.
  const occupied = useOccupiedBuildings(map)
  const stocked = useCallback((building: BuildingDef) => building.buildType !== "market" || occupied.has(building.id), [occupied])
  const selection = useCameraStore(s => s.selection)
  const foodStores = useBuildStore(s => s.foodStores)
  const piles = useBuildStore((s) => s.piles)
  const buildings = map.buildings
  const roofJoins = useMemo(() => buildingRoofJoins(map), [buildings, map.elevation, map.site?.hovelId])
  const outlineOwners = useMemo(() => roofOutlineOwners(buildings, roofJoins), [buildings, roofJoins])
  const waterPlacements = useMemo(() => buildings.flatMap((building, index) => isWaterSource(building) && isComplete(building)
    ? [{ ...waterSourcePlacement(map, building), idColor: encodeObjectId(buildingObjectId(index)) }] : []), [map, buildings])
  const modelCache = useRef(new Map<string, { key: string; parts: ReturnType<typeof constructionParts>; idColor: THREE.Color }>())
  const models = useMemo(() => {
    const supported = new Map<string, BuildingDef[]>()
    for (const b of buildings) if (b.supportId) supported.set(b.supportId,[...(supported.get(b.supportId) ?? []),b])
    const next = new Map<string, { key: string; parts: ReturnType<typeof constructionParts>; idColor: THREE.Color }>()
    const result = buildings.map((building, index) => {
      const footprint = rotatedFootprint(building, building.rotation)
      const wing = building.churchId ? churchWing(map, building) : undefined
      const joins = roofJoins.get(building.id)
      const inns = supported.get(building.id) ?? []
      const key = JSON.stringify([playerColor, building.owner, index, wing, building.buildType, footprint.w, footprint.d, building.height, building.color, building.roofColor, building.layoutSeed, building.hearthZ, building.fireplace, building.floorHeight, building.supportId, building.tavernFlue, inns.map(b=>[b.id,b.x,b.z,b.floorHeight]), joins, constructionStage(building), stocked(building)])
      const old = modelCache.current.get(building.id)
      const model = old?.key === key ? old : { key,
        parts: playerBuildingParts(tavernStackParts(constructionParts({ ...building, ...footprint, churchWing: wing, stocked: stocked(building) }, joins), building, inns), building.owner === "independent" ? null : playerColor), idColor: new THREE.Color(...encodeObjectId(buildingObjectId(index))) }
      next.set(building.id, model)
      return model
    })
    modelCache.current = next
    return result
  }, [buildings, roofJoins, stocked, playerColor])
  const idColors = useMemo(
    // Component tuples straight into the working colour space — an ID is data,
    // not a colour, so it must dodge sRGB conversion to survive readback.
    () => {
      const selected = new Set(buildings.flatMap((building, i) => isSelected(selection, { kind: "building", id: building.id }) ? [outlineOwners[i]] : []))
      return models.map((model, i) => selected.has(outlineOwners[i]) ? model.idColor : models[outlineOwners[i]].idColor)
    },
    [models, buildings, outlineOwners, selection],
  )

  return (
    <group>
      {waterPlacements.length > 0 && <WaterSources placements={waterPlacements} />}
      <EntranceDetails map={map} idColors={idColors} onSelect={selectSite} stocked={stocked} />
      <PixelCharacters>{BUILDING_PREVIEW && <BuildingPreviewCarts map={map} characterScale={characterScale} idColors={idColors} />}<ConstructionCostEffects ref={costs} map={map} characterScale={characterScale} /></PixelCharacters>
      {buildings.map((building, index) => {
        // The hovel has its own geometry (see shrine.tsx); its ID slot stays reserved.
        if (building.id === map.site?.hovelId) return null
        if (building.supportId && (unitInterior === building.supportId || isSelected(selection,{kind:"building",id:building.supportId}))) return null
        // Footprint centre: the origin tile's centre, offset by half the extra tiles.
        const centreX = tileToWorldX(map, building.x) + (building.w - 1) / 2
        const centreZ = tileToWorldZ(map, building.z) + (building.d - 1) / 2
        const baseY = groundHeight(map, building.x + (building.w - 1) / 2, building.z + (building.d - 1) / 2) + (building.floorHeight ?? 0)

        if (isWaterSource(building) && isComplete(building)) {
          return <group key={building.id}>
            {(building.buildType === "well" || building.buildType === "watering-hole") &&
              <group position={[centreX, baseY, centreZ]} rotation={[0, buildingYaw(building.rotation), 0]} onClick={event => selectSite(building, event)}>
                <StructureModel parts={(building.owner === "independent" ? waterMarkers : ownedWaterMarkers)[building.buildType]} idColor={idColors[index]} ink={false} surfaceMaterial={surfaceMaterial} />
              </group>}
            <mesh position={[centreX, baseY + .25, centreZ]} rotation={[0, buildingYaw(building.rotation), 0]} onClick={event => selectSite(building, event)}>
              <boxGeometry args={[building.buildType === "well" ? 1.2 : 2.2, .5, building.buildType === "well" ? 1.2 : 1.6]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
            </mesh>
          </group>
        }
        const local = rotatedFootprint(building, building.rotation)
        const wing = building.churchId ? churchWing(map, building) : undefined
        const cutaway = models[index].parts.some(p => p.layer === "roof") && (
          showInteriors || unitInterior === building.id || isSelected(selection, { kind: "building", id: building.id }) ||
          (!!building.churchId && (unitInterior === building.churchId || isSelected(selection, { kind: "building", id: building.churchId }))) ||
          (selection?.kind === "pile" && piles.some(p => p.id === selection.id && p.campId === building.id)))
        if (building.buildType === "storehouse" || building.buildType === "workshop") {
          return (
            <group key={building.id} name={`storage-${building.id}`} position={[centreX, baseY, centreZ]} rotation={[0, buildingYaw(building.rotation), 0]} onClick={(event) => selectSite(building, event)}>
              <StructureModel terrainFloors parts={models[index].parts} idColor={idColors[index]} ink={false} cutaway={cutaway} surfaceMaterial={surfaceMaterial} />
              {!isComplete(building) && <ConstructionProgress building={building} characterScale={characterScale} />}
              <CloseScenery enabled={building.buildType === "storehouse"}>{building.buildType === "storehouse" && FOOD_TYPES.map((type, slot) => {
                const amount = foodStores.get(building.id)?.[type] ?? 0
                return amount > 0 && <mesh key={type} position={[(slot - (FOOD_TYPES.length-1)/2) * local.w * .9 / FOOD_TYPES.length, 0.43, -local.d * 0.33]}>
                  <boxGeometry args={[local.w * 0.11, 0.12, local.d * 0.12]} />
                  <meshLambertMaterial color={["#a29978", "#748153", "#a67c56", "#828a88", "#986e58", "#ded4b3"][slot]} />
                </mesh>
              })}
              {piles.filter((pile) => pile.campId === building.id).map((pile) => {
                const store = building.buildType === "storehouse"
                const [x, z] = store ? pileOffset(pile.slot) : workshopPileOffset(pile.slot, local.w, local.d, building.layoutSeed)
                return <group key={pile.id} position={[x, store ? 0.35 : 0.08, store ? z * 0.5 - 0.1 : z]}><WoodPile pile={pile} objectId={pileObjectId(piles.indexOf(pile))} availableWidth={store ? local.w / 2 - .2 : local.w / 3 - .16} /></group>
              })}</CloseScenery>
            </group>
          )
        }

        return (
          <group key={building.id} position={[centreX, baseY, centreZ]} rotation={[0, buildingYaw(building.rotation), 0]} onClick={(event) => selectSite(building, event)}>
            <StructureModel terrainFloors parts={models[index].parts} idColor={idColors[index]} ink={false} cutaway={cutaway} surfaceMaterial={surfaceMaterial} penGateOpen={()=>wildlifeRegistry.current?.penGates?.get(building.id)?.open ?? 0} />
            {isComplete(building) && building.buildType === "sheep-pen" && <PenFoodStock width={local.w} depth={local.d} layoutSeed={building.layoutSeed} stock={()=>foodStores.get(building.id)} />}
            {isComplete(building) && building.supportId && <InnFlueSmoke width={local.w} depth={local.d} height={building.height} flue={building.tavernFlue} cutaway={cutaway} smoke={occupied.has(building.supportId)} />}
            {!isComplete(building) && <ConstructionProgress building={building} characterScale={characterScale} />}
            {isComplete(building) && !building.supportId && hasDomesticHearth(building.buildType,building.layoutSeed,building.fireplace) && <ShelterFire roofRise={wing ? churchAisleHeight(wing.churchWidth, wing.reach, wing.churchWidth / 2) - building.height : undefined} smoke={occupied.has(building.id) && !map.buildings.some(b=>b.supportId===building.id)} buildType={building.buildType} layoutSeed={building.layoutSeed} hearthZ={building.hearthZ} sharedChimney={roofJoins.get(building.id)?.find(join=>join.chimney)?.chimney} width={local.w} depth={local.d} height={building.height} cutaway={cutaway} />}
          </group>
        )
      })}
    </group>
  )
}
