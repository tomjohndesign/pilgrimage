"use client"

import { playerBuildingParts } from "@/lib/game/player-color"
import { usePlayerColor } from "./player-color"
import { useMemo } from "react"
import type { Color } from "three"
import { StructureModel } from "@/components/building-lab/building-model"
import { entranceParts } from "@/lib/game/building-art/entrance"
import { buildingApproach, buildingYaw, rotatedFootprint } from "@/lib/game/building-rotation"
import { shrineLayout } from "@/lib/game/shrine-layout"
import { isComplete } from "@/lib/game/construction"
import { groundHeight } from "@/lib/game/map/elevation"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "@/lib/game/map/types"
import { selectElement } from "@/lib/game/selection"

/** Props belong to the reserved approach square, outside the shell's occupied tiles.
 * A market's produce only stands out front while a keeper works the stall. */
export function EntranceDetails({map,idColors,onSelect,variationSeed,stocked}:{map:GameMap;idColors:Color[];variationSeed?:(building:BuildingDef)=>number;stocked?:(building:BuildingDef)=>boolean;onSelect:(building:BuildingDef,event:Parameters<typeof selectElement>[1])=>void}) {
  const color = usePlayerColor()
  const models=useMemo(()=>map.buildings.map(b=>playerBuildingParts(entranceParts(b.id===map.site?.hovelId ? "shrine" : b.buildType ?? "house",b.height,variationSeed?.(b) ?? 17,stocked?.(b) ?? true, { width: rotatedFootprint(b,b.rotation).w, depth: rotatedFootprint(b,b.rotation).d, seed: b.layoutSeed ?? 0 }), b.owner === "independent" ? null : color)),[map.buildings,map.site?.hovelId,variationSeed,stocked,color])
  return <group name="entrance-details">
    {map.buildings.map((building,index)=>{
      const at=buildingApproach(map,building)
      if(!at || !isComplete(building)) return null
      const yaw=building.id===map.site?.hovelId ? shrineLayout(building,map.site.door).rotation : buildingYaw(building.rotation)
      return <group key={building.id} position={[tileToWorldX(map,at.x),groundHeight(map,at.x,at.z),tileToWorldZ(map,at.z)]} rotation={[0,yaw,0]} onClick={event=>onSelect(building,event)}>
        <StructureModel parts={models[index]} idColor={idColors[index]} ink={false} />
      </group>
    })}
  </group>
}
