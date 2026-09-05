// Generates public/textures/road-*.png — the top surfaces of the road at each
// development tier, from a bare trodden trail to cut flagstones. Deterministic,
// so re-running never dirties the repo. Every texture is seamless in both axes:
// the renderer maps it by world position so the surface runs continuously
// along the road, and any tile boundary can land anywhere in the image.
//
//   node scripts/generate-road-textures.mjs

import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import {
  makeRng,
  makeLattice,
  makeWorley,
  noise2,
  lerp,
  clamp01,
  writePng,
} from "./texture-lib.mjs"

const SIZE = 256
const SEED = 660917

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "textures")

/** Antialiased step: 0 below `edge - w`, 1 above `edge + w`. */
const aa = (edge, w, t) => clamp01((t - edge + w) / (2 * w))

/** Multi-octave periodic noise in [0, ~1], shared grain for every tier. */
function makeGrain(seed) {
  const rng = makeRng(seed)
  const octaves = [8, 16, 32].map((period) => ({ period, lattice: makeLattice(period, rng) }))
  return (x, y) => {
    let value = 0
    let amp = 0.55
    for (const { period, lattice } of octaves) {
      value += amp * noise2(lattice, period, (x / SIZE) * period, (y / SIZE) * period)
      amp *= 0.55
    }
    return value
  }
}

function render(name, shadePixel) {
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b] = shadePixel(x, y)
      const i = (y * SIZE + x) * 4
      pixels[i] = clamp01(r / 255) * 255
      pixels[i + 1] = clamp01(g / 255) * 255
      pixels[i + 2] = clamp01(b / 255) * 255
      pixels[i + 3] = 255
    }
  }
  writePng(join(OUT_DIR, `${name}.png`), SIZE, pixels)
}

// --- Tier 0: trodden trail ---------------------------------------------------
// Bare packed dirt: warm grain, darker damp hollows, the odd pebble, and a few
// tufts of grass the traffic hasn't worn away. Only the *bare* surface lives
// here — the broad patches where grass has reclaimed the trail are world-space
// noise in the tile shader, blending in grass.png, so they never repeat with
// the texture.
{
  const rng = makeRng(SEED)
  const grain = makeGrain(SEED ^ 0x51ed)
  const hollows = { period: 6, lattice: makeLattice(6, makeRng(SEED ^ 0xd1a7)) }

  const BASE = [186, 156, 110]
  const flecks = [] // [x, y, size, kind] — kind 0 pebble, 1 grass tuft
  for (let i = 0; i < 120; i++) {
    flecks.push([
      Math.floor(rng() * SIZE),
      Math.floor(rng() * SIZE),
      1 + Math.floor(rng() * 2),
      rng() < 0.45 ? 1 : 0,
    ])
  }

  render("road-trail", (x, y) => {
    let shade = 0.78 + grain(x, y) * 0.42

    // Damp hollows: low-frequency blotches trodden a little darker.
    const damp = noise2(hollows.lattice, hollows.period, (x / SIZE) * 6, (y / SIZE) * 6)
    shade *= 1 - aa(0.58, 0.08, damp) * 0.14

    let [r, g, b] = [BASE[0] * shade, BASE[1] * shade, BASE[2] * shade]

    for (const [fx, fy, size, kind] of flecks) {
      // Wrapped distance so flecks straddling the border stay seamless.
      const dx = Math.min(Math.abs(x - fx), SIZE - Math.abs(x - fx))
      const dy = Math.min(Math.abs(y - fy), SIZE - Math.abs(y - fy))
      const d2 = dx * dx + dy * dy
      if (d2 > size * size) continue
      if (kind === 0) {
        r += 42
        g += 40
        b += 34
      } else {
        // A tuft: a small dark clump, soft at its rim.
        const t = 0.7 * (1 - d2 / (size * size + 1))
        r = lerp(r, 96, t)
        g = lerp(g, 118, t)
        b = lerp(b, 56, t)
      }
    }
    return [r, g, b]
  })
}

// --- Tier 1: packed gravel ---------------------------------------------------
// Small crushed stones pressed into dirt: Worley cells give each stone its own
// shade, with the dirt bed showing through between them.
{
  const CELLS = 32 // 8px stones
  const rng = makeRng(SEED ^ 0x9e37)
  const worley = makeWorley(CELLS, rng)
  const hash = makeLattice(CELLS, rng)
  const grain = makeGrain(SEED ^ 0x77aa)

  const DIRT = [126, 104, 74]

  render("road-gravel", (x, y) => {
    const u = (x / SIZE) * CELLS
    const v = (y / SIZE) * CELLS
    const { d1, id } = worley(u, v)
    const h = hash(id % CELLS, Math.floor(id / CELLS))

    const g = grain(x, y)
    const dirtShade = 0.86 + g * 0.28
    const dirt = DIRT.map((c) => c * dirtShade)

    // Stone: grey-brown, each a hair different, darkening toward its rim.
    const radius = 0.52 + h * 0.16
    const tone = (0.82 + h * 0.34) * (1 - (d1 / radius) * 0.38) * (0.92 + g * 0.16)
    const stone = [158 * tone, 148 * tone, 132 * tone]

    const t = aa(radius, 0.09, d1) // 0 on the stone, 1 in the dirt gaps
    return [lerp(stone[0], dirt[0], t), lerp(stone[1], dirt[1], t), lerp(stone[2], dirt[2], t)]
  })
}

// --- Tier 2: cobblestones ----------------------------------------------------
// Rounded setts: big Worley cells, dark packed-earth joints where two stones
// meet, and a domed highlight on each stone's crown.
{
  const CELLS = 8 // 32px cobbles
  const rng = makeRng(SEED ^ 0xc0bb)
  const worley = makeWorley(CELLS, rng)
  const hash = makeLattice(CELLS, rng)
  const grain = makeGrain(SEED ^ 0x3355)

  const JOINT = [82, 70, 55]

  render("road-cobble", (x, y) => {
    const u = (x / SIZE) * CELLS
    const v = (y / SIZE) * CELLS
    const { d1, d2, id } = worley(u, v)
    const h = hash(id % CELLS, Math.floor(id / CELLS))

    const g = grain(x, y)
    // Dome shading: bright crown, falling off toward the joints.
    const tone = (0.88 + h * 0.3) * (1 - d1 * 0.45) * (0.9 + g * 0.2)
    const stone = [152 * tone, 142 * tone, 126 * tone]

    // Joints live where the two nearest stones are nearly equidistant.
    const jointT = 1 - aa(0.16, 0.09, d2 - d1)
    const jointShade = 0.85 + g * 0.3
    return [
      lerp(stone[0], JOINT[0] * jointShade, jointT),
      lerp(stone[1], JOINT[1] * jointShade, jointT),
      lerp(stone[2], JOINT[2] * jointShade, jointT),
    ]
  })
}

// --- Tier 3: flagstones ------------------------------------------------------
// Large cut slabs laid in offset courses with mortar lines, each slab its own
// shade of dressed stone, weather-stained here and there.
{
  const COURSES = 4 // 64px slabs
  const rng = makeRng(SEED ^ 0xf1a6)
  const hash = makeLattice(COURSES, rng)
  const wobble = { period: 16, lattice: makeLattice(16, rng) }
  const stains = { period: 5, lattice: makeLattice(5, makeRng(SEED ^ 0x57a1)) }
  const grain = makeGrain(SEED ^ 0x1188)

  const STONE = [174, 164, 146]
  const MORTAR = [96, 86, 70]
  const MORTAR_PX = 2.2

  render("road-flagstone", (x, y) => {
    // Wobble the cut lines a little so the slabs read hand-laid. The noise is
    // periodic, so the displaced grid still wraps.
    const wob = noise2(wobble.lattice, wobble.period, (x / SIZE) * 16, (y / SIZE) * 16) - 0.5
    const v = (y / SIZE) * COURSES + wob * 0.1
    const row = Math.floor(v)
    // Alternate courses shift by half a slab, like brickwork.
    const u = (x / SIZE) * COURSES + (((row % 2) + 2) % 2) * 0.5 + wob * 0.1
    const col = Math.floor(u)

    const h = hash(((col % COURSES) + COURSES) % COURSES, ((row % COURSES) + COURSES) % COURSES)
    const g = grain(x, y)

    const cell = SIZE / COURSES
    const edge = Math.min(u - col, col + 1 - u, v - row, row + 1 - v) * cell
    const mortarT = 1 - aa(MORTAR_PX, 1, edge)

    let tone = (0.9 + h * 0.2) * (0.92 + g * 0.16)
    // Weather stains: broad damp patches that darken whole corners of slabs.
    const stain = noise2(stains.lattice, stains.period, (x / SIZE) * 5, (y / SIZE) * 5)
    tone *= 1 - aa(0.6, 0.1, stain) * 0.12

    const mortarShade = 0.85 + g * 0.3
    return [
      lerp(STONE[0] * tone, MORTAR[0] * mortarShade, mortarT),
      lerp(STONE[1] * tone, MORTAR[1] * mortarShade, mortarT),
      lerp(STONE[2] * tone, MORTAR[2] * mortarShade, mortarT),
    ]
  })
}
