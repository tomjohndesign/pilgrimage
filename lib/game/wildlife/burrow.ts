import * as THREE from "three"
import { model } from "../transport/geometry"

/** A ground-level opening. Nested earthen edges shade into a dark throat;
 * the rabbit descends through this plane using the shared burrow motion. */
export function createBurrowRig() {
  const m = model()
  function oval(rx: number, rz: number, y: number, z: number, color: string) {
    const shape = new THREE.Shape()
    for (let i = 0; i < 20; i++) {
      const angle = i / 20 * Math.PI * 2
      const edge = 1 + 0.035 * Math.sin(i * 2.7)
      const x = Math.cos(angle) * rx * edge, depth = Math.sin(angle) * rz * edge
      if (i === 0) shape.moveTo(x, depth)
      else shape.lineTo(x, depth)
    }
    shape.closePath()
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(-Math.PI / 2)
    return m.mesh(geometry, color, [0, y, z])
  }
  // Just enough offset to clear terrain depth, with no raised bank or roof.
  oval(.58, .83, .012, -.05, "#736044")
  oval(.51, .75, .016, -.06, "#51412d")
  oval(.44, .66, .020, -.10, "#30281d")
  const throat = oval(.38, .55, .024, -.16, "#000000")
  throat.material.emissive.set("#16150f")
  return m
}
