import { describe, expect, it } from "vitest"
import sharp from "sharp"
import manifest from "../../../public/textures/characters/rockets/v5/manifest.json"
import { BASE_PERSON, PERSON_CLIPS } from "../base-person/pose"
import { monkVisual } from "../base-person/monk-assets"
import { rocketFlightClip, rocketMonkVisual } from "./assets"

describe("rocket monk assets", () => {
  it("keeps both monk designs, stride, scale and action timing on the shared rig", () => {
    expect(manifest.templateVersion).toBe(BASE_PERSON.version)
    expect(manifest.anchor).toEqual(BASE_PERSON.anchor)
    expect(manifest.camera).toEqual(BASE_PERSON.camera)
    for (const age of [30, 80]) {
      const base = monkVisual(age), rocket = rocketMonkVisual(age)
      for (const key of ["design", "scale", "center", "walkStride"] as const) expect(rocket[key]).toEqual(base[key])
      for (const [name, clip] of Object.entries(PERSON_CLIPS)) expect(manifest.frameCounts[name as keyof typeof PERSON_CLIPS]).toBe(clip.frames)
      for (const [name, clip] of Object.entries(rocket.actions)) expect(clip.playbackRate).toBe(base.actions[name as keyof typeof base.actions]?.playbackRate)
      expect(rocketFlightClip(age).columns).toBe(manifest.frameCounts.flying)
    }
  })

  it.each(["brown", "grey"])("ships complete, registered %s sheets with binary alpha and safe margins", async hair => {
    for (const [clip, columns] of Object.entries(manifest.frameCounts)) {
      const { data, info } = await sharp(`public/textures/characters/rockets/v5/${hair}-${clip}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const cell = manifest.cellSize
      expect([info.width, info.height]).toEqual([cell * columns, cell * manifest.directions.length])
      const occupied = new Set<number>()
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3]
        if (alpha === 0) continue
        if (alpha !== 255 || Math.min(x % cell, y % cell, cell - 1 - x % cell, cell - 1 - y % cell) < 4) {
          throw new Error(`${hair}-${clip}: invalid alpha or unsafe pixel at ${x},${y}`)
        }
        occupied.add(Math.floor(y / cell) * columns + Math.floor(x / cell))
      }
      expect(occupied.size).toBe(columns * manifest.directions.length)
    }
  })
})
