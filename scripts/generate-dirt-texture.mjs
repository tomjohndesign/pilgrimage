// Generates public/textures/dirt-side.png — the texture for the exposed dirt
// sides of the map slab. Deterministic, so re-running never dirties the repo.
// Horizontally seamless (the slab tiles it around the map edge); vertically it
// runs light topsoil at the top to dark subsoil at the bottom, clamped.
//
//   node scripts/generate-dirt-texture.mjs

import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { makeRng, makeLattice, noise2, smooth, lerp, writePng } from "./texture-lib.mjs"

const SIZE = 256
const SEED = 774455

// --- Dirt shading ------------------------------------------------------------
const rng = makeRng(SEED)
const octaves = [8, 16, 32].map((period) => ({ period, lattice: makeLattice(period, rng) }))
const strata = { period: 8, lattice: makeLattice(8, makeRng(SEED ^ 0xbeef)) }

// Topsoil to subsoil ramp, in sync with the game palette's warm browns.
const TOP = [122, 92, 56]
const BOTTOM = [42, 30, 17]

const pixels = new Uint8Array(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const v = y / (SIZE - 1)

    // Grain: three octaves of noise, all wrapping horizontally.
    let grain = 0
    let amp = 0.55
    for (const { period, lattice } of octaves) {
      grain += amp * noise2(lattice, period, (x / SIZE) * period, (y / SIZE) * period)
      amp *= 0.55
    }

    // Strata: stretched horizontally so the dirt reads as packed layers.
    const band = noise2(strata.lattice, strata.period, (x / SIZE) * 2, (y / SIZE) * strata.period)

    const shade = 0.72 + grain * 0.5 + (band - 0.5) * 0.22
    const depth = smooth(Math.min(1, v * 1.15)) // darken toward the bottom
    const i = (y * SIZE + x) * 4
    for (let c = 0; c < 3; c++) {
      pixels[i + c] = Math.max(0, Math.min(255, Math.round(lerp(TOP[c], BOTTOM[c], depth) * shade)))
    }
    pixels[i + 3] = 255

    // Occasional pebble: a lighter fleck a couple of pixels wide.
    if (rng() < 0.0015) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const j = (((y + dy) % SIZE) * SIZE + ((x + dx) % SIZE)) * 4
          for (let c = 0; c < 3; c++) pixels[j + c] = Math.min(255, pixels[i + c] + 46)
        }
      }
    }
  }
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "textures", "dirt-side.png")
writePng(out, SIZE, pixels)
