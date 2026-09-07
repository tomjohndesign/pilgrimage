import { cartGroundContacts, onBridgeDeck } from "./bridge-guide"
import { cartRoutePoint } from "./route"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, tileAt, type GameMap } from "../map/types"
import { buildingAt } from "../settlement"
import { bridgeCornerAt, bridgeLayout } from "../map/bridges"
import { groundHeight } from "../map/elevation"
import { TILE_HEIGHT } from "../map/terrain"
import { BASE_CHARACTER_SCALE } from "../base-person/gait"
import { RIG_TO_WORLD, CART_WIDTH_SCALE, type Puller } from "./assets"
import { cartOnRoute, followCart, type CartPose } from "./follow"
import { roundRoute, routeLength, routePoint, type Point } from "./roadside"

/** Only wagons ease into wider turns; the terrain and walking lanes stay fixed. */
export function convoyPoint(map: GameMap, progress: number, _scale = BASE_CHARACTER_SCALE): Point {
  return cartRoutePoint(map, progress)
}

/** Test oriented body bounds against every touched tile, including shafts and
 * the animal's head. Tile/box SAT catches edges without a per-pixel grid. */
export function convoyClear(map: GameMap, pose: CartPose, puller: Puller, scale: number, grassOnly = false, animalHeading = pose.heading): boolean {
  const unit = RIG_TO_WORLD * scale
  const wheelbase = Math.hypot(pose.hitch.x - pose.x, pose.hitch.z - pose.z)
  const boxes: Array<{ centre: Point; width: number; back: number; front: number; heading?: number }> = [{ centre: pose, width: 1.06 * CART_WIDTH_SCALE * unit, back: 1.02 * unit, front: 1.02 * unit },
    { centre: pose, width: 0.68 * unit, back: 0, front: wheelbase }]
  if (puller !== "hand") boxes.push({ centre: pose.hitch, width: 0.5 * unit, back: 1.1 * unit, front: 1.75 * unit, heading: animalHeading })
  const layout = bridgeLayout(map)
  const supported=(p:Point)=>{
    if(onBridgeDeck(map,p.x,p.z))return true
    const x=worldToTileX(map,p.x),z=worldToTileZ(map,p.z)
    return !layout.rise[z*map.width+x]&&["grass","clearing","dirt","path","track"].includes(tileAt(map,x,z)??"")
  }
  const bridgeOverhang=pose.bridgeGuided&&supported(pose.hitch)&&cartGroundContacts(pose,scale).every(supported)
  const hx = worldToTileX(map, pose.hitch.x), hz = worldToTileZ(map, pose.hitch.z)
  // Bridge ramps deliberately span the deck rise. Compare underlying ground
  // levels for ledges, rather than rejecting a long cart straddling a ramp.
  const height = layout.rise[hz * map.width + hx] || bridgeCornerAt(map, pose.hitch.x, pose.hitch.z)
    ? TILE_HEIGHT : groundHeight(map, hx, hz)
  for (const box of boxes) {
    const sin = Math.sin(box.heading ?? pose.heading), cos = Math.cos(box.heading ?? pose.heading)
    const halfLength = (box.front + box.back) / 2, shift = (box.front - box.back) / 2
    const cx = box.centre.x + sin * shift, cz = box.centre.z + cos * shift
    const rx = Math.abs(cos) * box.width + Math.abs(sin) * halfLength
    const rz = Math.abs(sin) * box.width + Math.abs(cos) * halfLength
    for (let z = worldToTileZ(map, cz - rz); z <= worldToTileZ(map, cz + rz); z++) {
      for (let x = worldToTileX(map, cx - rx); x <= worldToTileX(map, cx + rx); x++) {
        const dx = tileToWorldX(map, x) - cx, dz = tileToWorldZ(map, z) - cz
        const tileRadius = (Math.abs(sin) + Math.abs(cos)) / 2
        if (Math.abs(dx * cos - dz * sin) >= box.width + tileRadius - 1e-6 ||
          Math.abs(dx * sin + dz * cos) >= halfLength + tileRadius - 1e-6) continue
        const terrain = tileAt(map, x, z)
        // A corner extension covers part of a water tile. Clip this body's
        // footprint to that tile and check its actual boundary, not its centre.
        if (!grassOnly && terrain === "water") {
          // The bridge assist permits body/shaft overhang while the animal
          // and both wheels remain supported. Woods/buildings still collide.
          if(bridgeOverhang)continue
          let polygon: Point[] = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>({x:cx+cos*box.width*u+sin*halfLength*v,z:cz-sin*box.width*u+cos*halfLength*v}))
          for (const [axis,edge,sign] of [["x",tileToWorldX(map,x)-0.5,1],["x",tileToWorldX(map,x)+0.5,-1],["z",tileToWorldZ(map,z)-0.5,1],["z",tileToWorldZ(map,z)+0.5,-1]] as const) {
            const clipped: Point[]=[]
            for(let i=0;i<polygon.length;i++){
              const a=polygon[i],b=polygon[(i+1)%polygon.length],insideA=(a[axis]-edge)*sign>=-1e-8,insideB=(b[axis]-edge)*sign>=-1e-8
              if(insideA)clipped.push(a)
              if(insideA!==insideB){const t=(edge-a[axis])/(b[axis]-a[axis]);clipped.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t})}
            }
            polygon=clipped
          }
          for(let i=0;i<polygon.length;i++){
            const a=polygon[i],b=polygon[(i+1)%polygon.length],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/0.025))
            for(let j=0;j<=steps;j++)if(!bridgeCornerAt(map,a.x+(b.x-a.x)*j/steps,a.z+(b.z-a.z)*j/steps))return false
          }
          continue
        }
        if (!(terrain === "grass" || terrain === "clearing" || (!grassOnly && (terrain === "dirt" || terrain === "path" || terrain === "track" || terrain === "bridge")))) return false
        if (buildingAt(map, x, z) || (!layout.rise[z * map.width + x] && Math.abs(groundHeight(map, x, z) - height) >= 0.3)) return false
      }
    }
  }
  return true
}

export interface ShrineParking {
  entry: Point[]; exit: Point[]; pose: CartPose; parked: CartPose; returnProgress: number; distance: number; walking: boolean
}

/** Try compact pull-offs near the junction. Validate the entire rigid convoy
 * through arrival AND departure before committing; blocked grass means no visit. */
export function shrineParking(map: GameMap, progress: number, direction: 1 | -1, wheelbase: number, puller: Puller, scale: number,
  occupied: readonly CartPose[] = []): ShrineParking | null {
  const start = convoyPoint(map, progress, scale), ahead = convoyPoint(map, progress + direction * 0.1, scale)
  const heading = Math.atan2(ahead.x - start.x, ahead.z - start.z)
  const initial = cartOnRoute(progress, direction, wheelbase, p => convoyPoint(map, p, scale))
  for (const depth of [1.5, 2, 2.5, 3]) for (const side of [1, -1]) for (const advance of [5, 6, 7]) {
    const returnProgress = progress + direction * advance
    if (returnProgress < 0 || returnProgress > map.road!.length - 1) continue
    const local = (along: number, across: number) => ({ x: start.x + Math.sin(heading) * along + Math.cos(heading) * across * side,
      z: start.z + Math.cos(heading) * along - Math.sin(heading) * across * side })
    const park = local(2 + wheelbase, depth), end = convoyPoint(map, returnProgress, scale)
    if (occupied.some(p => Math.hypot(p.hitch.x - park.x, p.hitch.z - park.z) < wheelbase * 2 + 1)) continue
    const departure = local(2.6 + wheelbase, depth)
    // Pull forward onto the road; never ask the horse to reverse the wagon.
    if ((end.x - departure.x) * Math.sin(heading) + (end.z - departure.z) * Math.cos(heading) < 0.5) continue
    const entry = roundRoute([start, local(0.4, 0), local(1.4, depth), park], 0.4)
    const exit = roundRoute([park, departure, end, convoyPoint(map, returnProgress + direction * 0.5, scale)], 0.4)
    let pose = initial, parked = initial, valid = true
    for (const route of [entry, exit]) {
      const length = routeLength(route)
      for (let d = 0; d < length + 0.04; d += 0.04) {
        pose = followCart(pose, routePoint(route, Math.min(d, length)), wheelbase)
        if (!convoyClear(map, pose, puller, scale)) { valid = false; break }
      }
      if (!valid) break
      if (route === entry) { parked = pose; if (!convoyClear(map, parked, puller, scale, true)) { valid = false; break } }
    }
    if (valid) return { entry, exit, pose: initial, parked, returnProgress: returnProgress + direction * 0.5, distance: 0, walking: false }
  }
  return null
}
