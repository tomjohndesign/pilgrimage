import * as THREE from "three"
import { patchPixelLighting } from "./pixel-lighting"

/** Register new subtrees once. A first-draw check also catches R3F material
 * attachments/replacements that happen after the object joins its parent. */
export function registerSurfaceLighting(scene: THREE.Scene) {
  const restores = new Map<THREE.Object3D, () => void>()
  function register(object: THREE.Object3D) {
    if (restores.has(object)) return
    const draw = object.onBeforeRender
    let previous: THREE.Material | THREE.Material[] | undefined
    const patch = () => {
      if (!object.layers.isEnabled(0) || !(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return
      if (previous === object.material && !Array.isArray(previous)) return
      const material = object.material as THREE.Material | THREE.Material[]
      previous = material
      if (Array.isArray(material)) material.forEach(patchPixelLighting)
      else patchPixelLighting(material)
    }
    patch()
    const beforeRender: typeof draw = (...args) => {
      patch()
      draw.apply(object, args)
    }
    object.onBeforeRender = beforeRender
    const added = (event: { child: THREE.Object3D }) => register(event.child)
    const removed = (event: { child: THREE.Object3D }) => unregister(event.child)
    object.addEventListener("childadded", added)
    object.addEventListener("childremoved", removed)
    restores.set(object, () => {
      object.removeEventListener("childadded", added)
      object.removeEventListener("childremoved", removed)
      if (object.onBeforeRender === beforeRender) object.onBeforeRender = draw
    })
    object.children.forEach(register)
  }
  function unregister(object: THREE.Object3D) {
    object.children.forEach(unregister)
    restores.get(object)?.()
    restores.delete(object)
  }
  register(scene)
  return () => unregister(scene)
}
