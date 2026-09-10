import { expect, it } from "vitest"
import sharp from "sharp"
import { ENT_FRAME, ENT_FRAMES } from "./ent-rig"
import { FOLIAGE_SPECIES, BARK_PALETTE } from "./foliage/design"
import manifest from "../../../public/textures/trees/ents/v1/manifest.json"

it("ships every species' walk and idle with paired depth, native pixels, binary alpha and safe margins", async () => {
  const color = await sharp(`public${manifest.color}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const depth = await sharp(`public${manifest.depth}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { cellSize: size, directions, rows } = ENT_FRAME
  expect(manifest.species).toEqual(FOLIAGE_SPECIES)
  expect(manifest.frames).toBe(ENT_FRAMES)
  expect(manifest.extent / size).toBeCloseTo(.74 * 1.5 / 48, 10)
  expect([color.info.width, color.info.height]).toEqual([directions * size, rows * size])
  expect(depth.info).toEqual(color.info)
  const palette = new Set(BARK_PALETTE.map(hex => parseInt(hex.slice(1), 16)))
  let mismatched = 0, fractional = 0, clipped = 0, uncoloured = 0
  const counts = new Uint16Array(rows * directions)
  for (let y = 0; y < color.info.height; y++) for (let x = 0; x < color.info.width; x++) {
    const i = (y * color.info.width + x) * 4, alpha = color.data[i + 3]
    // Depth alpha stays opaque to preserve RG16 bytes; B is the geometry mask.
    if (alpha !== depth.data[i + 2] || depth.data[i + 3] !== 255) mismatched++
    if (alpha !== 0 && alpha !== 255) fractional++
    if (!alpha) continue
    counts[Math.floor(y / size) * directions + Math.floor(x / size)]++
    if (x % size < 2 || x % size >= size - 2 || y % size < 2 || y % size >= size - 2) clipped++
    if (!palette.has(color.data[i] * 65536 + color.data[i + 1] * 256 + color.data[i + 2])) uncoloured++
  }
  expect({ mismatched, fractional, clipped, uncoloured }).toEqual({ mismatched: 0, fractional: 0, clipped: 0, uncoloured: 0 })
  expect(Math.min(...counts)).toBeGreaterThan(50)
  // Every species animates in both cardinal and diagonal views.
  for (let species = 0; species < FOLIAGE_SPECIES.length; species++) for (const view of [0, 1, 2]) {
    const hashes = new Set<string>()
    for (const frame of [0, 5, 10, 15]) {
      const row = species * (ENT_FRAMES + 1) + frame
      const image = await sharp(`public${manifest.color}`).extract({ left: view * size, top: row * size, width: size, height: size }).raw().toBuffer()
      hashes.add(image.toString("base64"))
    }
    expect(hashes.size).toBe(4)
  }
})
