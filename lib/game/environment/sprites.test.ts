import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { BOULDER_ATLAS, BOULDER_FRAME, ENVIRONMENT_ATLAS, ENVIRONMENT_FRAME } from "./sprites"
import { CHARACTER_PIXEL_SIZE } from "../render/pixel-scale"

describe("environment sprites", () => {
  it.each([
    { name: "small scenery", frame: ENVIRONMENT_FRAME, atlas: ENVIRONMENT_ATLAS },
    { name: "large boulder groups", frame: BOULDER_FRAME, atlas: BOULDER_ATLAS },
  ])("keeps $name grounded with native pixels, complete depth and unclipped silhouettes", async ({ frame, atlas }) => {
    const color = await sharp(`public${atlas.color}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const depth = await sharp(`public${atlas.depth}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(frame.extent / frame.cellSize).toBe(CHARACTER_PIXEL_SIZE)
    expect([color.info.width, color.info.height]).toEqual([frame.cellSize * frame.directions, frame.cellSize * frame.rows])
    expect(depth.info).toEqual(color.info)
    const counts = Array(frame.rows * frame.directions).fill(0)
    let missing = 0, clipped = 0, translucent = 0
    for (let i = 0; i < color.data.length; i += 4) {
      if (!color.data[i + 3]) continue
      const x = i / 4 % color.info.width, y = Math.floor(i / 4 / color.info.width)
      const px = x % frame.cellSize, py = y % frame.cellSize
      const z = depth.data[i] * 256 + depth.data[i + 1]
      if (depth.data[i + 2] !== 255 || z === 0 || z === 65535) missing++
      if (Math.min(px, py, frame.cellSize - 1 - px, frame.cellSize - 1 - py) < 2) clipped++
      if (color.data[i + 3] !== 255) translucent++
      counts[Math.floor(y / frame.cellSize) * frame.directions + Math.floor(x / frame.cellSize)]++
    }
    expect({ missing, clipped, translucent }).toEqual({ missing: 0, clipped: 0, translucent: 0 })
    counts.forEach(count => expect(count).toBeGreaterThan(10))
  })

  it("keeps the ground sprite library transparent between independently placed plants", async () => {
    const image = await sharp("public/textures/grass-sprites.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([image.info.width, image.info.height]).toEqual([384, 128])
    const counts = Array(48).fill(0)
    let translucent = 0
    for (let i = 0; i < image.data.length; i += 4) {
      const alpha = image.data[i + 3]
      if (!alpha) continue
      if (alpha !== 255) translucent++
      const x = i / 4 % image.info.width, y = Math.floor(i / 4 / image.info.width)
      counts[Math.floor(y / 32) * 12 + Math.floor(x / 32)]++
    }
    expect(translucent).toBe(0)
    counts.forEach(count => {
      expect(count).toBeGreaterThan(2)
      expect(count).toBeLessThan(32 * 32 * .65)
    })
  })
})
