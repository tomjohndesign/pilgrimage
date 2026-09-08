// Solid prebuilt canopy-depth sprites. The renderer samples the continuous
// field through the shared edge-grain texture, so equal-depth joins stay solid.
import sharp from "sharp"
const size = 44, columns = 5, rows = 16
const pixelSize = 0.74 * 1.5 / 48
const width = size * columns, height = size * rows
const pixels = new Uint8Array(width * height * 4)
const shade = [0, 38, 100, 158], litter = [0, 65, 190, 245]
const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
for (let depth = 0; depth < 4; depth++) for (let donor = 0; donor < 4; donor++) {
  for (let shape = 0; shape < 5; shape++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const direction = corners[shape - 1]
    const useDonor = direction && ((x + .5) * pixelSize - .5) * direction[0] + ((y + .5) * pixelSize - .5) * direction[1] > 0
    const level = useDonor ? donor : depth
    const offset = (((depth * 4 + donor) * size + y) * width + shape * size + x) * 4
    pixels.set([shade[level], litter[level], 0, 255], offset)
  }
}
await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile(new URL('../public/textures/forest-shadows-v4.png', import.meta.url).pathname)
console.log(`Wrote ${width} × ${height} forest-depth shadow atlas`)
