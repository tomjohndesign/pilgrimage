// Generates public/textures/dirt-side.png — the texture for the exposed dirt
// sides of the map slab. Deterministic, so re-running never dirties the repo.
// Horizontally seamless (the slab tiles it around the map edge); vertically it
// runs light topsoil at the top to dark subsoil at the bottom, clamped.
//
//   node scripts/generate-dirt-texture.mjs

import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SIZE = 256
const SEED = 774455

// --- Deterministic RNG (mulberry32, same family as lib/game/rng.ts) ---------
function makeRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- Periodic value noise (wraps horizontally for seamless tiling) -----------
function makeLattice(period, rng) {
  const values = new Float64Array(period * period)
  for (let i = 0; i < values.length; i++) values[i] = rng()
  return (x, y) => values[((y % period) + period) % period * period + (((x % period) + period) % period)]
}

const smooth = (t) => t * t * (3 - 2 * t)

function noise2(lattice, period, x, y) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smooth(x - x0)
  const ty = smooth(y - y0)
  const v00 = lattice(x0, y0)
  const v10 = lattice(x0 + 1, y0)
  const v01 = lattice(x0, y0 + 1)
  const v11 = lattice(x0 + 1, y0 + 1)
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty
}

// --- Dirt shading ------------------------------------------------------------
const rng = makeRng(SEED)
const octaves = [8, 16, 32].map((period) => ({ period, lattice: makeLattice(period, rng) }))
const strata = { period: 8, lattice: makeLattice(8, makeRng(SEED ^ 0xbeef)) }

const lerp = (a, b, t) => a + (b - a) * t
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

// --- Minimal PNG encoder (8-bit RGBA, no filtering) --------------------------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, "ascii")
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // colour type: RGBA
const scanlines = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  scanlines[y * (SIZE * 4 + 1)] = 0 // filter: none
  Buffer.from(pixels.buffer, y * SIZE * 4, SIZE * 4).copy(scanlines, y * (SIZE * 4 + 1) + 1)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(scanlines, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
])

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "textures", "dirt-side.png")
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`wrote ${out} (${png.length} bytes)`)
