// Palette-limited, seamless road sprites. One texel matches a character pixel.
// node scripts/generate-road-textures.mjs
import { SIZE, spriteTile } from "./terrain-sprite-lib.mjs"

// Same light ochre as the loading fallback; the footprint shader owns wear.
const trail = spriteTile([201, 171, 122], 660917)
trail.scatter(12, .55, (x, y, p) => trail.stamp(x, y, p < .5 ? ["dd"] : ["ll", ".d"], {
  d: [191, 160, 113], l: [210, 182, 136],
}))
trail.save("road-trail")

const gravel = spriteTile([171, 155, 126], 660918)
gravel.scatter(5, .85, (x, y, p) => gravel.stamp(x, y, p < .5 ? ["ll", "dd"] : ["l", "d"], {
  l: [188, 174, 146], d: [156, 141, 113],
}))
gravel.save("road-gravel")

// Offset courses of small rounded setts and larger hand-cut slabs, with earth joints.
for (const [name, w, h, base, shades] of [
  ["road-cobble", 8, 8, [137, 128, 109], [[167, 158, 138], [177, 167, 147], [160, 153, 135]]],
  ["road-flagstone", 16, 16, [142, 132, 112], [[178, 169, 149], [188, 178, 157], [171, 163, 145]]],
]) {
  const tile = spriteTile(base, 660919)
  for (let y = 0; y < SIZE; y += h) for (let x = 0; x < SIZE; x += w) {
    const color = shades[Math.floor(tile.rng() * shades.length)]
    const offset = (y / h % 2) * w / 2
    for (let dy = 1; dy < h; dy++) for (let dx = 1; dx < w; dx++) {
      if ((dy === 1 || dy === h - 1) && (dx === 1 || dx === w - 1)) continue
      tile.dot(x + offset + dx, y + dy, dy === h - 1 ? color.map(c => c - 7) : color)
    }
  }
  tile.save(name)
}
