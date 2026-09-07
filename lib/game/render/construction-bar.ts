import * as THREE from "three"

export const CONSTRUCTION_BAR_WIDTH = 48
export const CONSTRUCTION_BAR_HEIGHT = 6
/** Same native pixels and nearest filtering as the game's floating payment labels. */
export function constructionBarTexture() {
  const texture = new THREE.DataTexture(new Uint8Array(CONSTRUCTION_BAR_WIDTH * CONSTRUCTION_BAR_HEIGHT * 4), CONSTRUCTION_BAR_WIDTH, CONSTRUCTION_BAR_HEIGHT)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  return texture
}
export function updateConstructionBar(texture: THREE.DataTexture, progress: number) {
  const width = Math.floor(Math.max(0, Math.min(1, progress)) * (CONSTRUCTION_BAR_WIDTH - 4))
  const pixels = texture.image.data as Uint8Array
  for (let y = 0; y < CONSTRUCTION_BAR_HEIGHT; y++) for (let x = 0; x < CONSTRUCTION_BAR_WIDTH; x++) {
    const border = x === 0 || y === 0 || x === CONSTRUCTION_BAR_WIDTH - 1 || y === CONSTRUCTION_BAR_HEIGHT - 1
    const fill = x >= 2 && x < width + 2 && y >= 2 && y < CONSTRUCTION_BAR_HEIGHT - 2
    pixels.set(border ? [48, 33, 12, 255] : fill ? [218, 183, 103, 255] : [91, 77, 47, 255], (y * CONSTRUCTION_BAR_WIDTH + x) * 4)
  }
  texture.needsUpdate = true
}
