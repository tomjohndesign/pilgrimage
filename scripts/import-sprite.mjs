// Pack imagegen output into registered, low-resolution game frames.
// Usage: node scripts/import-sprite.mjs peasant path/to/atlas.png [v2]
import sharp from "sharp"
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const [id, input, version = "v1"] = process.argv.slice(2)
const recipe = JSON.parse(readFileSync("assets/recipes/characters.json", "utf8"))
if (!recipe.characters.some((c) => c.id === id) || !input || !/^v\d+$/.test(version)) {
  throw new Error("Usage: npm run assets:import -- <character id> <source.png> [v2]")
}
const root = `public/textures/characters`
const output = `${root}/${id}-${version}.png`
if (existsSync(output)) throw new Error(`${output} exists. Choose a new version; imports never overwrite art.`)
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
if (Math.abs(info.width / info.height - 0.5) > 0.02) throw new Error("Expected a 4-column, 8-row atlas (1:2 aspect ratio).")
const alpha = Array.from({ length: info.width * info.height }, (_, i) => data[i * 4 + 3])
if (!alpha.some((a) => a === 0)) throw new Error("Source must have real transparency. Request an alpha background from imagegen.")
const layers = []
const frames = []
// Generated atlases often have uneven outer padding / row spacing. Separate
// actual occupied bands before slicing columns, rather than assuming a grid.
const bands = []
let start = -1, last = -1
for (let y = 0; y < info.height; y++) {
  let occupied = 0
  for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] >= 128) occupied++
  if (occupied > info.width * 0.015) {
    if (start < 0) start = y
    last = y
  } else if (start >= 0 && y - last > 3) {
    bands.push([start, last]); start = -1
  }
}
if (start >= 0) bands.push([start, last])
if (bands.length !== 8) throw new Error(`Found ${bands.length} separated rows; expected 8. Regenerate with clear gaps between rows.`)
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 4; col++) {
    const left = Math.round(col * info.width / 4)
    const top = Math.max(0, bands[row][0] - 1)
    const width = Math.round((col + 1) * info.width / 4) - left
    const height = Math.min(info.height - top, bands[row][1] - top + 2)
    let x0 = width, y0 = height, x1 = -1, y1 = -1
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[((top + y) * info.width + left + x) * 4 + 3] < 128) continue
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
    if (x1 < 0) throw new Error(`Empty frame ${row}, ${col}`)
    const w = x1 - x0 + 1, h = y1 - y0 + 1
    const targetWidth = Math.min(52, Math.max(1, Math.round(w / h * 48)))
    const frame = await sharp(input).extract({ left: left + x0, top: top + y0, width: w, height: h })
      .resize(targetWidth, 48, { kernel: "nearest" }).png().toBuffer()
    layers.push({ input: frame, left: col * 64 + Math.floor((64 - targetWidth) / 2), top: row * 64 + 10 })
    frames.push({ direction: recipe.layout.directions[row], frame: col, x: col * 64, y: row * 64, width: 64, height: 64 })
  }
}
mkdirSync(`${root}/sources`, { recursive: true })
const source = `${root}/sources/${id}-${version}.png`
if (resolve(input) !== resolve(source)) {
  if (existsSync(source)) throw new Error(`${source} exists. Choose a new version.`)
  copyFileSync(input, source)
}
await sharp({ create: { width: 256, height: 512, channels: 4, background: "#00000000" } })
  .composite(layers).png({ palette: true, colours: 32, dither: 0 }).toFile(output)
writeFileSync(output.replace(/\.png$/, ".json"), JSON.stringify({
  image: `/${output.replace(/^public\//, "")}`, source: `/${source.replace(/^public\//, "")}`,
  generator: "Built-in imagegen; registered and packed with sharp", recipe: "assets/recipes/characters.json",
  columns: 4, rows: 8, cellWidth: 64, cellHeight: 64, anchor: [0.5, 58 / 64], frames,
}, null, 2) + "\n")
console.log(`Packed ${output}: 32 frames, 48px figures, 32-color palette.`)
