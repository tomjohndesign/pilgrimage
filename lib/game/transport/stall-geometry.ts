import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { TRANSPORT, type Cargo } from "./assets"
import { createCartRig } from "./rig"

/** Share the existing deployment frames as world geometry, one draw per stall.
 * Build each pose only when used; rotating the camera never rebuilds it. */
const stalls = new Map<string, { users: number; frames: Map<number, THREE.BufferGeometry> }>()

export function acquireStallGeometry(cargo: Cargo, compact: boolean) {
  const key = `${cargo}:${compact}`
  let entry = stalls.get(key)
  if (!entry) { entry = { users: 0, frames: new Map() }; stalls.set(key, entry) }
  const shared = entry
  shared.users++
  return {
    frame(progress: number) {
      const frame = Math.round(THREE.MathUtils.clamp(progress, 0, 1) * (TRANSPORT.shopFrames - 1))
      let geometry = shared.frames.get(frame)
      if (geometry) return geometry
      const rig = createCartRig(cargo, "shop", compact), parts: THREE.BufferGeometry[] = []
      try {
        rig.pose(0, frame / (TRANSPORT.shopFrames - 1))
        rig.root.updateMatrixWorld(true)
        rig.root.traverseVisible(object => {
          if (!(object instanceof THREE.Mesh)) return
          const part = object.geometry.clone().applyMatrix4(object.matrixWorld)
          const color = (object.material as THREE.MeshLambertMaterial).color
          const colors = new Float32Array(part.getAttribute("position").count * 3)
          for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i)
          part.setAttribute("color", new THREE.BufferAttribute(colors, 3))
          // The cloth has no UVs; all of these surfaces use authored colors.
          part.deleteAttribute("uv")
          parts.push(part)
        })
        geometry = mergeGeometries(parts)!
        geometry.computeBoundingSphere()
        shared.frames.set(frame, geometry)
        return geometry
      } finally { parts.forEach(part => part.dispose()); rig.dispose() }
    },
    dispose() {
      if (--shared.users) return
      for (const geometry of shared.frames.values()) geometry.dispose()
      stalls.delete(key)
    },
  }
}
