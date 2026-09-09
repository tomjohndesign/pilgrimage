import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { acquireStallGeometry } from "./stall-geometry"
import { CARGO, RIG_TO_WORLD } from "./assets"
import { stallLayout, stallPoint } from "./stall"

describe("world-grounded vendor stalls", () => {
  it.each(CARGO)("retains deployment poses and shares %s geometry between vendors", cargo => {
    const first = acquireStallGeometry(cargo, false), second = acquireStallGeometry(cargo, false)
    try {
      const packed = first.frame(0), open = first.frame(1)
      expect(open).toBe(second.frame(1))
      expect(first.frame(0.999)).toBe(open)
      expect(open).not.toBe(packed)
      open.computeBoundingBox(); packed.computeBoundingBox()
      expect(open.boundingBox!.max.y).toBeGreaterThan(packed.boundingBox!.max.y)
      expect(open.boundingBox!.min.x).toBeLessThan(packed.boundingBox!.min.x)
      expect(open.getAttribute("color").count).toBe(open.getAttribute("position").count)
      expect(open.getAttribute("normal").count).toBe(open.getAttribute("position").count)
      first.dispose()
      expect(second.frame(1)).toBe(open)
    } finally { second.dispose() }
  })

  it.each([true, false])("keeps the display on its map footprint at every heading and side (compact %s)", compact => {
    const frames = acquireStallGeometry("bread", compact)
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    try {
      const mesh = new THREE.Mesh(frames.frame(1), material), scale = 1.5, axle = { x: 3.4, z: -1.2 }
      const display = stallLayout(compact ? "hand" : "horse").display
      for (const side of [-1, 1]) for (const heading of [0, 0.17, Math.PI / 2, 2.7, Math.PI, -1.3]) {
        mesh.position.set(axle.x, 0.2, axle.z); mesh.rotation.y = heading
        mesh.scale.set(side * RIG_TO_WORLD * scale, RIG_TO_WORLD * scale, RIG_TO_WORLD * scale)
        mesh.updateMatrixWorld(true)
        const ground = stallPoint(axle, heading, side, scale, display)
        const hit = new THREE.Raycaster(new THREE.Vector3(ground.x, 5, ground.z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)
        expect(hit.length).toBeGreaterThan(0)
        // A ground display surface remains within its authored height above the map.
        expect(hit[0].point.y).toBeGreaterThan(0.2)
        expect(hit[0].point.y).toBeLessThan(0.2 + 0.6 * RIG_TO_WORLD * scale)
      }
    } finally { material.dispose(); frames.dispose() }
  })
})
