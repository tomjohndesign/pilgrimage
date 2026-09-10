import { crossroadIslandAt } from "../map/crossroads"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, tileAt, type GameMap } from "../map/types"
import { bridgeLayout, bridgeCornerAt, surfaceHeight } from "../map/bridges"
import { diagonalRoadBend } from "../map/road"
import { roadLanePoint } from "../map/road-lane"
import type { Point } from "./roadside"

export const DEFAULT_CART_TURN_RADIUS = 1.5
/** Compact bridge landings require the hitch to reach the corner before turning. */
export const SHORT_BRIDGE_TURN_RADIUS = 0.2
export interface CartRouteNode extends Point { progress: number; distance: number }
const routes = new WeakMap<GameMap, Map<number, { tiles: GameMap["tiles"]; road: GameMap["road"]; buildings: GameMap["buildings"]; count: number; points: CartRouteNode[] }>>()

function clearCorridor(map: GameMap, a: Point, b: Point, width: number, onDeck = false) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x-a.x, b.z-a.z) / 0.15))
  for (let i = 0; i <= steps; i++) {
    const cx = a.x + (b.x-a.x)*i/steps, cz = a.z + (b.z-a.z)*i/steps
    if (onDeck) {
      for (const [dx,dz] of [[0,0],[width,0],[-width,0],[0,width],[0,-width]]) {
        const x=cx+dx,z=cz+dz,index=worldToTileZ(map,z)*map.width+worldToTileX(map,x)
        if (!bridgeCornerAt(map,x,z) && !(bridgeLayout(map).rise[index]>0)) return false
      }
      continue
    }
    const height = surfaceHeight(map, worldToTileX(map,cx),worldToTileZ(map,cz))
    for(let z=worldToTileZ(map,cz-width);z<=worldToTileZ(map,cz+width);z++)for(let x=worldToTileX(map,cx-width);x<=worldToTileX(map,cx+width);x++) {
      const dx=Math.max(0,Math.abs(tileToWorldX(map,x)-cx)-0.5), dz=Math.max(0,Math.abs(tileToWorldZ(map,z)-cz)-0.5)
      if(Math.hypot(dx,dz)>=width)continue
      if(crossroadIslandAt(map,x,z) || !["grass","clearing","dirt","path","track","bridge"].includes(tileAt(map,x,z)??"") ||
        map.buildings.some(b=>x>=b.x&&x<b.x+b.w&&z>=b.z&&z<b.z+b.d) || Math.abs(surfaceHeight(map,x,z)-height)>=0.3)return false
    }
  }
  return true
}

/** Cart-only circular corner fillets. Painted paths and pedestrian lanes are
 * deliberately independent. Original tile progress still locates shops/stops. */
export function cartRoute(map: GameMap, turnRadius = DEFAULT_CART_TURN_RADIUS): CartRouteNode[] {
  let cache=routes.get(map);if(!cache){cache=new Map();routes.set(map,cache)}
  const old=cache.get(turnRadius),road=map.road??[]
  if(old&&old.tiles===map.tiles&&old.road===road&&old.buildings===map.buildings&&old.count===map.buildings.length)return old.points
  const bridges=bridgeLayout(map)
  const source=road.map((p,progress)=>{
    // A ground staircase is painted as a diagonal ribbon. Tile centres weave
    // across that ribbon and make animals travel farther than the road itself.
    // Start from the shared diagonal centreline before fitting convoy corners;
    // bridge landings retain their supported tile-centre route.
    const lane=bridges.rise[p.z*map.width+p.x]===0 && diagonalRoadBend(map,p.x,p.z)
      ? roadLanePoint(map,road,progress,0) : null
    return {x:tileToWorldX(map,lane?.x??p.x),z:tileToWorldZ(map,lane?.z??p.z),progress}
  })
  // Collapse straight runs only: radius controls the corner, not a new global
  // path simplifier that cuts across several successive bends.
  const knots=source.filter((b,i)=>{
    if(!i||i===source.length-1)return true
    const a=source[i-1],c=source[i+1]
    return Math.abs((b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x))>1e-8
  })
  const points: CartRouteNode[]=[]
  const add=(p:Point,progress:number)=>{
    const before=points.at(-1)
    if(before&&Math.hypot(p.x-before.x,p.z-before.z)<1e-8)return
    points.push({...p,progress,distance:(before?.distance??0)+(before?Math.hypot(p.x-before.x,p.z-before.z):0)})
  }
  if(!source.length)return []
  add(source[0],0)
  for(let i=1;i<knots.length-1;i++){
    const a=knots[i-1],b=knots[i],c=knots[i+1]
    const incoming=Math.hypot(b.x-a.x,b.z-a.z),outgoing=Math.hypot(c.x-b.x,c.z-b.z)
    const ix=(b.x-a.x)/incoming,iz=(b.z-a.z)/incoming,ox=(c.x-b.x)/outgoing,oz=(c.z-b.z)/outgoing
    const angle=Math.acos(Math.max(-1,Math.min(1,ix*ox+iz*oz))),side=Math.sign(ix*oz-iz*ox)
    if(!side||angle>=Math.PI-1e-6){add(b,b.progress);continue}
    const tile=road[b.progress],onDeck=bridges.rise[tile.z*map.width+tile.x]>0
    const corners=bridges.corners.filter(c=>c.x===tile.x&&c.z===tile.z)
    const deckRadius=corners.some(c=>!c.envelope) ? SHORT_BRIDGE_TURN_RADIUS
      : Math.max(0.45,...corners.map(c=>c.radius))
    let accepted=false
    for(const requested of [turnRadius,turnRadius/2,0.4,0.2]){
      const reach=Math.min(Math.max(0.05,requested)*Math.tan(angle/2),incoming/2,outgoing/2,onDeck?deckRadius:Infinity)
      const radius=reach/Math.tan(angle/2),start={x:b.x-ix*reach,z:b.z-iz*reach}
      const centre={x:start.x-iz*side*radius,z:start.z+ix*side*radius}
      const startAngle=Math.atan2(start.z-centre.z,start.x-centre.x),steps=Math.max(16,Math.ceil(radius*angle/0.025))
      const from=b.progress-(b.progress-a.progress)*reach/incoming,to=b.progress+(c.progress-b.progress)*reach/outgoing
      const curve=Array.from({length:steps+1},(_,j)=>({x:centre.x+Math.cos(startAngle+side*angle*j/steps)*radius,z:centre.z+Math.sin(startAngle+side*angle*j/steps)*radius}))
      if(curve.every((p,j)=>!j||clearCorridor(map,curve[j-1],p,onDeck?0.05:0.65,onDeck))){
        curve.forEach((p,j)=>add(p,from+(to-from)*j/steps));accepted=true;break
      }
    }
    if(!accepted)add(b,b.progress)
  }
  add(source.at(-1)!,source.length-1)
  cache.set(turnRadius,{road,tiles:map.tiles,buildings:map.buildings,count:map.buildings.length,points})
  return points
}

function segment(route:CartRouteNode[],value:number,key:"progress"|"distance") {
  let lo=0,hi=route.length-1
  while(hi-lo>1){const mid=(lo+hi)>>1;if(route[mid][key]<=value)lo=mid;else hi=mid}
  const a=route[lo],b=route[hi],t=(value-a[key])/Math.max(1e-8,b[key]-a[key])
  return {a,b,t}
}
export function cartRoutePoint(map:GameMap,progress:number,radius=DEFAULT_CART_TURN_RADIUS):Point {
  const route=cartRoute(map,radius);if(route.length<2)return route[0]??{x:0,z:0}
  const {a,b,t}=segment(route,progress,"progress")
  return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}
}
/** Advance by physical travel so the cart does not speed up at a tile boundary. */
export function advanceCartProgress(map:GameMap,progress:number,distance:number,radius=DEFAULT_CART_TURN_RADIUS) {
  const route=cartRoute(map,radius);if(route.length<2)return progress
  const {a,b,t}=segment(route,progress,"progress"),next=a.distance+(b.distance-a.distance)*t+distance
  const s=segment(route,next,"distance")
  return s.a.progress+(s.b.progress-s.a.progress)*s.t
}
