// Generates public/textures/dirt-side.png — the face every exposed drop wears:
// tile sides at height steps, diagonal cut corners and the slab under the map.
// Deterministic, so re-running never dirties the repo.
//
// One texel is one character pixel (CHARACTER_PIXEL_SIZE), sampled nearest, so
// the cliff's grain is the same size as the figures walking beneath it. Rows
// count down from the local rim as an English lowland bank does: a dark
// humic topsoil with root tips, a brown clay-loam subsoil carrying a few
// flints, a stony gravel band at its base, then weathered bedrock — thick,
// quiet beds of grey-brown mudstone and sandstone with only the odd crack.
// Below the soil the rock repeats vertically (ROCK_PERIOD), so faces stacked
// on one another or the slab beneath the map read as the same rock going on
// rather than a second bank starting over. Wraps horizontally; the game clamps
// it vertically. Colours are posterised to short ramps so the face reads as
// pixel art rather than photographic noise, and the ramps stay light enough
// that the face turned from the sun still shows its courses.
//
//   node scripts/generate-dirt-texture.mjs

import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { makeRng, makeLattice, noise2, writePng } from "./texture-lib.mjs"

// Keep in sync with CLIFF_TEXTURE in components/game/terrain-tiles.tsx.
const W = 512
const H = 256
const SEED = 774455

const rng = makeRng(SEED)

// Value noise wrapping across the width; `cellPx` is the vertical cell size.
function field(cellsX, cellPx) {
  const lattice = makeLattice(cellsX, rng)
  return (x, y) => noise2(lattice, cellsX, (x / W) * cellsX, y / cellPx)
}
const grain = field(128, 3) // 4 px cells: per-pixel texture
const strata = field(16, 4) // stretched: packed clay layers
const mottle = field(8, 24) // slow tonal drift across a face
const undulation = field(6, 1000) // the whole bedding gently rolls
const soilLine = field(10, 1000) // where earth gives way to rock
const humusLine = field(40, 1000)

// Keep in sync with SLAB_ROCK_DEPTH in components/game/terrain-tiles.tsx: the
// soil never reaches this row, so the slab under the map shows rock alone.
const ROCK_TOP = 40
const ROCK_PERIOD = 96

// --- Palette: short ramps, dark to light ------------------------------------
// Brown earth over grey-brown stone: no chalk white, no Devon red.
const HUMUS = [[44, 34, 24], [56, 43, 30], [68, 53, 38]]
const EARTH = [[82, 63, 44], [96, 75, 53], [110, 87, 62], [122, 98, 72]]
const FLINT = [[76, 72, 66], [100, 96, 89], [130, 126, 117]]
const STONE = [[66, 61, 54], [80, 75, 67], [94, 88, 79], [108, 102, 92], [122, 116, 105], [134, 128, 117]]
const WARM = [1.03, 1.0, 0.95]
const COOL = [0.97, 0.99, 1.02]

const pick = (ramp, shade) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(shade)))]

// --- Structure ---------------------------------------------------------------
const roll = (x) => Math.round((undulation(x, 0) - 0.5) * 6)
const humusDepth = (x) => 6 + Math.round(humusLine(x, 0) * 3)
const soilDepth = (x) => 33 + Math.round((soilLine(x, 0) - 0.5) * 8) + roll(x)
// The gravel band sits at the base of the subsoil, above the rock.
const gravelTop = (x) => soilDepth(x) - 5 - Math.round(strata(x * 3, 0) * 3)

// Thick beds within one vertical period, each with its own tone and the odd
// joint; a few thinner, weaker layers weather back under the ledge above.
const beds = []
for (let top = 0; top < ROCK_PERIOD;) {
  const recessed = rng() < 0.2
  const remaining = ROCK_PERIOD - top
  let thick = recessed ? 3 + Math.floor(rng() * 3) : 9 + Math.floor(rng() * 12)
  if (remaining - thick < 6) thick = remaining
  const spacing = 40 + Math.floor(rng() * 50)
  const joints = new Set()
  for (let x = Math.floor(rng() * spacing); x < W; x += spacing) {
    if (rng() < 0.55) joints.add((x + Math.floor(rng() * 9) - 4 + W) % W)
  }
  beds.push({ top, thick, tone: rng() < 0.5 ? 0 : rng() < 0.5 ? -0.6 : 0.6, recessed, joints, tint: rng() < 0.6 ? WARM : COOL })
  top += thick
}
const bedAt = new Array(ROCK_PERIOD)
for (const bed of beds) for (let y = bed.top; y < bed.top + bed.thick; y++) bedAt[y] = bed

// Root tips hanging from the topsoil into the clay.
const roots = new Set()
for (let x0 = 0; x0 < W; x0 += 8) {
  if (rng() >= 0.3) continue
  let x = x0 + Math.floor(rng() * 8)
  const length = 2 + Math.floor(rng() * 7)
  for (let dy = 0; dy < length; dy++) {
    roots.add(((x + W) % W) + (humusDepth(x) + dy) * W)
    if (rng() < 0.3) x += rng() < 0.5 ? -1 : 1
  }
}

// Flints and pebbles in the clay, thickening into the gravel band.
const FLINT_SHAPES = [["xx"], ["xx", "xx"], [".xx", "xxx"], ["xxx", ".x."]]
const flints = new Map()
const dropFlint = (x0, y0) => {
  const shape = FLINT_SHAPES[Math.floor(rng() * FLINT_SHAPES.length)]
  shape.forEach((row, dy) => [...row].forEach((cell, dx) => {
    if (cell === "x") flints.set(((x0 + dx) % W) + (y0 + dy) * W, dy === 0 ? 2 : 1)
  }))
}
for (let n = 0; n < 40; n++) dropFlint(Math.floor(rng() * W), 10 + Math.floor(rng() * 16))
for (let x = 0; x < W; x += 3) if (rng() < 0.55) dropFlint(x + Math.floor(rng() * 3), gravelTop(x) + Math.floor(rng() * 5))

// --- Paint -------------------------------------------------------------------
const pixels = new Uint8Array(W * H * 4)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const g = grain(x, y) - 0.5
    const m = mottle(x, y) - 0.5
    let colour
    let tint = [1, 1, 1]
    const soil = soilDepth(x)
    const key = x + y * W
    if (y < humusDepth(x)) {
      colour = pick(HUMUS, 1 + g * 2.2)
    } else if (y < soil) {
      if (flints.has(key)) {
        colour = pick(FLINT, flints.get(key) + g * 0.8)
      } else if (roots.has(key)) {
        colour = HUMUS[0]
      } else {
        // Clay-loam: faint packed layers, darker and stonier toward the gravel.
        const gravel = y >= gravelTop(x) ? 0.7 : 0
        colour = pick(EARTH, 1.9 + g * 1.4 + (strata(x, y) - 0.5) * 1.2 + m * 0.8 - y / 90 - gravel)
      }
    } else {
      // Bedrock, repeating every ROCK_PERIOD rows below ROCK_TOP. The bedding
      // rolls as one; joints are sparse and stagger bed to bed.
      const rolled = (((y - ROCK_TOP - roll(x)) % ROCK_PERIOD) + ROCK_PERIOD) % ROCK_PERIOD
      const bed = bedAt[rolled]
      const above = bedAt[(bed.top - 1 + ROCK_PERIOD) % ROCK_PERIOD]
      const local = rolled - bed.top
      let shade = 2.8 + bed.tone + g * 1.1 + m * 0.9
      if (bed.recessed) shade -= 1.0
      // Ledge light and bedding shadow come and go along the bed, so they
      // read as a weathered edge rather than a ruled line.
      const worn = grain(x + 37, y * 7) > 0.45
      if (local === 0) {
        shade += bed.recessed ? -0.8 : (above?.recessed ? 1.1 : 0.7) * (worn ? 1 : 0.3)
      } else if (local === bed.thick - 1) {
        shade -= worn ? 1.1 : 0.5
      } else if (bed.joints.has(x) && grain(x, y + 91) < 0.75) {
        shade -= 1.1
      }
      colour = pick(STONE, shade)
      tint = bed.tint
    }
    const i = (y * W + x) * 4
    for (let c = 0; c < 3; c++) pixels[i + c] = Math.max(0, Math.min(255, Math.round(colour[c] * tint[c])))
    pixels[i + 3] = 255
  }
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "textures", "dirt-side.png")
writePng(out, W, pixels, H)
