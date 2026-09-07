import { ROAD_CORNER_SHOULDER_RADIUS } from "./road"
import type { CornerEnvelope } from "../transport/corner-envelope"
import type { TilePos } from "./types"

export const BRIDGE_DECK_HALF_WIDTH = 0.42
/** Slightly broader than the ground-path shoulder, while staying local to the bend. */
export const BRIDGE_CORNER_RADIUS = ROAD_CORNER_SHOULDER_RADIUS * 1.5
export interface BridgeCorner extends TilePos {
  sx: 1 | -1
  sz: 1 | -1
  radius: number
  kind: "road" | "track"
  envelope?: CornerEnvelope
}

/** Inside deck follows the swept track; plain corners retain the path shoulder.
 * Coordinates use tile centres, just like the surrounding bridge layout. */
export function insideBridgeCorner(corner: BridgeCorner, x: number, z: number, margin = 0) {
  const u = (x-corner.x)*corner.sx, v = (z-corner.z)*corner.sz
  const half = BRIDGE_DECK_HALF_WIDTH, centre = half + corner.radius
  if (corner.envelope) return u >= half-margin-1e-6 && v >= half-margin-1e-6 && v <= corner.envelope.reach+1e-6 &&
    u <= half + bridgeCornerReach(corner, v) + margin + 1e-6
  return u >= half-margin-1e-6 && v >= half-margin-1e-6 && u <= centre+1e-6 && v <= centre+1e-6 &&
    Math.hypot(u-centre,v-centre) >= corner.radius-margin-1e-6
}
export function bridgeCornerEdge(corner: BridgeCorner, t: number, inset = 0) {
  if (corner.envelope) {
    const edge = corner.envelope.edge, distance = edge.at(-1)!.distance * t
    let i = 1
    while (i < edge.length-1 && edge[i].distance < distance) i++
    const a = edge[i-1], b = edge[i], ratio = (distance-a.distance)/Math.max(1e-8,b.distance-a.distance)
    const u = a.x+(b.x-a.x)*ratio, v = a.z+(b.z-a.z)*ratio
    const length = Math.hypot(b.x-a.x,b.z-a.z)
    // Move rails toward the supported side of this contour.
    return { x:corner.x+corner.sx*(u+(b.z-a.z)/Math.max(1e-8,length)*inset),
      z:corner.z+corner.sz*(v-(b.x-a.x)/Math.max(1e-8,length)*inset) }
  }
  const centre=BRIDGE_DECK_HALF_WIDTH+corner.radius, r=corner.radius+inset, angle=t*Math.PI/2
  return { x:corner.x+corner.sx*(centre-r*Math.cos(angle)), z:corner.z+corner.sz*(centre-r*Math.sin(angle)) }
}

/** Width of the insert at a distance along either bridge arm. */
export function bridgeCornerReach(corner: BridgeCorner, along: number) {
  if (corner.envelope) {
    const {step,widths} = corner.envelope, offset = Math.max(0,(along-BRIDGE_DECK_HALF_WIDTH)/step)
    const i = Math.min(widths.length-1,Math.floor(offset)), j = Math.min(widths.length-1,i+1)
    return widths[i]+(widths[j]-widths[i])*Math.min(1,offset-i)
  }
  const radius = corner.radius
  const q = Math.max(0, Math.min(1, (BRIDGE_DECK_HALF_WIDTH + radius - along) / radius))
  return radius * (1 - (1 - q * q) ** 0.5)
}
