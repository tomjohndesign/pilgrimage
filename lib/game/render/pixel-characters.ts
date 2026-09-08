import * as THREE from "three"
import { OUTLINE_ID_LAYER } from "./outline"

/** Additional render layers; original layers stay intact for picking and previews. */
export const CHARACTER_COLOR_LAYER = 3
export const CHARACTER_ID_LAYER = 4

export function tagPixelCharacters(roots: Iterable<THREE.Object3D>, scene: THREE.Scene) {
  for (const root of roots) root.traverseVisible(object => {
    if (object.layers.isEnabled(0)) object.layers.enable(CHARACTER_COLOR_LAYER)
    if (object.layers.isEnabled(OUTLINE_ID_LAYER)) object.layers.enable(CHARACTER_ID_LAYER)
  })
  scene.traverseVisible(object => {
    if (object instanceof THREE.Light) object.layers.enable(CHARACTER_COLOR_LAYER)
  })
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
