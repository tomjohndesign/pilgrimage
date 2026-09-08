import * as THREE from "three"
import { FOLIAGE_FRAME } from "./design"

/** Bounds in cell UV coordinates, with a texel of safety around opaque pixels.
 * Trimming transparent atlas padding changes coverage cost, not the artwork. */
export function foliageCropData(pixels: ArrayLike<number>, width: number, cell: number = FOLIAGE_FRAME.cellSize,
  columns: number = FOLIAGE_FRAME.directions, rows: number = FOLIAGE_FRAME.rows): Float32Array {
  const bounds = new Float32Array(columns * rows * 4)
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    let minX = cell, minY = cell, maxX = -1, maxY = -1
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      if (pixels[((row * cell + y) * width + column * cell + x) * 4 + 3] < 128) continue
      minX = Math.min(minX, x); minY = Math.min(minY, y)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
    if (maxX < 0) { bounds.set([.5, .5, .5, .5], (row * columns + column) * 4); continue }
    bounds.set([Math.max(0, minX - 1) / cell, 1 - Math.min(cell, maxY + 2) / cell,
      Math.min(cell, maxX + 2) / cell, 1 - Math.max(0, minY - 1) / cell], (row * columns + column) * 4)
  }
  return bounds
}

export function foliageCropTexture(color: THREE.Texture): THREE.DataTexture {
  const image = color.image as HTMLImageElement, canvas = document.createElement("canvas")
  canvas.width = image.width; canvas.height = image.height
  const context = canvas.getContext("2d", { willReadFrequently: true })!
  context.drawImage(image, 0, 0)
  const data = foliageCropData(context.getImageData(0, 0, image.width, image.height).data, image.width)
  const texture = new THREE.DataTexture(data, FOLIAGE_FRAME.directions, FOLIAGE_FRAME.rows, THREE.RGBAFormat, THREE.FloatType)
  texture.needsUpdate = true
  return texture
}

/** Camera-independent sphere about the planted anchor, containing every view. */
export function foliageRowRadii(bounds: Float32Array): Float32Array {
  const radii = new Float32Array(FOLIAGE_FRAME.rows)
  const offsetY = FOLIAGE_FRAME.anchor[1] / FOLIAGE_FRAME.cellSize - 1
  for (let row = 0; row < radii.length; row++) for (let column = 0; column < FOLIAGE_FRAME.directions; column++) {
    const i = (row * FOLIAGE_FRAME.directions + column) * 4
    const x = Math.max(Math.abs(bounds[i] - .5), Math.abs(bounds[i + 2] - .5))
    const y = Math.max(Math.abs(bounds[i + 1] + offsetY), Math.abs(bounds[i + 3] + offsetY))
    radii[row] = Math.max(radii[row], Math.hypot(x, y) * FOLIAGE_FRAME.extent + .01)
  }
  return radii
}
