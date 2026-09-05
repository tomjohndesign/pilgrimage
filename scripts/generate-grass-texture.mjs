// Generates public/textures/grass.png — the sward that clear land wears, and
// that creeps back over the road wherever the traffic is light. Deterministic,
// so re-running never dirties the repo. Seamless in both axes: the renderer
// maps it by world position across whole fields of tiles.
//
// The texture carries only the *fine* variation — blades, clumps, the odd
// pale seed head. Anything broader (which patches are lusher, where the road
// is grassy versus bare) is world-space noise in the tile shader, so it never
// repeats with the texture.
//
//   node scripts/generate-grass-texture.mjs

import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { makeRng, makeLattice, noise2, lerp, clamp01, writePng } from "./texture-lib.mjs"

const SIZE = 256
const SEED = 483921

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "textures")

/** Antialiased step: 0 below `edge - w`, 1 above `edge + w`. */
const aa = (edge, w, t) => clamp01((t - edge + w) / (2 * w))

// The clear-land tile colour (lib/game/map/terrain.ts). The texture averages
// out to this so a textured field reads the same tone as the flat tile did.
const BASE = [0x77, 0x86, 0x4b]
// Deliberately quiet: a field of it is mostly flat colour with a faint
// mottle. Anything louder turns a whole meadow into visual noise from the
// game's camera height.
const LIGHT = [127, 142, 81] // sunlit blade tips
const DARK = [110, 126, 69] // shadow between clumps
const DRY = [138, 140, 80] // the odd straw-yellow blade
const SEED_HEAD = [150, 154, 100]

const rng = makeRng(SEED)
// Blade-scale mottle: three fine octaves. Nothing coarser than a 32-pixel
// period, so a repeat of the texture has no feature big enough to spot.
const blades = [32, 64, 128].map((period) => ({ period, lattice: makeLattice(period, rng) }))
// Straw: sparse, slightly larger blotches of dried grass.
const straw = { period: 24, lattice: makeLattice(24, makeRng(SEED ^ 0x5717)) }

// Tufts: darker clumps, scattered; seed heads: single pale pixels.
const tufts = []
for (let i = 0; i < 70; i++) {
  tufts.push([Math.floor(rng() * SIZE), Math.floor(rng() * SIZE), 1.5 + rng() * 2])
}
const heads = []
for (let i = 0; i < 16; i++) heads.push([Math.floor(rng() * SIZE), Math.floor(rng() * SIZE)])

const pixels = new Float64Array(SIZE * SIZE * 3)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let fine = 0
    let amp = 0.5
    for (const { period, lattice } of blades) {
      fine += amp * noise2(lattice, period, (x / SIZE) * period, (y / SIZE) * period)
      amp *= 0.6
    }
    // fine sits in ~[0, 0.98]; centre it on the base tone.
    const t = aa(0.5, 0.3, fine)
    let r = lerp(DARK[0], LIGHT[0], t)
    let g = lerp(DARK[1], LIGHT[1], t)
    let b = lerp(DARK[2], LIGHT[2], t)

    const dry = aa(0.74, 0.06, noise2(straw.lattice, straw.period, (x / SIZE) * 24, (y / SIZE) * 24))
    r = lerp(r, DRY[0], dry * 0.3)
    g = lerp(g, DRY[1], dry * 0.3)
    b = lerp(b, DRY[2], dry * 0.3)

    for (const [tx, ty, size] of tufts) {
      const dx = Math.min(Math.abs(x - tx), SIZE - Math.abs(x - tx))
      const dy = Math.min(Math.abs(y - ty), SIZE - Math.abs(y - ty))
      const d2 = dx * dx + dy * dy
      if (d2 > size * size) continue
      const k = 0.3 * (1 - d2 / (size * size + 1))
      r = lerp(r, DARK[0] * 0.9, k)
      g = lerp(g, DARK[1] * 0.9, k)
      b = lerp(b, DARK[2] * 0.9, k)
    }
    for (const [hx, hy] of heads) {
      if (hx === x && hy === y) {
        r = SEED_HEAD[0]
        g = SEED_HEAD[1]
        b = SEED_HEAD[2]
      }
    }

    const i = (y * SIZE + x) * 3
    pixels[i] = r
    pixels[i + 1] = g
    pixels[i + 2] = b
  }
}

// Pull the average exactly onto the tile colour, channel by channel, so the
// textured field and the flat colour it replaces agree from a distance.
const mean = [0, 0, 0]
for (let i = 0; i < pixels.length; i += 3) for (let c = 0; c < 3; c++) mean[c] += pixels[i + c]
for (let c = 0; c < 3; c++) mean[c] /= SIZE * SIZE

const out = new Uint8Array(SIZE * SIZE * 4)
for (let p = 0; p < SIZE * SIZE; p++) {
  for (let c = 0; c < 3; c++) {
    out[p * 4 + c] = Math.round(clamp01((pixels[p * 3 + c] * (BASE[c] / mean[c])) / 255) * 255)
  }
  out[p * 4 + 3] = 255
}
writePng(join(OUT_DIR, "grass.png"), SIZE, out)
