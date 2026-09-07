"use client"

import { useMemo } from "react"
import type { Color } from "three"
import { StructureModel } from "@/components/building-lab/building-model"
import { entranceParts } from "@/lib/game/building-art/entrance"
import { buildingApproach, buildingYaw } from "@/lib/game/building-rotation"
import { shrineLayout } from "@/lib/game/shrine-layout"
import { isComplete } from "@/lib/game/construction"
import { groundHeight } from "@/lib/game/map/elevation"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "@/lib/game/map/types"
import { selectElement } from "@/lib/game/selection"

/** Props belong to the reserved approach square, outside the shell's occupied tiles. */
export function EntranceDetails({map,idColors,onSelect}:{map:GameMap;idColors:Color[];onSelect:(building:BuildingDef,event:Parameters<typeof selectElement>[1])=>void}) {
  const models=useMemo(()=>map.buildings.map(b=>entranceParts(b.id===map.site?.hovelId ? "shrine" : b.buildType ?? "shepherd-hut",b.height)),[map.buildings,map.site?.hovelId])
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
