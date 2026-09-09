import { expect, it } from "vitest"
import * as THREE from "three"
import { DEFAULT_ELEVATION } from "../map/elevation"
import type { GameMap } from "../map/types"
import { cameraOffset, yawForView } from "./iso"
import { tileRevealFrame } from "./map-reveal-framing"

const width = 64
function mapAtHeight(height: number): GameMap {
  return { width, depth: width, tiles: Array(width * width).fill("grass"), buildings: [],
    elevation: { settings: DEFAULT_ELEVATION, height: Array(width * width).fill(height),
      corners: Array(width * width * 4).fill(height), slope: Array(width * width).fill(0), cliffs: Array(width * width).fill(0) } }
}
function cameraAtView(view: number) {
  const camera = new THREE.OrthographicCamera(-24, 24, 16, -16, .1, 400)
  camera.position.set(...cameraOffset(yawForView(view)))
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}

it.each([0, 1, 2, 3])("starts at the elevated terrain under screen centre in view %i", view => {
  const camera = cameraAtView(view)
  const frame = tileRevealFrame(mapAtHeight(4), camera)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(new THREE.Vector2(), camera)
  const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -4.2), new THREE.Vector3())!
  expect(frame.origin.toArray()).toEqual([Math.floor(hit.x + width / 2), Math.floor(hit.z + width / 2)])
  expect(frame.origin.toArray()).not.toEqual([32, 32])
})

it("includes every visible terrain tile and tall scenery in the final ring", () => {
  const map = mapAtHeight(4), camera = cameraAtView(0), frame = tileRevealFrame(map, camera)
  for (let z = 0; z < width; z++) for (let x = 0; x < width; x++) for (const y of [4.2, 12]) {
    const projected = new THREE.Vector3(x - width / 2 + .5, y, z - width / 2 + .5).project(camera)
    if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue
    expect(Math.hypot(x - frame.origin.x, z - frame.origin.y)).toBeLessThanOrEqual(frame.radius)
  }
})

it("spreads from the terrain under screen centre when the world is resumed", () => {
  const map = mapAtHeight(0)
  map.buildings.push({ id: "hovel", label: "Hovel", x: 5, z: 7, w: 2, d: 2, height: 1, color: "#000", roofColor: "#000" })
  map.site = { junction: 0, branch: [], door: { x: 5, z: 9 }, hovelId: "hovel" }
  const camera = cameraAtView(0)
  expect(tileRevealFrame(map, camera).origin.toArray()).toEqual([5.5, 7.5])
  expect(tileRevealFrame(map, camera, false).origin.toArray()).toEqual([32, 32])
})
