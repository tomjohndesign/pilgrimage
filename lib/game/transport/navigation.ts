import { mapBuildingQuery } from "../building-spatial"
import { buildingYaw, rotateBuildingPoint, rotatedFootprint } from "../building-rotation"
import { marketLayout, marketYardContains } from "../market-layout"
import type { TreePlacement } from "../trees/placement"
import { pastureSegmentClear, type StallObstacle } from "./stall"
import { cartGroundContacts, onBridgeDeck } from "./bridge-guide"
import { cartTrafficPoint } from "./route"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, tileAt, type GameMap } from "../map/types"
import { buildingAt } from "../settlement"
import { bridgeCornerAt, bridgeLayout } from "../map/bridges"
import { groundHeight } from "../map/elevation"
import { TILE_HEIGHT } from "../map/terrain"
import { BASE_CHARACTER_SCALE } from "../base-person/gait"
import { RIG_TO_WORLD, CART_WIDTH_SCALE, type Puller } from "./assets"
import { alignCart, cartOnRoute, followCart, type CartPose } from "./follow"
import { roadsideStall, roundRoute, routeLength, routePoint, type Point } from "./roadside"

/** Cart lanes ease through broad turns and keep left like the walking traffic. */
export function convoyPoint(map: GameMap, progress: number, _scale = BASE_CHARACTER_SCALE, direction: 1 | -1 = 1): Point {
  return cartTrafficPoint(map, progress, direction)
}

/** Shared oriented footprints for carts, shafts and unmounted horses. */
export function convoyBounds(pose: CartPose, puller: Puller, scale: number, animalHeading = pose.heading): StallObstacle[] {
  const unit = RIG_TO_WORLD * scale
  const wheelbase = Math.hypot(pose.hitch.x - pose.x, pose.hitch.z - pose.z)
  const boxes: Array<{ centre: Point; width: number; back: number; front: number; heading?: number }> = wheelbase > 0 ? [{ centre: pose, width: 1.06 * CART_WIDTH_SCALE * unit, back: 1.02 * unit, front: 1.02 * unit },
    { centre: pose, width: 0.68 * unit, back: 0, front: wheelbase }] : []
  if (puller !== "hand") boxes.push({ centre: pose.hitch, width: 0.5 * unit, back: 1.1 * unit, front: 1.75 * unit, heading: animalHeading })
  return boxes.map(box => {
    const heading = box.heading ?? pose.heading, shift = (box.front - box.back) / 2
    return { x: box.centre.x + Math.sin(heading) * shift, z: box.centre.z + Math.cos(heading) * shift,
      heading, halfWidth: box.width, halfLength: (box.front + box.back) / 2 }
  })
}

/** Test oriented body bounds against every touched tile, including shafts and
 * the animal's head. Tile/box SAT catches edges without a per-pixel grid. */
export function convoyClear(map: GameMap, pose: CartPose, puller: Puller, scale: number, grassOnly = false, animalHeading = pose.heading): boolean {
  const nearby = mapBuildingQuery(map)
  const boxes = convoyBounds(pose, puller, scale, animalHeading)
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
    const sin = Math.sin(box.heading), cos = Math.cos(box.heading)
    const halfLength = box.halfLength, cx = box.x, cz = box.z
    const rx = Math.abs(cos) * box.halfWidth + Math.abs(sin) * halfLength
    const rz = Math.abs(sin) * box.halfWidth + Math.abs(cos) * halfLength
    for (let z = worldToTileZ(map, cz - rz); z <= worldToTileZ(map, cz + rz); z++) {
      for (let x = worldToTileX(map, cx - rx); x <= worldToTileX(map, cx + rx); x++) {
        const dx = tileToWorldX(map, x) - cx, dz = tileToWorldZ(map, z) - cz
        const tileRadius = (Math.abs(sin) + Math.abs(cos)) / 2
        if (Math.abs(dx * cos - dz * sin) >= box.halfWidth + tileRadius - 1e-6 ||
          Math.abs(dx * sin + dz * cos) >= halfLength + tileRadius - 1e-6) continue
        const terrain = tileAt(map, x, z)
        // A corner extension covers part of a water tile. Clip this body's
        // footprint to that tile and check its actual boundary, not its centre.
        if (!grassOnly && terrain === "water") {
          // The bridge assist permits body/shaft overhang while the animal
          // and both wheels remain supported. Woods/buildings still collide.
          if(bridgeOverhang)continue
          let polygon: Point[] = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>({x:cx+cos*box.halfWidth*u+sin*halfLength*v,z:cz-sin*box.halfWidth*u+cos*halfLength*v}))
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
        const building = nearby({ x, z }).find(b => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d)
        if ((building && !marketYardContains(building, { x, z })) || (!layout.rise[z * map.width + x] && Math.abs(groundHeight(map, x, z) - height) >= 0.3)) return false
      }
    }
  }
  return true
}

export interface ShrineParking {
  entry: Point[]; exit: Point[]; pose: CartPose; parked: CartPose; returnProgress: number; distance: number; walking: boolean; tree?: TreePlacement
}

export interface ParkingContext {
  trees: readonly TreePlacement[]
  obstacles?: readonly StallObstacle[]
  people?: readonly Point[]
}

function overlaps(a: StallObstacle, b: StallObstacle, clearance = .12) {
  return [a.heading, b.heading].every(heading => [heading, heading + Math.PI / 2].every(axis => {
    const x = Math.cos(axis), z = -Math.sin(axis)
    const radius = (box: StallObstacle) => Math.abs(x * Math.cos(box.heading) - z * Math.sin(box.heading)) * box.halfWidth +
      Math.abs(x * Math.sin(box.heading) + z * Math.cos(box.heading)) * box.halfLength
    return Math.abs((a.x - b.x) * x + (a.z - b.z) * z) < radius(a) + radius(b) + clearance
  }))
}


/** Physical structures always stop carts, even on pedestrian diversions or
 * during a large simulation step. A market's reserved open yard is outside. */
export function convoyBuildingsClear(map: GameMap, pose: CartPose, puller: Puller, scale: number, animalHeading = pose.heading): boolean {
  const bounds = convoyBounds(pose, puller, scale, animalHeading)
  // Query a padded cell for each rigid body, then retain the exact oriented
  // overlap test. A long cart can touch a building outside its hitch's cell.
  const padding = Math.ceil(Math.max(0, ...bounds.map(body => Math.hypot(body.halfWidth, body.halfLength))))
  const nearby = mapBuildingQuery(map, padding)
  return bounds.every(body => nearby({ x: body.x + (map.width - 1) / 2, z: body.z + (map.depth - 1) / 2 }).every(building => {
    const size = rotatedFootprint(building, building.rotation)
    const market = building.buildType === "market" ? marketLayout(size.w, size.d) : null
    const offset = rotateBuildingPoint(0, market?.stallZ ?? 0, building.rotation)
    const box = { x: tileToWorldX(map, building.x) + (building.w - 1) / 2 + offset.x,
      z: tileToWorldZ(map, building.z) + (building.d - 1) / 2 + offset.z,
      heading: buildingYaw(building.rotation), halfWidth: size.w / 2, halfLength: (market?.stallDepth ?? size.d) / 2 }
    return !overlaps(body, box, 0)
  }))
}

/** Account for actual trunks, reserved transport, stalls and people as well as terrain. */
export function parkingClear(map: GameMap, pose: CartPose, puller: Puller, scale: number, context: ParkingContext, grassOnly = false, animalHeading = pose.heading) {
  if (!convoyClear(map, pose, puller, scale, grassOnly, animalHeading)) return false
  const bounds = convoyBounds(pose, puller, scale, animalHeading)
  return !(context.obstacles ?? []).some(obstacle => bounds.some(box => overlaps(box, obstacle))) &&
    context.trees.every(tree => pastureSegmentClear(tree, tree, bounds, (tree.shape?.trunkRadius ?? 0.18) * (tree.scale ?? 1) + 0.08)) &&
    (context.people ?? []).every(person => pastureSegmentClear(person, person, bounds, 0.2))
}

/** A short tie stays on this verge; it must not cross a walking or driving path. */
export function parkingTree(map: GameMap, pose: CartPose, trees: readonly TreePlacement[]) {
  return trees.filter(tree => {
    const distance = Math.hypot(tree.x - pose.hitch.x, tree.z - pose.hitch.z)
    if (tree.walking || distance > 2.5 || distance < 0.65) return false
    for (let d = 0; d < distance - 0.35; d += 0.1) {
      const x = worldToTileX(map, pose.hitch.x + (tree.x - pose.hitch.x) * d / distance)
      const z = worldToTileZ(map, pose.hitch.z + (tree.z - pose.hitch.z) * d / distance)
      if (!["grass", "clearing", "forest", "darkwood"].includes(tileAt(map, x, z) ?? "") || buildingAt(map, x, z)) return false
    }
    return true
  }).sort((a, b) => Math.hypot(a.x - pose.hitch.x, a.z - pose.hitch.z) - Math.hypot(b.x - pose.hitch.x, b.z - pose.hitch.z))[0]
}

/** Try compact pull-offs near the junction. Validate the entire rigid convoy
 * through arrival AND departure before committing; blocked grass means no visit. */
export function shrineParking(map: GameMap, progress: number, direction: 1 | -1, wheelbase: number, puller: Puller, scale: number,
  occupied: readonly CartPose[] = [], context: ParkingContext = { trees: [] }, requireTree = true): ShrineParking | null {
  const reserved = { ...context, obstacles: [...(context.obstacles ?? []), ...occupied.flatMap(pose => convoyBounds(pose, "horse", scale))] }
  const start = convoyPoint(map, progress, scale, direction), ahead = convoyPoint(map, progress + direction * 0.1, scale, direction)
  const heading = Math.atan2(ahead.x - start.x, ahead.z - start.z)
  const initial = cartOnRoute(progress, direction, wheelbase, p => convoyPoint(map, p, scale, direction))
  for (const depth of [1.5, 2, 2.5, 3]) for (const side of [1, -1]) for (const advance of [5, 6, 7]) {
    const returnProgress = progress + direction * advance
    if (returnProgress < 0 || returnProgress > map.road!.length - 1) continue
    const local = (along: number, across: number) => ({ x: start.x + Math.sin(heading) * along + Math.cos(heading) * across * side,
      z: start.z + Math.cos(heading) * along - Math.sin(heading) * across * side })
    const park = local(2 + wheelbase, depth), end = convoyPoint(map, returnProgress, scale, direction)
    const departure = local(2.6 + wheelbase, depth)
    // Pull forward onto the road; never ask the horse to reverse the wagon.
    if ((end.x - departure.x) * Math.sin(heading) + (end.z - departure.z) * Math.cos(heading) < 0.5) continue
    const entry = roundRoute([start, local(0.4, 0), local(1.4, depth), park], 0.4)
    const exit = roundRoute([park, departure, end, convoyPoint(map, returnProgress + direction * 0.5, scale, direction)], 0.4)
    let pose = initial, parked = initial, valid = true
    for (const route of [entry, exit]) {
      const length = routeLength(route)
      for (let d = 0; d < length + 0.04; d += 0.04) {
        pose = followCart(pose, routePoint(route, Math.min(d, length)), wheelbase)
        if (!parkingClear(map, pose, puller, scale, reserved)) { valid = false; break }
      }
      if (!valid) break
      if (route === entry) { parked = pose; if (!parkingClear(map, parked, puller, scale, reserved, true)) { valid = false; break } }
    }
    const tree = valid && puller !== "hand" ? parkingTree(map, parked, context.trees) : undefined
    if (valid && (!requireTree || puller === "hand" || tree)) return { tree, entry, exit, pose: initial, parked, returnProgress: returnProgress + direction * 0.5, distance: 0, walking: false }
  }
  return null
}

/** Roadside shops need convoy clearance on either verge; animals graze without a tether. */
export function stallParking(map: GameMap, from: Point, progress: number, direction: 1 | -1, wheelbase: number, scale: number, puller: Puller, context: ParkingContext) {
  return roadsideStall(map, from, progress, direction, wheelbase, scale, puller, pitch => {
    const parked = alignCart(pitch.park, pitch.heading, wheelbase)
    if (!parkingClear(map, parked, puller, scale, context, true)) return false
    let pose = alignCart(from, pitch.heading, wheelbase)
    for (const route of [pitch.entry, pitch.exit]) {
      const length = routeLength(route)
      for (let d = 0; d <= length + 0.04; d += 0.04) {
        pose = followCart(pose, routePoint(route, Math.min(d, length)), wheelbase)
        if (!parkingClear(map, pose, puller, scale, context)) return false
      }
    }
    return true
  })
}
