import * as THREE from "three"
import { updateVisibleWorldMatrices } from "./static-blocks"

const sources = new WeakMap<THREE.Scene, Set<THREE.Object3D>>()
const ancestors = new WeakMap<THREE.Sprite, THREE.Object3D>()

/** Batched source sprites remain in the scene for posing and picking. Prune
 * their otherwise empty hierarchy only while rendering the shared batches. */
export function batchSourceRoot(sprite: THREE.Sprite): THREE.Object3D {
  let root = ancestors.get(sprite)
  if (root) return root
  root = sprite.parent ?? sprite
  for (let node = sprite.parent; node; node = node.parent) if (node.name === "traveler-unit") { root = node; break }
  ancestors.set(sprite, root)
  return root
}

function hasVisibleDrawing(object: THREE.Object3D): boolean {
  if (!object.visible) return false
  if (object instanceof THREE.Light) return true
  if (object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line || object instanceof THREE.Points) {
    const material = object.material
    if (Array.isArray(material) ? material.some(part => part.visible) : material.visible) return true
  }
  return object.children.some(hasVisibleDrawing)
}

export function updateBatchSourceVisibility(scene: THREE.Scene, candidates: Iterable<THREE.Object3D>) {
  const roots = sources.get(scene) ?? new Set<THREE.Object3D>()
  roots.clear()
  for (const root of candidates) if (root.visible && !hasVisibleDrawing(root)) {
    // Invisible-material click volumes still need current world transforms for
    // pointer events. Resolve them before excluding this subtree from rendering.
    updateVisibleWorldMatrices(root)
    roots.add(root)
  }
  sources.set(scene, roots)
}

export function batchedSourceRoots(scene: THREE.Scene): Iterable<THREE.Object3D> { return sources.get(scene) ?? [] }
export function clearBatchSourceVisibility(scene: THREE.Scene) { sources.delete(scene) }
