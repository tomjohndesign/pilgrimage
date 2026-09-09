import * as THREE from "three"
import { shrineStructureParts } from "../building-art/shrine-geometry"
import { mergedBuildingGeometry } from "../building-art/merged-geometry"
import { addSurfaceLighting } from "./lighting"
import { cameraOffset, yawForView } from "./iso"

/** Asset export only, called through the existing /play development handle.
 * Bake the actual church geometry; no terrain or character assets are needed.
 */
export function bakeLoadingChurch(renderer: THREE.WebGLRenderer) {
  const size = 256, worldSize = 8, centreY = 1.15
  const scene = new THREE.Scene()
  const yaw = yawForView(0)
  addSurfaceLighting(scene, yaw)
  const camera = new THREE.OrthographicCamera(-worldSize / 2, worldSize / 2, worldSize / 2, -worldSize / 2, .1, 400)
  camera.position.set(...cameraOffset(yaw))
  camera.position.y += centreY
  camera.lookAt(0, centreY, 0)
  camera.updateMatrixWorld()
  const target = new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
  target.texture.colorSpace = THREE.SRGBColorSpace
  const previous = renderer.getRenderTarget(), color = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha()
  const autoClear = renderer.autoClear
  const output: string[] = []
  try {
    renderer.autoClear = true
    renderer.setClearColor(0, 0)
    for (let view = 0; view < 4; view++) {
      const sideways = view % 2 === 1
      const parts = shrineStructureParts(sideways ? 5 : 3, sideways ? 3 : 5)
      const geometry = mergedBuildingGeometry(parts.filter(part => !part.surface))
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.rotation.y = view * Math.PI / 2
      scene.add(mesh)
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      const pixels = new Uint8Array(size * size * 4)
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels)
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = size
      const context = canvas.getContext("2d")!, image = context.createImageData(size, size)
      for (let y = 0; y < size; y++) image.data.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), (size - 1 - y) * size * 4)
      context.putImageData(image, 0, 0)
      output.push(canvas.toDataURL("image/png"))
      scene.remove(mesh); geometry.dispose(); material.dispose()
    }
  } finally {
    renderer.setRenderTarget(previous)
    renderer.setClearColor(color, alpha)
    renderer.autoClear = autoClear
    target.dispose()
  }
  return { images: output, size, worldSize, centreY }
}
