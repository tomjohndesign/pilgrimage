import { buildingEntry, rotateBuildingPoint, rotatedFootprint } from "./building-rotation"
import { innLayout } from "./inn-layout"
import { groundHeight } from "./map/elevation"
import { surfaceHeight } from "./map/bridges"
import { settlementRoute } from "./settlement-route"
import { tavernWalkingRoute, type TavernWalkPoint } from "./tavern-navigation"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type BuildingDef, type GameMap } from "./map/types"

/** Explicit floor transitions keep the ground navigation graph out of upstairs footprints. */
export function innWalkingRoute(map: GameMap, from: TavernWalkPoint, to: TavernWalkPoint, target?: BuildingDef): TavernWalkPoint[] | null | undefined {
  if (!map.buildings.some(b=>b.buildType === "inn")) return undefined
  const floor=(b:BuildingDef)=>groundHeight(map,b.x+(b.w-1)/2,b.z+(b.d-1)/2)+(b.floorHeight ?? 0)
  const local=(b:BuildingDef,p:TavernWalkPoint)=>rotateBuildingPoint(p.x-tileToWorldX(map,b.x)-(b.w-1)/2,p.z-tileToWorldZ(map,b.z)-(b.d-1)/2,-(b.rotation ?? 0))
  const at=(p:TavernWalkPoint)=>map.buildings.find(b=> {
    if(b.buildType!=="inn" || b.construction && b.construction.work<b.construction.required) return false
    const q=local(b,p),size=rotatedFootprint(b,b.rotation)
    return Math.abs(q.x)<size.w/2 && Math.abs(q.z)<size.d/2 && p.y>=floor(b)-.08 && p.y<floor(b)+b.height
  })
  const start=at(from),end=target?.buildType==="inn" ? target : at(to)
  if(!start && !end) return undefined
  const point=(b:BuildingDef,x:number,z:number,y=floor(b)):TavernWalkPoint=> {
    const offset=rotateBuildingPoint(x,z,b.rotation)
    return {x:tileToWorldX(map,b.x)+(b.w-1)/2+offset.x,z:tileToWorldZ(map,b.z)+(b.d-1)/2+offset.z,y}
  }
  const hub=(b:BuildingDef,p:TavernWalkPoint)=> {
    const q=local(b,p),size=rotatedFootprint(b,b.rotation),y=floor(b)
    const layout=innLayout(size.w,size.d,!!b.supportId),aisle=(q.x>0 ? 1 : -1)*layout.aisle
    // Step off the bed sideways; cross between aisles beyond the last bed.
    return [p,point(b,aisle,q.z,p.y),point(b,aisle,q.z,y),point(b,aisle,layout.frontCross),point(b,0,layout.frontCross)]
  }
  const exit=(b:BuildingDef,p:TavernWalkPoint)=> {
    const size=rotatedFootprint(b,b.rotation),y=floor(b),layout=innLayout(size.w,size.d,!!b.supportId)
    const route=hub(b,p)
    if(b.supportId) {
      const top=point(b,layout.hatch.x,layout.hatch.z),bottom={...top,y:y-(b.floorHeight ?? 0)}
      route.push(point(b,layout.hatch.x,layout.frontCross),top,bottom)
      return route
    }
    const entry=buildingEntry(b)
    route.push(point(b,0,size.d/2-.15),{x:tileToWorldX(map,entry.x),z:tileToWorldZ(map,entry.z),y:surfaceHeight(map,entry.x,entry.z)})
    return route
  }
  if(start && start===end) {
    return [...hub(start,from),...hub(start,to).reverse()]
  }
  const first=start ? exit(start,from) : [from],last=end ? exit(end,to).reverse() : [to]
  const a=first[first.length-1],b=last[0]
  let ground=tavernWalkingRoute(map,a,b)
  if(ground===undefined) {
    const path=settlementRoute(map,map.buildings,{x:worldToTileX(map,a.x),z:worldToTileZ(map,a.z)},
      {x:worldToTileX(map,b.x),z:worldToTileZ(map,b.z)},false,true)
    ground=path?.map(p=>({x:tileToWorldX(map,p.x),z:tileToWorldZ(map,p.z),y:surfaceHeight(map,p.x,p.z)})) ?? null
  }
  return ground ? [...first,...ground,...last] : null
}
