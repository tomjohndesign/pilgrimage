import { shrineLayout, shrineSeats } from "./shrine-layout"
import { buildingStepAllowed, shrineGates } from "./building-navigation"
import { tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./map/types"
import { settlementRoute, shrineApproach } from "./settlement-route"

export const DEFAULT_ADMISSION_FEE = 2

export function admissionFee(map: GameMap): number {
  return map.buildings.find(b => b.id === map.site?.hovelId)?.admissionFee ?? DEFAULT_ADMISSION_FEE
}

/** Reserve a kneeler before leaving the road; enter by the aisle and retrace it on exit. */
export function shrineVisitPlan(map: GameMap, visitor: number, visits: number, occupied: ReadonlySet<string> = new Set(), from?: TilePos) {
  const site = map.site
  const shrine = map.buildings.find(b => b.id === site?.hovelId)
  if (!site || !shrine) return null
  const gate = shrineGates(shrine, site.door)[0]
  const branch = shrineApproach(map, from)
  if (!branch.length) return null
  if (!buildingStepAllowed(map,map.buildings,gate.outside,gate.inside,true)) return null
  const seats=shrineSeats(shrine,site.door),layout=shrineLayout(shrine,site.door)
  for(let i=0;i<seats.length;i++) {
    const seat=seats[(visitor+visits+i)%seats.length]
    if(occupied.has(seat.id)) continue
    const sideways=Math.abs(Math.sin(layout.rotation))>.5
    const aisle={x:sideways?seat.tile.x:shrine.x+Math.floor(shrine.w/2),z:sideways?shrine.z+Math.floor(shrine.d/2):seat.tile.z}
    const toAisle=settlementRoute(map,map.buildings,gate.inside,aisle,false,true)
    const inside=toAisle && buildingStepAllowed(map,map.buildings,aisle,seat.tile,true,seat.id)
      ? [...toAisle,seat.tile] : settlementRoute(map,map.buildings,gate.inside,seat.tile,false,true,seat.id)
    const approach=settlementRoute(map,map.buildings,site.door,gate.outside)
    if(inside && approach) return {seat:seat.id,route:[...branch,...approach.slice(1),...inside]}
  }
  return null
}

export function shrineVisitRoute(map: GameMap, visitor: number, visits: number): TilePos[] | null {
  return shrineVisitPlan(map,visitor,visits)?.route ?? null
}

/** Match the displayed relic on the altar towards the rear. */
export function relicHeading(map: GameMap, visitor: { x: number; z: number }): number | null {
  const shrine = map.buildings.find(b => b.id === map.site?.hovelId)
  if (!shrine) return null
  const { altar } = shrineLayout(shrine, map.site?.door)
  return Math.atan2(tileToWorldX(map, altar.x) - visitor.x, tileToWorldZ(map, altar.z) - visitor.z)
}
