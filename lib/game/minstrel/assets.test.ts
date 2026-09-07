import { expect, it } from "vitest"
import sharp from "sharp"
import manifest from "../../../public/textures/characters/minstrel/v1/manifest.json"
import { BASE_PERSON } from "../base-person/pose"
import { MINSTREL_PLAYING } from "./assets"

it("ships a complete playing loop at the shared character pixel size and registration", async () => {
  expect(manifest.templateVersion).toBe(BASE_PERSON.version)
  expect(manifest.cellSize).toBe(BASE_PERSON.cellSize)
  expect(manifest.anchor).toEqual(BASE_PERSON.anchor)
  expect(MINSTREL_PLAYING.columns).toBe(manifest.frames)
  const { data, info } = await sharp(`public${MINSTREL_PLAYING.url}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  expect([info.width, info.height]).toEqual([manifest.frames * manifest.cellSize, manifest.rows * manifest.cellSize])
  const occupied = new Set<number>()
  for (let pixel = 0; pixel < info.width * info.height; pixel++) {
    const alpha = data[pixel * 4 + 3]
    if (alpha === 0) continue
    if (alpha !== 255) throw new Error("Non-binary body alpha")
    const x = pixel % info.width, y = Math.floor(pixel / info.width)
    const col = x % manifest.cellSize, row = y % manifest.cellSize
    if (Math.min(col, row, manifest.cellSize - 1 - col, manifest.cellSize - 1 - row) < 4) throw new Error("Clipped minstrel frame")
    occupied.add(Math.floor(y / manifest.cellSize) * manifest.frames + Math.floor(x / manifest.cellSize))
  }
  expect(occupied.size).toBe(manifest.frames * manifest.rows)
})
