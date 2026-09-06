/** Pixel edges are part of the exported sprite, independent of scene outlines. */
export function inkPersonFrame(source: Uint8ClampedArray, parts: Uint8ClampedArray, size: number,
  palette: number[][], strength: number): { pixels: Uint8ClampedArray; padding: number } {
  const output = new Uint8ClampedArray(source.length)
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && source[(y * size + x) * 4 + 3] >= 128
  const closest = (color: number[]) => {
    let best = palette[0], distance = Infinity
    for (const candidate of palette) {
      const d = candidate.reduce((sum, v, i) => sum + (v - color[i]) ** 2, 0)
      if (d < distance) { distance = d; best = candidate }
    }
    return best
  }
  let padding = size
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
    const occupied = solid(x, y)
    const next = neighbors.find(([nx, ny]) => solid(nx, ny))
    if (!occupied && (!next || strength === 0)) continue
    const sample = occupied ? i : (next![1] * size + next![0]) * 4
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
    output.set([...closest(color), 255], i)
    padding = Math.min(padding, x, y, size - 1 - x, size - 1 - y)
  }
  return { pixels: output, padding }
}
