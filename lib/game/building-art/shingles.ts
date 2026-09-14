import type { BuildingPart, Vec3 } from "./geometry"
import { makeRng } from "../rng"

/** Hand-split oak: uneven widths, staggered overlaps and grain down the slope.
 * The underlying roof planes and shared joins remain unchanged. */
export function shingleSurface(highLeft: Vec3, highRight: Vec3, lowLeft: Vec3, lowRight: Vec3,
  seed: number, name = "1", edges = { left: true, right: true, low: true }): BuildingPart[] {
  const parts: BuildingPart[] = [], random = makeRng(seed)
  const at = (t: number, u: number, lift = .055): Vec3 => highLeft.map((v, i) =>
    (v + (lowLeft[i] - v) * t) * (1 - u) + (highRight[i] + (lowRight[i] - highRight[i]) * t) * u + (i === 1 ? lift : 0)) as Vec3
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => [...a, ...b, ...c, ...a, ...c, ...d]
  const face = (suffix: string, vertices: number[], color: string, accent = false) => parts.push({
    name: `shingle-${suffix}-${name}`, layer: "roof", position: [0, 0, 0], vertices, color, playerAccent: accent, outline: false,
  })
  face("underlay", quad(at(0, 0, .02), at(1, 0, .02), at(1, 1, .02), at(0, 1, .02)), "#827c6b")
  const run = Math.hypot(...highLeft.map((v, i) => v - lowLeft[i]))
  const span = Math.hypot(...highLeft.map((v, i) => v - highRight[i]))
  const rows = Math.max(1, Math.ceil(run / .3)), columns = Math.max(1, Math.ceil(span / .27))
  const grain: number[] = []
  for (let row = 0; row < rows; row++) {
    const bounds = Array.from({ length: columns + 2 }, (_, col) => col === 0 ? 0 : col === columns + 1 ? 1 :
      Math.max(0, Math.min(1, (col - (row % 2) * .5 + (random() - .5) * .28) / columns)))
    for (let col = 0; col <= columns; col++) {
      const a = bounds[col], b = bounds[col + 1]
      if (b - a < .005) continue
      const top = Math.max(0, (row - .16) / rows)
      const bottom = row === rows - 1 ? 1 : (row + 1 + (random() - .5) * .12) / rows
      const lift = .05 + (rows - row) * .006
      // Hairline side seams expose the timber underlay, never holes through the roof.
      const right = b === 1 ? b : b - Math.min(.008 / span, (b - a) * .06)
      face(`course-${row}-${col}`, quad(at(top, a, lift), at(bottom, a, lift), at(bottom, right, lift), at(top, right, lift)),
        ["#a69e8b", "#9b9483", "#aaa28f"][Math.floor(random() * 3)])
      face(`lip-${row}-${col}`, quad(at(bottom, a, lift), at(bottom, right, lift), at(bottom, right, lift - .022), at(bottom, a, lift - .022)), "#827b68")
      if (col % 2 === row % 2) {
        const u = a + (right - a) * (.25 + random() * .25), width = Math.min(.014 / span, (right - a) * .1)
        const start = top + (bottom - top) * .2, end = bottom - (bottom - top) * .08
        grain.push(...quad(at(start, u, lift + .002), at(end, u - width * .2, lift + .002),
          at(end, u + width, lift + .002), at(start, u + width * .35, lift + .002)))
      }
    }
  }
  if (grain.length) face("grain", grain, "#8c836f")
  if (edges.low) face("fascia", quad(at(1, 0, .045), at(1, 1, .045), at(1, 1, -.025), at(1, 0, -.025)), "#897957", true)
  return parts
}
