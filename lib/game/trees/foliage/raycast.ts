import * as THREE from "three"
import { FOLIAGE_FRAME } from "./design"

/** Shader billboards need matching CPU picking, including holes between leaves. */
export function foliageRaycast(geometry: THREE.BufferGeometry, color: THREE.Texture, depth: THREE.Texture,
  view: { value: number }, camera: () => THREE.Camera | undefined): THREE.InstancedMesh["raycast"] {
  const read = (texture: THREE.Texture) => {
    const canvas = document.createElement("canvas"), image = texture.image as HTMLImageElement
    canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    ctx.drawImage(image, 0, 0)
    return { width: image.width, pixels: ctx.getImageData(0, 0, image.width, image.height).data }
  }
  const colors = read(color), depths = read(depth)
  const proxy = new THREE.Mesh(geometry), matrix = new THREE.Matrix4(), anchor = new THREE.Vector3(), scale = new THREE.Vector3()
  const axis = new THREE.Vector3(), rotation = new THREE.Quaternion(), hits: THREE.Intersection[] = []
  return function (this: THREE.InstancedMesh, raycaster, intersections) {
    const currentCamera = camera()
    if (!currentCamera) return
    currentCamera.getWorldQuaternion(rotation)
    const frame = geometry.getAttribute("foliageFrame")
    for (let i = 0; i < this.count; i++) {
      this.getMatrixAt(i, matrix); matrix.premultiply(this.matrixWorld)
      anchor.setFromMatrixPosition(matrix)
      const extent = FOLIAGE_FRAME.extent * axis.setFromMatrixColumn(matrix, 0).length()
      proxy.matrixWorld.compose(anchor, rotation, scale.setScalar(extent))
      hits.length = 0
      proxy.raycast(raycaster, hits)
      for (const hit of hits) {
        if (!hit.uv) continue
        const column = (view.value + frame.getX(i)) % FOLIAGE_FRAME.directions
        const x = column * FOLIAGE_FRAME.cellSize + Math.min(FOLIAGE_FRAME.cellSize - 1, Math.floor(hit.uv.x * FOLIAGE_FRAME.cellSize))
        const y = frame.getY(i) * FOLIAGE_FRAME.cellSize + Math.min(FOLIAGE_FRAME.cellSize - 1, Math.floor((1 - hit.uv.y) * FOLIAGE_FRAME.cellSize))
        const pixel = (y * colors.width + x) * 4
        if (colors.pixels[pixel + 3] < 128) continue
        const value = depths.pixels[pixel] * 256 + depths.pixels[pixel + 1]
        const offset = (value / 65535 - 0.5) * 2 * extent
        hit.point.addScaledVector(raycaster.ray.direction, -offset)
        hit.distance = raycaster.ray.origin.distanceTo(hit.point)
        if (hit.distance < raycaster.near || hit.distance > raycaster.far) continue
        intersections.push({ ...hit, object: this, instanceId: i })
        break
      }
    }
  }
}
