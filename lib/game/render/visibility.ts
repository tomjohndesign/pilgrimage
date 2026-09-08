import type { Object3D } from "three"

/** A nested sprite can be locally visible inside a culled person or vehicle. */
export function isWorldVisible(object: Object3D | null | undefined): boolean {
  if (!object) return false
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false
  }
  return true
}
