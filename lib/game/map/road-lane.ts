import { bridgeLayout } from "./bridges"
import { diagonalRoadBend, isRoadTerrain, sampleRoadBend } from "./road"
import { tileAt, type GameMap, type TilePos } from "./types"

/** Sample a road tile's rendered curve, offset along its local left normal.
 * Progress still counts tile centres so junctions and arrival triggers retain
 * their indices; half-integers are the shared entrances between tiles. */
export function roadLanePoint(map: GameMap, route: readonly TilePos[], progress: number, lane: number): TilePos | null {
  const i = Math.max(0, Math.min(route.length - 1, Math.floor(progress + 0.5)))
  const p = route[i], a = route[Math.max(0, i - 1)], b = route[Math.min(route.length - 1, i + 1)]
  if (!p || route.length < 2) return null
  const onDeck = bridgeLayout(map).rise[p.z * map.width + p.x] > 0
  if (!onDeck && !isRoadTerrain(tileAt(map, p.x, p.z))) return null
  const incoming = i === 0 ? { x: b.x - p.x, z: b.z - p.z } : { x: p.x - a.x, z: p.z - a.z }
  const outgoing = i === route.length - 1 ? incoming : { x: b.x - p.x, z: b.z - p.z }
  if (Math.abs(incoming.x) + Math.abs(incoming.z) !== 1 || Math.abs(outgoing.x) + Math.abs(outgoing.z) !== 1) return null
  const dot = incoming.x * outgoing.x + incoming.z * outgoing.z
  if (dot < 0) return null
  const t = progress - i + 0.5
  let x: number, z: number, dx: number, dz: number
  if (dot === 1) {
    x = p.x + incoming.x * (t - 0.5); z = p.z + incoming.z * (t - 0.5)
    dx = incoming.x; dz = incoming.z
  } else {
    // Ground staircase shortcuts can pass outside a raised landing. Bridge
    // bends instead join the actual deck entrances with a tangent arc.
    const bend = onDeck ? null : diagonalRoadBend(map, p.x, p.z)
    if (bend) {
      // The shared renderer curve is authored from the X entrance to Z.
      const forward = incoming.x !== 0, u = forward ? t : 1 - t
      const centre = sampleRoadBend(bend, u)
      x = centre.x - 0.5; z = centre.z - 0.5
      const v = 1 - u, sign = forward ? 1 : -1
      const tangent = (axis: "x" | "z") => sign * (bend.straight ? bend.b[axis] - bend.a[axis] :
        3 * v * v * (bend.controlA[axis] - bend.a[axis]) +
        6 * v * u * (bend.controlB[axis] - bend.controlA[axis]) +
        3 * u * u * (bend.b[axis] - bend.controlB[axis]))
      dx = tangent("x"); dz = tangent("z")
    } else {
      // Ordinary bends are quarter circles of radius half a tile, exactly
      // like roadShape in the terrain shader, with tangent entrances.
      const angle = t * Math.PI / 2, sin = Math.sin(angle), cos = Math.cos(angle)
      x = p.x + (-incoming.x + outgoing.x + incoming.x * sin - outgoing.x * cos) / 2
      z = p.z + (-incoming.z + outgoing.z + incoming.z * sin - outgoing.z * cos) / 2
      dx = incoming.x * cos + outgoing.x * sin
      dz = incoming.z * cos + outgoing.z * sin
    }
  }
  const length = Math.hypot(dx, dz)
  return { x: x + dz / length * lane, z: z - dx / length * lane }
}
