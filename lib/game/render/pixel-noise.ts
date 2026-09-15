import * as THREE from "three"

// Divisible by both grain cluster widths, so the repeated edges join cleanly.
export const PIXEL_NOISE_SIZE = 96

/** Linear data: fine grain, dry clusters, water clusters, balanced thresholds. */
export function pixelNoiseData() {
  const size = PIXEL_NOISE_SIZE, data = new Uint8Array(size * size * 4)
  const hash = (x: number, y: number, seed: number) => {
    let n = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed, 668265263)
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return (n ^ (n >>> 16)) >>> 0
  }
  const thresholds = Uint8Array.from({ length: size * size }, (_, i) => i % 256)
  for (let i = thresholds.length - 1; i > 0; i--) {
    const j = hash(i, 0, 219) % (i + 1)
    ;[thresholds[i], thresholds[j]] = [thresholds[j], thresholds[i]]
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    data[i] = hash(x, y, 71) & 255
    data[i + 1] = hash(Math.floor(x / 3), Math.floor(y / 2), 113) & 255
    data[i + 2] = hash(Math.floor(x / 6), Math.floor(y / 2), 157) & 255
    data[i + 3] = thresholds[i / 4]
  }
  return data
}

// Shared for the application's lifetime; each renderer uploads it only once.
export const pixelNoiseTexture = new THREE.DataTexture(pixelNoiseData(), PIXEL_NOISE_SIZE, PIXEL_NOISE_SIZE)
pixelNoiseTexture.name = "shared-surface-noise"
pixelNoiseTexture.magFilter = pixelNoiseTexture.minFilter = THREE.NearestFilter
pixelNoiseTexture.wrapS = pixelNoiseTexture.wrapT = THREE.RepeatWrapping
pixelNoiseTexture.generateMipmaps = false
pixelNoiseTexture.needsUpdate = true
