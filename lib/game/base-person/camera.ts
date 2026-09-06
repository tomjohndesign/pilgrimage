import * as THREE from "three"
import { BASE_PERSON } from "./pose"

/** The same registered projection for sprites, rig handles and pointer drags. */
export function personCamera(recipe = BASE_PERSON) {
  const pitch = recipe.camera.pitch * Math.PI / 180, extent = recipe.camera.viewSize, size = recipe.cellSize
  const targetY = ((recipe.anchor[1] - size / 2) / size * extent) / Math.cos(pitch)
  const camera = new THREE.OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, 0.1, 30)
  camera.position.set(0, targetY + 10 * Math.sin(pitch), 10 * Math.cos(pitch))
  camera.lookAt(0, targetY, 0); camera.updateMatrixWorld(true)
  return camera
}
