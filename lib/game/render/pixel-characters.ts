import * as THREE from "three"
import { OUTLINE_ID_LAYER } from "./outline"

/** Additional render layers; original layers stay intact for picking and previews. */
export const CHARACTER_COLOR_LAYER = 3
export const CHARACTER_ID_LAYER = 4

export function tagPixelCharacters(roots: Iterable<THREE.Object3D>, scene: THREE.Scene) {
  for (const root of roots) root.traverse(object => {
    if (object.layers.isEnabled(0)) object.layers.enable(CHARACTER_COLOR_LAYER)
    if (object.layers.isEnabled(OUTLINE_ID_LAYER)) object.layers.enable(CHARACTER_ID_LAYER)
  })
  scene.traverse(object => {
    if (object instanceof THREE.Light) object.layers.enable(CHARACTER_COLOR_LAYER)
  })
}

/** Hide whole character roots during world/ID passes, preserving animated visibility. */
export function withoutPixelCharacters(roots: Iterable<THREE.Object3D>, render: () => void) {
  const previous: Array<[THREE.Object3D, boolean]> = []
  for (const root of roots) { previous.push([root, root.visible]); root.visible = false }
  try { render() }
  finally { for (const [root, visible] of previous) root.visible = visible }
}
