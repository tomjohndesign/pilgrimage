import { describe, expect, it } from "vitest"

import { makeRng } from "../rng"
import { makeTerrain, meanderLine } from "./water"

const SIZE = 128

/** A river for one seed, built the way generateWater builds them. */
function river(seed: number) {
  const rng = makeRng(seed)
  const terrain = makeTerrain(rng, SIZE, SIZE, SIZE / 4)
  const [start, goal] = endpoints(rng)
  const line = meanderLine(start, goal, SIZE, SIZE, terrain, SIZE / 8, rng, {
    exactStart: false,
    exactEnd: false,
  })
  return { start, goal, line }
}

/** Random edge-to-edge endpoints on opposite or adjacent sides. */
function endpoints(rng: () => number): [{ x: number; z: number }, { x: number; z: number }] {
  const side = (s: number, t: number) =>
    s === 0 ? { x: 0, z: t } : s === 1 ? { x: SIZE - 1, z: t } : s === 2 ? { x: t, z: 0 } : { x: t, z: SIZE - 1 }
  const a = Math.floor(rng() * 4)
  const b = (a + 1 + Math.floor(rng() * 3)) % 4
  return [side(a, 20 + Math.floor(rng() * (SIZE - 40))), side(b, 20 + Math.floor(rng() * (SIZE - 40)))]
}

describe("meanderLine", () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => i * 6007 + 11)

  const onBorder = (i: number) => {
    const x = i % SIZE
    const z = Math.floor(i / SIZE)
    return x === 0 || z === 0 || x === SIZE - 1 || z === SIZE - 1
  }

  it("walks 4-connected from border to border without revisiting a tile", () => {
    for (const seed of SEEDS) {
      const { line } = river(seed)
      expect(onBorder(line[0]), `seed ${seed} starts on the border`).toBe(true)
      expect(onBorder(line[line.length - 1]), `seed ${seed} ends on the border`).toBe(true)
      expect(new Set(line).size, `seed ${seed} no revisits`).toBe(line.length)
      for (let i = 1; i < line.length; i++) {
        const dx = Math.abs((line[i] % SIZE) - (line[i - 1] % SIZE))
        const dz = Math.abs(Math.floor(line[i] / SIZE) - Math.floor(line[i - 1] / SIZE))
        expect(dx + dz, `seed ${seed} step ${i}`).toBe(1)
      }
      for (const i of line) {
        expect(i, `seed ${seed} in bounds`).toBeGreaterThanOrEqual(0)
        expect(i, `seed ${seed} in bounds`).toBeLessThan(SIZE * SIZE)
      }
    }
  })

  it("runs well past the straight-line distance — it meanders", () => {
    // A straight 4-connected walk is exactly the Manhattan distance long; a
    // river with real bends is a good deal longer than even its Euclidean
    // chord. Rasterised on the grid, the ratio lands around 1.5–2.
    for (const seed of SEEDS) {
      const { line } = river(seed)
      const a = line[0]
      const b = line[line.length - 1]
      const chord = Math.hypot((b % SIZE) - (a % SIZE), Math.floor(b / SIZE) - Math.floor(a / SIZE))
      expect(line.length / chord, `seed ${seed} sinuosity`).toBeGreaterThan(1.15)
    }
  })

  it("keeps clear of the map border between its ends", () => {
    for (const seed of SEEDS) {
      const { line } = river(seed)
      let borderTiles = 0
      for (const i of line) if (onBorder(i)) borderTiles++
      // The two ends sit on the border, perhaps with a short slide where the
      // curve crosses it at a shallow angle; a river never lies along it.
      expect(borderTiles, `seed ${seed} border tiles`).toBeLessThanOrEqual(20)
    }
  })
})
