/**
 * Pixel edges are part of the exported sprite, independent of scene outlines.
 *
 * The mask carries a part id in red and the pixel's body tone in green. Skin and
 * hair steps are reserved by tone, so only skin pixels can land on a skin colour
 * and only hair pixels on a hair one — props and cloth keep to shared entries
 * even where a body colour is the nearest match. `paletteTones` runs parallel to
 * `palette`; without it every entry is shared, as before tones existed.
 */
export function inkPersonFrame(source: Uint8ClampedArray, parts: Uint8ClampedArray, size: number,
  palette: number[][], strength: number, paletteTones: readonly number[] = []): { pixels: Uint8ClampedArray; padding: number } {
  const output = new Uint8ClampedArray(source.length)
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && source[(y * size + x) * 4 + 3] >= 128
  const closest = (color: number[], tone: number) => {
    let best: number[] | undefined, distance = Infinity
    for (let i = 0; i < palette.length; i++) {
      const entry = paletteTones[i] ?? 0
      if (entry !== 0 && entry !== tone) continue
      const candidate = palette[i]
      const d = candidate.reduce((sum, v, index) => sum + (v - color[index]) ** 2, 0)
      if (d < distance) { distance = d; best = candidate }
    }
    return best ?? palette[0]
  }
  let padding = size
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
    const occupied = solid(x, y)
    const next = neighbors.find(([nx, ny]) => solid(nx, ny))
    if (!occupied && (!next || strength === 0)) continue
    const sample = occupied ? i : (next![1] * size + next![0]) * 4
    // Thin props retain their native width; selection still uses the same
    // one-pixel scene outline as the rest of the character.
    if (!occupied && parts[sample] === 11) continue
    let color = Array.from(source.subarray(sample, sample + 3))
    const interior = occupied && neighbors.every(([nx, ny]) => solid(nx, ny)) && neighbors.some(([nx, ny]) => {
      const other = parts[(ny * size + nx) * 4]
      return other > 0 && other < parts[i]
    })
    // Same-cloth sleeve/torso joins need a hint of depth, not a black cut line.
    const clothJoin = interior && (parts[i] === 8 || parts[i] === 9) && neighbors.some(([nx, ny]) =>
      parts[(ny * size + nx) * 4] === 3)
    const edgeStrength = strength * (clothJoin ? 0.25 : 1)
    if (!occupied || interior) color = color.map((v, channel) => v * (1 - edgeStrength) + palette[0][channel] * edgeStrength)
    output.set([...closest(color, parts[sample + 1]), 255], i)
    padding = Math.min(padding, x, y, size - 1 - x, size - 1 - y)
  }
  return { pixels: output, padding }
}
