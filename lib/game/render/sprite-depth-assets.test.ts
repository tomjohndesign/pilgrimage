import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { readdir } from "node:fs/promises"
import { characterVisual, CHARACTER_ASSETS, type SpriteClip } from "../character-assets"
import { populationVisual } from "../base-person/population-assets"
import { monkVisual } from "../base-person/monk-assets"
import { rocketMonkVisual, rocketFlightClip } from "../rocket/assets"
import { pullingVisual } from "../transport/visual"
import { TRANSPORT } from "../transport/assets"
import { TRAVELER_TYPES } from "../travelers"
import { MINSTREL_PLAYING } from "../minstrel/assets"

describe("active sprite depth assets", () => {
  it("provides registered geometry depth for every active character and transport clip", async () => {
    const pairs = new Map<string, string>()
    const clip = (value: SpriteClip) => {
      expect(value.depth, value.url).toBeTruthy()
      pairs.set(value.url, value.depth!)
    }
    const visual = (value: ReturnType<typeof populationVisual>) => {
      clip(value.walk); clip(value.idle)
      for (const action of Object.values(value.actions)) clip(action)
    }
    const base = characterVisual(CHARACTER_ASSETS.peasant, "base")
    clip(base.walk); clip(base.idle)
    clip(MINSTREL_PLAYING)
    for (const action of Object.values(base.actions)) clip(action)
    for (const type of Object.values(TRAVELER_TYPES)) for (const age of [30, 80]) for (let variant = 0; variant < 6; variant++) {
      visual(populationVisual(type.id, variant, null, age))
    }
    for (const age of [30, 80]) { visual(monkVisual(age)); visual(rocketMonkVisual(age)); clip(rocketFlightClip(age)) }
    for (let variant = 0; variant < 6; variant++) visual(pullingVisual(variant))
    const directory = `/textures/transport/${TRANSPORT.version}`
    for (const file of await readdir(`public${directory}`)) {
      if (file.endsWith(".png") && !file.startsWith("depth-")) pairs.set(`${directory}/${file}`, `${directory}/depth-${file}`)
    }
    expect(pairs.size).toBeGreaterThan(200)
    for (const [color, depth] of pairs) {
      const body = await sharp(`public${color}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const geometry = await sharp(`public${depth}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      expect([geometry.info.width, geometry.info.height], depth).toEqual([body.info.width, body.info.height])
      let covered = 0, saturated = 0, missing = 0
      for (let i = 0; i < body.data.length; i += 4) {
        if (body.data[i + 3] < 128) continue
        covered++
        if (geometry.data[i + 2] !== 255 || geometry.data[i + 3] !== 255) missing++
        const value = geometry.data[i] * 256 + geometry.data[i + 1]
        if (value === 0 || value === 65535) saturated++
      }
      expect(covered, color).toBeGreaterThan(30)
      expect(missing, `${depth}: every visible body/ink pixel needs geometry`).toBe(0)
      expect(saturated, `${depth}: geometry must fit its encoded depth range`).toBe(0)
    }
  }, 120_000)
})
