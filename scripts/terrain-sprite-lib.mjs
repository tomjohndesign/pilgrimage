// Small, palette-limited terrain sprites. Stamps wrap so motifs cross repeats.
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { makeRng, writePng } from "./texture-lib.mjs"

// Keep in sync with TERRAIN_SPRITE_SIZE in lib/game/render/ground-surface.ts.
export const SIZE = 128
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "textures")
export function spriteTile(base, seed) {
  const pixels = new Uint8Array(SIZE * SIZE * 4)
  const rng = makeRng(seed)
  const dot = (x, y, color) => {
    const i = (((y % SIZE + SIZE) % SIZE) * SIZE + (x % SIZE + SIZE) % SIZE) * 4
    pixels.set([...color.slice(0, 3), color[3] ?? 255], i)
  }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) dot(x, y, base)
  return {
    rng, dot,
    stamp(x, y, rows, palette) {
      rows.forEach((row, dy) => [...row].forEach((key, dx) => {
        if (palette[key]) dot(x + dx, y + dy, palette[key])
      }))
    },
    scatter(spacing, chance, draw) {
      for (let y = 0; y < SIZE; y += spacing) for (let x = 0; x < SIZE; x += spacing) {
        if (rng() < chance) draw(x + Math.floor(rng() * spacing), y + Math.floor(rng() * spacing), rng())
      }
    },
    save(name) { writePng(join(OUT, `${name}.png`), SIZE, pixels) },
  }
}
