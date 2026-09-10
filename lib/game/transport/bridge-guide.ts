import { bridgeLayout } from "../map/bridges"
import { insideBridgeCorner } from "../map/bridge-corners"
import type { GameMap } from "../map/types"
import { CART_WHEEL_X, CART_WIDTH_SCALE, RIG_TO_WORLD } from "./assets"
import { cartOnRoute, followCart, type CartPose } from "./follow"
import { advanceCartProgress, cartTrafficPoint, DEFAULT_CART_TURN_RADIUS } from "./route"

export function cartGroundContacts(pose: CartPose, scale: number) {
  const half=CART_WHEEL_X*CART_WIDTH_SCALE*RIG_TO_WORLD*scale
  return [-1,1].map(side=>({x:pose.x+side*Math.cos(pose.heading)*half,z:pose.z-side*Math.sin(pose.heading)*half}))
}

/** Test the actual timber footprint, not the nearest tile's deck height. */
export function onBridgeDeck(map: GameMap, wx: number, wz: number) {
  const x=wx+(map.width-1)/2,z=wz+(map.depth-1)/2,layout=bridgeLayout(map)
  if(layout.corners.some(c=>insideBridgeCorner(c,x,z)))return true
  if(layout.connectors.some(c=>Math.abs(x-c.x)<=(c.open[0]||c.open[1]?0.5:0.42)+1e-6&&
    Math.abs(z-c.z)<=(c.open[2]||c.open[3]?0.5:0.42)+1e-6))return true
  for(const span of layout.spans)for(const p of span.tiles)
    if(Math.abs((x-p.x)*span.dx+(z-p.z)*span.dz)<=0.500001&&Math.abs((z-p.z)*span.dx-(x-p.x)*span.dz)<=0.420001)return true
  return layout.ramps.some(p=>Math.abs((x-p.x)*p.dx+(z-p.z)*p.dz)<=0.500001&&Math.abs((z-p.z)*p.dx-(x-p.x)*p.dz)<=0.420001)
}

const bridgeRanges=new WeakMap<GameMap,Array<{start:number;end:number}>>()
function ranges(map:GameMap) {
  const cached=bridgeRanges.get(map);if(cached)return cached
  const layout=bridgeLayout(map),out:Array<{start:number;end:number}>=[]
  for(const [i,p] of (map.road??[]).entries())if(layout.rise[p.z*map.width+p.x]>0){
    const last=out.at(-1)
    if(last&&last.end===i-0.5)last.end=i+0.5;else out.push({start:i-0.5,end:i+0.5})
  }
  bridgeRanges.set(map,out);return out
}

/** Bridge-only gameplay assist. The axle follows the deck's route and the
 * body turns along its own travel, independently of the horse. Fixed wheel
 * sprites stay fixed; the hitch gap can shorten through a bend so the cart
 * stays on the deck without crabbing sideways toward the horse.
 * A two-tile ground transition avoids a snap when entering/leaving the assist. */
export function roadCartPose(map:GameMap,progress:number,direction:1|-1,wheelbase:number,scale:number,
  previous?:CartPose,radius=DEFAULT_CART_TURN_RADIUS):CartPose {
  const point=(p:number)=>cartTrafficPoint(map,p,direction,radius),hitch=point(progress)
  if(previous&&Math.hypot(hitch.x-previous.hitch.x,hitch.z-previous.hitch.z)<1e-8)return {...previous,distance:0}
  // The visual body can articulate independently. The ground blend still
  // needs the drawbar's heading, otherwise each step tries to realign the
  // hitch to the body and feeds that correction back into the next step.
  const towing=previous?.bridgeGuided?{...previous,heading:Math.atan2(previous.hitch.x-previous.x,previous.hitch.z-previous.z)}:previous
  const free=towing?followCart(towing,hitch,wheelbase):cartOnRoute(progress,direction,wheelbase,point)
  const bridges=ranges(map)
  if(!bridges.length)return free
  // Fast reject while the whole convoy is well away from a crossing.
  if(!bridges.some(r=>progress>=r.start-wheelbase*2-2&&progress<=r.end+wheelbase*2+2))return free
  const axleProgress=advanceCartProgress(map,progress,-direction*wheelbase,radius),target=point(axleProgress)
  const first=Math.min(progress,axleProgress),last=Math.max(progress,axleProgress)
  const gap=Math.min(...bridges.map(r=>Math.max(0,r.start-last,first-r.end)))
  const t=Math.max(0,1-gap/2),weight=t*t*(3-2*t)
  if(!weight)return free
  let x=free.x+(target.x-free.x)*weight,z=free.z+(target.z-free.z)*weight
  // Merging from a side lane adds lateral travel on the approach. The blended
  // axle may shorten its hitch gap, but must never stretch the rigid drawbar.
  const gapToHitch=Math.hypot(x-hitch.x,z-hitch.z)
  if(gapToHitch>wheelbase){x=hitch.x+(x-hitch.x)*wheelbase/gapToHitch;z=hitch.z+(z-hitch.z)*wheelbase/gapToHitch}
  const distance=previous?Math.hypot(x-previous.x,z-previous.z):0
  // Face the axle's actual movement, including the ground transition. Looking
  // at the hitch rotates the cart too early when the horse has cleared a bend.
  // A newly mounted/seeked cart has no movement sample, so use the route tangent.
  let heading=previous?.heading??free.heading
  if(previous&&distance>1e-8)heading=Math.atan2(x-previous.x,z-previous.z)
  else if(!previous){
    const before=point(advanceCartProgress(map,axleProgress,-direction*.001,radius))
    const after=point(advanceCartProgress(map,axleProgress,direction*.001,radius))
    heading=Math.atan2(after.x-before.x,after.z-before.z)
  }
  return {x,z,heading,hitch,distance,bridgeGuided:true}
}
