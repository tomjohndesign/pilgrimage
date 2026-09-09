import * as THREE from "three"
import { updateVisibleWorldMatrices } from "./static-blocks"
import { updateTranslatedWorld } from "./sprite-transforms"

const sources = new WeakMap<THREE.Scene, Set<THREE.Object3D>>()
const ancestors = new WeakMap<THREE.Sprite, THREE.Object3D>()
interface SimpleSource {
  pose: THREE.Object3D; sprite: THREE.Sprite; ids: THREE.Sprite; hit: THREE.Mesh
  dirty: boolean; valid: boolean
}
const simpleSources = new WeakMap<THREE.Object3D, SimpleSource>()

/** Most travelers contain only a pose pair and a click volume. Watch topology
 * changes once, instead of rediscovering that empty hierarchy every frame.
 * Equipment/selection additions invalidate the shortcut synchronously. */
export function registerSimpleBatchSource(sprite: THREE.Sprite, ids: THREE.Sprite): () => void {
  const pose = sprite.parent, root = pose?.parent
  if (!(pose instanceof THREE.Group) || !(root instanceof THREE.Group) || root.name !== "traveler-unit") return () => {}
  const hit = root.children.find(child => child.name === "character-hit-target")
  if (!(hit instanceof THREE.Mesh)) return () => {}
  const source: SimpleSource = { pose, sprite, ids, hit, dirty: true, valid: false }
  const invalidate = () => { source.dirty = true }
  for (const object of [root, pose, hit]) {
    object.addEventListener("childadded", invalidate); object.addEventListener("childremoved", invalidate)
  }
  simpleSources.set(root, source)
  return () => {
    for (const object of [root, pose, hit]) {
      object.removeEventListener("childadded", invalidate); object.removeEventListener("childremoved", invalidate)
    }
    if (simpleSources.get(root) === source) simpleSources.delete(root)
  }
}

function simpleSource(root: THREE.Object3D): SimpleSource | undefined {
  const source = simpleSources.get(root)
  if (!source) return
  const { pose, sprite, ids, hit } = source
  if (source.dirty) {
    source.valid = root.children.length === 2 && pose.parent === root && hit.parent === root &&
      pose.children.length === 2 && sprite.parent === pose && ids.parent === pose && hit.children.length === 0
    source.dirty = false
  }
  if (source.valid && !sprite.visible && !ids.visible && !Array.isArray(hit.material) && !hit.material.visible) return source
}

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

function hasVisibleDrawing(object: THREE.Object3D, picking: THREE.Object3D[]): boolean {
  if (!object.visible) return false
  if (object instanceof THREE.Light) return true
  if (object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line || object instanceof THREE.Points) {
    const material = object.material
    if (Array.isArray(material) ? material.some(part => part.visible) : material.visible) return true
    picking.push(object)
  }
  for (const child of object.children) if (hasVisibleDrawing(child, picking)) return true
  return false
}

export function updateBatchSourceVisibility(scene: THREE.Scene, candidates: Iterable<THREE.Object3D>, frameTime?: number) {
  const roots = sources.get(scene) ?? new Set<THREE.Object3D>()
  roots.clear()
  const picking: THREE.Object3D[] = [], prepared = new Set<THREE.Object3D>()
  const prepare = (object: THREE.Object3D, root: THREE.Object3D) => {
    if (object === root || prepared.has(object)) return
    if (object.parent) prepare(object.parent, root)
    object.updateWorldMatrix(false, false)
    prepared.add(object)
  }
  for (const root of candidates) {
    if (!root.visible) continue
    const simple = simpleSource(root)
    if (simple && frameTime !== undefined && root.userData.poseWorldFrame === frameTime) {
      if (simple.hit.visible) updateTranslatedWorld(simple.hit)
      roots.add(root); continue
    }
    picking.length = 0
    if (hasVisibleDrawing(root, picking)) continue
    // Invisible-material click volumes still need current world transforms for
    // pointer events. A live traveler already resolved its world transform and
    // sprite pose; only the remaining picking branches need matrix updates.
    if (frameTime !== undefined && root.name === "traveler-unit" && root.userData.poseWorldFrame === frameTime) {
      prepared.clear()
      for (const target of picking) prepare(target, root)
    } else updateVisibleWorldMatrices(root)
    roots.add(root)
  }
  sources.set(scene, roots)
}

export function batchedSourceRoots(scene: THREE.Scene): Iterable<THREE.Object3D> { return sources.get(scene) ?? [] }
export function clearBatchSourceVisibility(scene: THREE.Scene) { sources.delete(scene) }
