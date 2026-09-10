import { innPlacementError, innPlacementLayout, innPlacementRotation } from "./inn"
import { layoutHand, placementLayoutSeed } from "./building-layout"
import { buildingRoofJoins } from "./building-art/roof-joins"
import { hasDomesticHearth, shelterHearth } from "./building-art/furnishings"
import { rotateBuildingPoint, rotatedFootprint, buildingApproaches } from "./building-rotation"
import { singlePlaneRoofRise } from "./building-art/dimensions"
import type { BuildingDef, GameMap } from "./map/types"

/** New neighbours adopt an existing fireplace's position; older homes never move.
 * Persist the result so demolition and later additions cannot reshuffle a layout.
 */
export function adoptNeighborChimney(map: GameMap, building: BuildingDef, riseFor = (b: BuildingDef) => singlePlaneRoofRise(rotatedFootprint(b,b.rotation).d)): Pick<BuildingDef,"layoutSeed" | "hearthZ" | "fireplace"> {
  const layout={layoutSeed:building.layoutSeed,hearthZ:building.hearthZ,fireplace:building.fireplace}
  if (!hasDomesticHearth(building.buildType,building.layoutSeed,building.fireplace)) return layout
  const candidate={...building,construction:undefined}
  const joined=buildingRoofJoins({...map,buildings:[...map.buildings,candidate]},riseFor)
  const edges=joined.get(candidate.id) ?? [], local=rotatedFootprint(candidate,candidate.rotation)
  for (const older of map.buildings) {
    const edge=edges.find(e=>e.neighborId===older.id)
    if (!edge || !hasDomesticHearth(older.buildType,older.layoutSeed,older.fireplace)) continue
    const oldEdges=joined.get(older.id) ?? [], reciprocal=oldEdges.find(e=>e.neighborId===candidate.id)!
    if (oldEdges.some(e=>e.chimney && e.neighborId!==candidate.id)) continue
    const old=rotatedFootprint(older,older.rotation), hearth=shelterHearth(old.w,old.d,older.height,riseFor(older),older.layoutSeed,older.hearthZ)
    hearth.x*=layoutHand(older.buildType,older.layoutSeed)
    if (Math.abs(hearth.x-reciprocal.side*old.w/2)>.45) continue
    const world=rotateBuildingPoint(hearth.x,hearth.z,older.rotation)
    const point=rotateBuildingPoint(world.x+older.x+older.w/2-candidate.x-candidate.w/2,world.z+older.z+older.d/2-candidate.z-candidate.d/2,-(candidate.rotation??0))
    const inset=.36*Math.min(1,local.w/1.5,local.d/1.5)
    if (Math.abs(point.z)>local.d/2-inset+.001 || point.z-.235<edge.from || point.z+.235>edge.to) continue
    return {layoutSeed:((layout.layoutSeed ?? 0)&~1)+(edge.side===-1 ? 1 : 0),hearthZ:point.z,fireplace:true}
  }
  return layout
}

export function placementBuildingLayout(map: GameMap, building: BuildingDef): Pick<BuildingDef,"layoutSeed"|"hearthZ"|"fireplace"|"supportId"|"floorHeight"|"tavernFlue"> {
  if (building.buildType === "inn") return innPlacementLayout(map,{...building,layoutSeed:placementLayoutSeed("inn",building,map.seed)})
  return adoptNeighborChimney(map,{...building,layoutSeed:placementLayoutSeed(building.buildType ?? "",building,map.seed)})
}

/** Prefer a touching, compatible roof while retaining the requested quarter turn
 * whenever it already joins. The cursor and committed placement share this rule.
 */
export function roofAlignedRotation(map: GameMap, building: BuildingDef,
  riseFor = (b: BuildingDef) => singlePlaneRoofRise(rotatedFootprint(b,b.rotation).d),
  allowed: (candidate: BuildingDef) => boolean = candidate => placementClearance(map,candidate) === null,
): import("./building-rotation").BuildingRotation {
  const requested=building.rotation ?? 0
  if (building.buildType === "inn") return innPlacementRotation(map,building)
  if(!["house","hall","tavern"].includes(building.buildType ?? "")) return requested
  const local=rotatedFootprint(building,requested)
  const nearby=map.buildings.filter(b=>b.x+b.w>=building.x-1 && b.x<=building.x+Math.max(local.w,local.d)+1
    && b.z+b.d>=building.z-1 && b.z<=building.z+Math.max(local.w,local.d)+1)
  if(!nearby.length) return requested
  let best=requested,score=0
  for(const delta of [0,1,3,2]) {
    const rotation=((requested+delta)%4) as import("./building-rotation").BuildingRotation
    const candidate={...building,...rotatedFootprint(local,rotation),rotation,construction:undefined}
    if(!allowed(candidate)) continue
    const joins=buildingRoofJoins({...map,buildings:[...nearby,candidate]},riseFor).get(candidate.id)
    const contact=joins?.reduce((sum,edge)=>sum+edge.to-edge.from,0) ?? 0
    if(delta===0 && contact>0) return requested
    if(contact>score) {score=contact;best=rotation}
  }
  return best
}

/** Geometric placement rules also used by the sandbox, without cost/influence. */
export function placementClearance(map: GameMap, candidate: BuildingDef): string | null {
  const overlaps=(a: BuildingDef,b: BuildingDef)=>a.x<b.x+b.w && a.x+a.w>b.x && a.z<b.z+b.d && a.z+a.d>b.z
  const covers=(b: BuildingDef,p:{x:number;z:number})=>p.x>=b.x && p.x<b.x+b.w && p.z>=b.z && p.z<b.z+b.d
  if(!Number.isInteger(candidate.x) || !Number.isInteger(candidate.z)) return "Choose a tile."
  if(candidate.x<0 || candidate.z<0 || candidate.x+candidate.w>map.width || candidate.z+candidate.d>map.depth) return "Keep the building on the map."
  const stacked=innPlacementError(map,candidate)
  if(stacked !== undefined) return stacked
  if(map.buildings.some(b=>overlaps(candidate,b))) return "Another building occupies these tiles."
  if(map.road?.some(p=>covers(candidate,p))) return "Keep the road clear."
  if(map.buildings.some(b=>buildingApproaches(map,b).some(p=>covers(candidate,p)))) return "Keep the neighboring doors clear."
  if(buildingApproaches(map,candidate).some(p=>p.x<0 || p.z<0 || p.x>=map.width || p.z>=map.depth || map.buildings.some(b=>covers(b,p)))) return "Leave a clear tile outside each door."
  return null
}

/** Resolve a catalogue placement before validating, drawing or buying it. */
export function placementRoofRotation(map: GameMap, def: Pick<BuildingDef,"id"|"label"|"w"|"d"|"height"|"color"|"roofColor">,
  at: {x:number;z:number}, rotation: import("./building-rotation").BuildingRotation) {
  return roofAlignedRotation(map,{...def,...rotatedFootprint(def,rotation),...at,rotation,id:"construction-preview",buildType:def.id,
    layoutSeed:placementLayoutSeed(def.id,at,map.seed)})
}
