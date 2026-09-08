import * as THREE from "three"
import { CHARACTER_ID_LAYER } from "./pixel-characters"
import { decodeObjectId } from "./outline"

export interface CharacterOcclusionSample {
  submittedIds: number
  fullyInViewIds: number
  visibleWithoutScenery: number
  visibleWithScenery: number
  fullyCoveredByCharacters: number
  hiddenByScenery: number
}

/** One-shot benchmark request. Readback never runs during ordinary gameplay. */
export const characterOcclusionRequest: { current: ((sample: CharacterOcclusionSample) => void) | null } = { current: null }

function idsInBuffer(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
  const pixels = new Uint8Array(target.width * target.height * 4), ids = new Set<number>()
  renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels)
  for (let i = 0; i < pixels.length; i += 4) {
    const id = pixels[i] + pixels[i + 1] * 256 + pixels[i + 2] * 65536
    if (id) ids.add(id)
  }
  return ids
}

/** Compare the existing world ID pass with a character-only ID pass. Only
 * completely in-view sprite bounds count as overlap occlusion: characters in
 * the mounting margin or clipped at the screen edge cannot inflate savings.
 * IDs shared by a cart, driver and animal remain one logical character. */
export function sampleCharacterOcclusion(renderer: THREE.WebGLRenderer, scene: THREE.Scene,
  camera: THREE.Camera, world: THREE.WebGLRenderTarget): CharacterOcclusionSample {
  const target = new THREE.WebGLRenderTarget(world.width, world.height, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
  })
  const previous = renderer.getRenderTarget(), mask = camera.layers.mask
  const worldIds = idsInBuffer(renderer, world)
  try {
    renderer.setRenderTarget(target); renderer.clear()
    camera.layers.set(CHARACTER_ID_LAYER)
    renderer.render(scene, camera)
    const characterIds = idsInBuffer(renderer, target)
    const submitted = new Set<number>(), inside = new Set<number>(), clipped = new Set<number>()
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3()
    const record = (id: number, transform: THREE.Matrix4) => {
      if (!id) return
      submitted.add(id)
      position.setFromMatrixPosition(transform); scale.setFromMatrixScale(transform)
      // Conservative bound includes an off-centre sprite anchor and pose depth.
      const radius = Math.max(scale.x, scale.y, scale.z) * 2
      if (frustum.planes.every(plane => plane.distanceToPoint(position) > radius)) inside.add(id)
      else clipped.add(id)
    }
    scene.traverseVisible(object => {
      if (!object.layers.isEnabled(CHARACTER_ID_LAYER)) return
      if (object instanceof THREE.InstancedMesh) {
        const ids = object.geometry.getAttribute("characterId")
        if (!ids) return
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld)
          record(decodeObjectId(ids.getX(i), ids.getY(i), ids.getZ(i)), matrix)
        }
      } else if (object instanceof THREE.Sprite) {
        const id = object.material.userData.objectId as THREE.Vector3 | undefined
        if (id) record(decodeObjectId(id.x, id.y, id.z), object.matrixWorld)
      }
    })
    for (const id of clipped) inside.delete(id)
    return {
      submittedIds: submitted.size, fullyInViewIds: inside.size,
      visibleWithoutScenery: [...submitted].filter(id => characterIds.has(id)).length,
      visibleWithScenery: [...submitted].filter(id => worldIds.has(id)).length,
      fullyCoveredByCharacters: [...inside].filter(id => !characterIds.has(id)).length,
      hiddenByScenery: [...submitted].filter(id => characterIds.has(id) && !worldIds.has(id)).length,
    }
  } finally {
    camera.layers.mask = mask; renderer.setRenderTarget(previous); target.dispose()
  }
}
