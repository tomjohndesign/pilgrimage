import type * as THREE from "three"

/** Invisible, less than 1/100 of a character texel. Never applied to artwork. */
export const SORT_RAIL_OFFSET = .0001

/** Stable per drawable, including parts which share a selection ID. */
export function sortRailId(id: THREE.Vector3, part = 0): number {
  const object = Math.round(id.x * 255) + 256 * Math.round(id.y * 255) + 65536 * Math.round(id.z * 255)
  return object * 16 + part
}

export function sortRailOffset(id: number): number {
  // Multiplicative hash distributes nearby identities across the narrow rail.
  return ((Math.imul(id, 2654435761) >>> 0) / 0xffffffff * 2 - 1) * SORT_RAIL_OFFSET
}

/** Project the logical path and its local normal through the actual camera.
 * Seat offsets are ground positions in the rig, not atlas registration points.
 * JS doubles retain the sub-pixel rail; quantization removes cardinal-angle
 * floating-point noise so exact ties use identity, never batch visitation. */
export function sortRailDistance(world: ArrayLike<number>, view: ArrayLike<number>, heading: number, id: number,
  seat?: { x: number; z: number }, ground?: THREE.Vector4): number {
  const sin = Math.sin(heading), cos = Math.cos(heading), rail = sortRailOffset(id)
  const dx = (seat?.x ?? 0) * cos + (seat?.z ?? 0) * sin + cos * rail
  const dz = -(seat?.x ?? 0) * sin + (seat?.z ?? 0) * cos - sin * rail
  const dy = ground && ground.y > 0 ? -(ground.x * dx + ground.z * dz) / ground.y : 0
  return Math.round(-(view[2] * (world[12] + dx) + view[6] * (world[13] + dy) + view[10] * (world[14] + dz) + view[14]) * 1e9) / 1e9
}
