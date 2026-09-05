// Shared helpers for the texture generation scripts. Everything is
// deterministic: the same seed always produces the same bytes, so re-running a
// generator never dirties the repo.

import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

// --- Deterministic RNG (mulberry32, same family as lib/game/rng.ts) ---------
export function makeRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- Periodic value noise (wraps in both axes for seamless tiling) -----------
export function makeLattice(period, rng) {
  const values = new Float64Array(period * period)
  for (let i = 0; i < values.length; i++) values[i] = rng()
  return (x, y) => values[((y % period) + period) % period * period + (((x % period) + period) % period)]
}

export const smooth = (t) => t * t * (3 - 2 * t)

export function noise2(lattice, period, x, y) {
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

export const lerp = (a, b, t) => a + (b - a) * t

export const clamp01 = (t) => Math.max(0, Math.min(1, t))

/**
 * Periodic Worley (cellular) noise: a jittered grid of feature points that
 * wraps in both axes. `sample(u, v)` takes cell-unit coordinates and returns
 * the distances to the nearest (`d1`) and second-nearest (`d2`) points plus
 * the nearest point's cell index (`id`) — a stable per-stone hash key.
 */
export function makeWorley(cells, rng) {
  const px = new Float64Array(cells * cells)
  const py = new Float64Array(cells * cells)
  for (let i = 0; i < px.length; i++) {
    px[i] = rng()
    py[i] = rng()
  }
  return (u, v) => {
    const cu = Math.floor(u)
    const cv = Math.floor(v)
    let d1 = Infinity
    let d2 = Infinity
    let id = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cu + dx
        const gy = cv + dy
        const i = (((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells)
        const du = u - (gx + px[i])
        const dv = v - (gy + py[i])
        const d = Math.sqrt(du * du + dv * dv)
        if (d < d1) {
          d2 = d1
          d1 = d
          id = i
        } else if (d < d2) {
          d2 = d
        }
      }
    }
    return { d1, d2, id }
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

/** Write `size`×`size` RGBA pixels to `path` as a PNG, creating directories. */
export function writePng(path, size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  const scanlines = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    scanlines[y * (size * 4 + 1)] = 0 // filter: none
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(scanlines, y * (size * 4 + 1) + 1)
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, png)
  console.log(`wrote ${path} (${png.length} bytes)`)
}
