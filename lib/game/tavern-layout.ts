import { overlapsFloor, insideRoom } from "./building-art/furniture-placement"
import { layoutHand } from "./building-layout"
import { shelterHearth, tavernExteriorBenches } from "./building-art/furnishings"
import { rotateBuildingPoint, rotatedFootprint } from "./building-rotation"
import type { BuildingDef, TilePos } from "./map/types"

export interface TavernObstacle { id: string; x: number; z: number; w: number; d: number }
export const TAVERN_CLEARANCE = .1

/** The renderer and navigation use the same tabletops, benches, counter and hearth. */
export function tavernLayout(w: number, d: number, layoutSeed?: number, hearthZ?: number, hand = layoutHand("tavern",layoutSeed)) {
  const seed=layoutSeed ?? 0, count=Math.max(2,Math.floor(d/1.45))
  const tables = Array.from({length:count}, (_, index) => {
    const side=index===0 ? -1 : index===1 ? 1 : index
    const yaw=w>=3 && d>=3 && (Math.floor(seed/32) >> (index%3))%2 ? Math.PI/2 : 0
    const length=Math.min(1.1,w*.32), thickness=Math.min(.6,d*.15)
    return {id:`tavern-table-${side}-top`,side,x:-w*.23,
      z:count===2 ? (index*2-1)*d*.22 : -d/2+.8+index*(d-1.6)/(count-1),
      w:yaw ? thickness : length,d:yaw ? length : thickness,length,thickness,yaw}
  })
  const benches = tables.flatMap(table => [-1, 1].map(side => {
    const offset=table.thickness/2+Math.min(.14,d*.035)
    return { id:`tavern-bench-${table.side}-${side}-seat`,table:table.side,side,
      x:table.x+Math.sin(table.yaw)*side*offset,z:table.z+Math.cos(table.yaw)*side*offset,
      w:table.yaw ? .18 : Math.min(.32,table.length),d:table.yaw ? Math.min(.32,table.length) : .18,
      length:Math.min(.32,table.length),yaw:table.yaw,heading:table.yaw+(side>0 ? Math.PI : 0) }
  }))
  const counter = { id: "tavern-counter-top", x: w * .2, z: -d * .14,
    w: Math.min(1.15,w*.27+.035), d: Math.min(.6,d*.15), yaw:0 }
  const hearth = shelterHearth(w, d, 0, 0, layoutSeed, hearthZ)
  const fireplace={ id:"hearth",x:hearth.x,z:hearth.z,w:.57*hearth.scale,d:.57*hearth.scale }
  if (Math.abs(counter.z-hearth.z)<counter.d/2+.285*hearth.scale+TAVERN_CLEARANCE) counter.z=d*.23
  if(w>=3 && d>=3 && Math.floor(seed/128)%2) {
    const turned={...counter,w:counter.d,d:counter.w,yaw:Math.PI/2}
    if(insideRoom(turned,w,d) && ![...tables,...benches,fireplace].some(p=>overlapsFloor(turned,p,.12))) Object.assign(counter,turned)
  }
  // Customer approach follows the counter's face, towards the central aisle.
  const serving={x:counter.x-(counter.yaw ? counter.w/2+.16 : 0),z:counter.z+(counter.yaw ? 0 : counter.d/2+.16)}
  // Wide taverns can fit another drinking group on the counter side, provided
  // the entire table/bench assembly clears the hearth and customer approach.
  const target=Math.max(count,2+Math.floor(Math.max(0,w*d-12)/5))
  if(w>=4) for(const z of [d*.30,-d*.30,0]) {
    if(tables.length>=target) break
    const side=tables.length+1,table={id:`tavern-table-${side}-top`,side,x:w*.26,z,
      w:.75,d:.40,length:.75,thickness:.40,yaw:0}
    const seats=[-1,1].map(sign=>({id:`tavern-bench-${side}-${sign}-seat`,table:side,side:sign,
      x:table.x,z:z+sign*.34,w:.32,d:.18,length:.32,yaw:0,heading:sign>0 ? Math.PI : 0}))
    const group={x:table.x,z,w:.75,d:.86}
    if(!insideRoom(group,w,d) || [...tables,...benches,counter,fireplace,{...serving,w:.3,d:.3}].some(p=>overlapsFloor(group,p,.15))) continue
    tables.push(table);benches.push(...seats)
  }
  const exteriorBenches = tavernExteriorBenches(w, d, seed, 1)
  for (const item of [...tables, ...benches, ...exteriorBenches, counter, fireplace, serving]) item.x *= hand
  for (const table of tables) table.yaw*=hand
  for (const bench of benches) {bench.yaw*=hand;bench.heading*=hand}
  counter.yaw*=hand
  return { tables, benches, exteriorBenches, counter, serving, obstacles: [...tables, ...benches, counter, fireplace] }

}

export function tavernLocalPoint(building: BuildingDef, tile: TilePos): TilePos {
  return rotateBuildingPoint(tile.x - building.x - (building.w - 1) / 2,
    tile.z - building.z - (building.d - 1) / 2, -(building.rotation ?? 0))
}

/** Swept body clearance, rather than checking only the endpoints of a move. */
export function tavernSegmentClear(obstacles: readonly TavernObstacle[], a: TilePos, b: TilePos,
  allowedBench?: string): boolean {
  return obstacles.every(rect => {
    if (rect.id === allowedBench) return true
    let low = 0, high = 1
    for (const axis of ["x", "z"] as const) {
      const half = (axis === "x" ? rect.w : rect.d) / 2 + TAVERN_CLEARANCE
      const delta = b[axis] - a[axis], start = a[axis] - rect[axis]
      if (Math.abs(delta) < 1e-8) {
        if (Math.abs(start) > half) return true
      } else {
        const u = (-half - start) / delta, v = (half - start) / delta
        low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v))
        if (low > high) return true
      }
    }
    return false
  })
}

export function tavernFurnitureClear(building: BuildingDef, from: TilePos, to: TilePos): boolean {
  const { w, d } = rotatedFootprint(building, building.rotation)
  return tavernSegmentClear(tavernLayout(w, d, building.layoutSeed, building.hearthZ).obstacles, tavernLocalPoint(building, from), tavernLocalPoint(building, to))
}

/** Pauses at the counter, in the service aisle and near the drinking tables. */
export function tavernWorkStop(slot: number, stop: number, w: number, d: number, layoutSeed?: number, hearthZ?: number): TilePos {
  const stops = slot % 2 === 0
    ? [[.06, -.30], [0, -.39], [0, 0], [.17, .25]]
    : [[.34, -.30], [.41, -.23], [.32, .10], [.10, .36]]
  const [x, z] = stops[stop % stops.length]
  const point={ x: x*w*layoutHand("tavern",layoutSeed), z: z*d }
  const {obstacles}=tavernLayout(w,d,layoutSeed,hearthZ)
  if (tavernSegmentClear(obstacles,point,point)) return point
  // A shifted fireplace or counter must not turn a staff pause into an obstacle.
  const candidates=[{x:0,z:0},...[-.36,0,.36].flatMap(x=>[-.38,0,.38].map(z=>({x:x*w,z:z*d})))]
  return candidates.filter(p=>tavernSegmentClear(obstacles,p,p)).sort((a,b)=>Math.hypot(a.x-point.x,a.z-point.z)-Math.hypot(b.x-point.x,b.z-point.z))[0] ?? point
}
