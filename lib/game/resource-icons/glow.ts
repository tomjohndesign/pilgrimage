/** Stepped native-pixel light; the same transparent halo is previewed and exported. */
export function glowIcon(source: Uint8ClampedArray, size: number, strength: number, radius = Math.max(1, Math.round(size * .1))): Uint8ClampedArray {
  const pixels = source.slice()
  if (strength <= 0) return pixels
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = (y * size + x) * 4
    if (source[i + 3]) continue
    let distance = radius + 1
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || !source[(ny * size + nx) * 4 + 3]) continue
      distance = Math.min(distance, Math.hypot(dx, dy))
    }
    if (distance > radius) continue
    const band = Math.ceil(distance / radius * 3)
    pixels.set([255, 204, 76, Math.round([0, 180, 112, 48][band] * Math.min(1, strength))], i)
  }
  return pixels
}
