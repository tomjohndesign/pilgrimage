import * as THREE from "three"
import { OUTLINE_ID_LAYER } from "./outline"
import { isWorldVisible } from "./visibility"

/** Additional render layers; original layers stay intact for picking and previews. */
export const CHARACTER_COLOR_LAYER = 3
export const CHARACTER_ID_LAYER = 4

export function tagPixelCharacters(roots: Iterable<THREE.Object3D>, scene: THREE.Scene) {
  let drawable = false
  for (const root of roots) {
    // traverseVisible starts at the registered root, below the player's
    // visibility group. Check its ancestors before traversing that subtree.
    if (!isWorldVisible(root)) continue
    root.traverseVisible(object => {
      if (object.layers.isEnabled(0)) {
        object.layers.enable(CHARACTER_COLOR_LAYER)
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line || object instanceof THREE.Points) {
          const material = object.material
          const visibleMaterial = Array.isArray(material) ? material.some(part => part.visible) : material.visible
          const empty = object instanceof THREE.Mesh && (object.geometry.drawRange.count === 0
            || (object instanceof THREE.InstancedMesh && object.count === 0))
          if (visibleMaterial && !empty) drawable = true
        }
      }
      if (object.layers.isEnabled(OUTLINE_ID_LAYER)) object.layers.enable(CHARACTER_ID_LAYER)
    })
  }
  scene.traverseVisible(object => {
    if (object instanceof THREE.Light) object.layers.enable(CHARACTER_COLOR_LAYER)
  })
  return drawable
}

const visibilityBuffers: Array<{ roots: THREE.Object3D[]; visible: boolean[] }> = []
let visibilityDepth = 0

/** Hide whole character roots during world/ID passes, preserving animated visibility.
 * Reuse storage at each nesting depth instead of allocating a pair per person
 * per frame. Release object references on exit, including failed renders. */
export function withoutPixelRoots(roots: Iterable<THREE.Object3D>, render: () => void) {
  const depth = visibilityDepth++
  const previous = visibilityBuffers[depth] ?? (visibilityBuffers[depth] = { roots: [], visible: [] })
  try {
    for (const root of roots) {
      previous.roots.push(root); previous.visible.push(root.visible); root.visible = false
    }
    render()
  } finally {
    // Reverse order also restores correctly if an iterable repeats a root.
    for (let i = previous.roots.length - 1; i >= 0; i--) previous.roots[i].visible = previous.visible[i]
    previous.roots.length = previous.visible.length = 0
    visibilityDepth--
  }
}

export const withoutPixelCharacters = withoutPixelRoots
