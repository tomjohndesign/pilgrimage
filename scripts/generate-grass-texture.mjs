// Reuse the original environment plants as tile art at their native pixel size.
// Refresh their source with: node scripts/export-environment.mjs vN --url ...
import sharp from "sharp"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spriteTile } from "./terrain-sprite-lib.mjs"
import { makeRng } from "./texture-lib.mjs"
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "textures")
const tile = spriteTile([119, 134, 75], 483921)
const palette = { d: [88, 109, 52], l: [151, 165, 95], s: [130, 146, 79] }
const tufts = [["..l...", "l.l.s.", "dldsd.", ".ddd.."], ["..l..", "l.d.s", ".ldd.", "..d.."], ["lls", ".dd"]]
tile.scatter(11, .8, (x, y, pick) => tile.stamp(x, y, tufts[Math.floor(pick * tufts.length)], palette))
tile.save("grass")
const base = await sharp(join(out, "grass.png")).png().toBuffer()
const topdown = join(out, "environment/v2/topdown.png")
const upright = join(out, "environment/v2/color.png")
for (const [name, kind, seed] of [["meadow", 1, 181], ["groundcover", 4, 182], ["flowers", 5, 183]]) {
  const rng = makeRng(seed), layers = []
  const centers = []
  for (let attempt = 0; attempt < 100 && centers.length < 8; attempt++) {
    const left = 4 + Math.floor(rng() * 85), top = 4 + Math.floor(rng() * 85)
    if (centers.some(([x, y]) => Math.hypot(x - left, y - top) < 24)) continue
    centers.push([left, top])
    const variant = Math.floor(rng() * 3)
    // Keep the upright grass/flower silhouettes readable as flat sprite motifs.
    // Low creeping leaves use their actual overhead footprint.
    const source = kind === 4 ? topdown : upright
    const extract = kind === 4
      ? { left: variant * 64 + 14, top: kind * 64 + 14, width: 36, height: 36 }
      : { left: 14, top: (kind * 3 + variant) * 64 + 18, width: 36, height: 36 }
    const input = await sharp(source).extract(extract).png().toBuffer()
    layers.push({ input, left, top })
  }
  const pixels = await sharp(base).composite(layers).png().toBuffer()
  await sharp(pixels).toFile(join(out, `grass-${name}.png`))
}
console.log("wrote grass palette swatches from the original environment sprites")

// Independent transparent stamps for continuous world-space scattering. The
// larger composite swatches above are gallery illustrations, never tiled in play.
const stamps = []
for (let row = 0; row < 4; row++) for (let column = 0; column < 12; column++) {
  const variant = column % 3, view = Math.floor(column / 3) * 2
  let input
  if (row === 0) {
    const pixels = Buffer.alloc(32 * 32 * 4)
    const glyph = tufts[column % tufts.length]
    glyph.forEach((line, y) => [...line].forEach((key, x) => {
      if (palette[key]) pixels.set([...palette[key], 255], ((y + 14) * 32 + x + 13) * 4)
    }))
    input = await sharp(pixels, { raw: { width: 32, height: 32, channels: 4 } }).png().toBuffer()
  } else {
    const kind = [0, 1, 4, 5][row]
    const extract = row === 2
      ? { left: variant * 64 + 16, top: kind * 64 + 16, width: 32, height: 32 }
      : { left: view * 64 + 16, top: (kind * 3 + variant) * 64 + 20, width: 32, height: 32 }
    input = await sharp(row === 2 ? topdown : upright).extract(extract).png().toBuffer()
  }
  stamps.push({ input, left: column * 32, top: row * 32 })
}
await sharp({ create: { width: 384, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(stamps).png().toFile(join(out, "grass-sprites.png"))
