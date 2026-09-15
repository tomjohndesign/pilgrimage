import { readFile } from "node:fs/promises"
import sharp from "sharp"
import { luminance } from "./theme"
import { expect, it } from "vitest"
import { gameIconUrl, GAME_ICON_VERSION } from "./assets"
import { DEFAULT_ICON_DESIGN, ICON_THEMES, ICON_SIZES, ILLUSTRATED_ICONS } from "./design"

it("ships the reviewed default appearance and every registered icon size", async () => {
  const manifest = JSON.parse(await readFile(`public/game-icons/${GAME_ICON_VERSION}/manifest.json`, "utf8"))
  expect(manifest.version).toBe(GAME_ICON_VERSION)
  expect(manifest.design).toEqual(DEFAULT_ICON_DESIGN)
  expect(manifest.themes).toEqual(ICON_THEMES)
  expect(manifest.sizes).toEqual(ICON_SIZES)
  expect(manifest.icons.map((icon: { id: string }) => icon.id)).toEqual(ILLUSTRATED_ICONS.map(icon => icon.id))
  await Promise.all(ICON_THEMES.flatMap(theme => ILLUSTRATED_ICONS.flatMap(icon => ICON_SIZES.map(async size => {
    const { data, info } = await sharp(`public${gameIconUrl(icon.id, size, theme)}`).raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height, info.channels]).toEqual([size, size, 4])
    let solid = 0, translucent = 0
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const alpha = data[(y * size + x) * 4 + 3]
      if (alpha === 255) solid++
      else if (alpha) translucent++
      if (!x || !y || x === size - 1 || y === size - 1) expect(alpha, `${icon.id} ${size}: transparent margin`).toBe(0)
    }
    expect(solid).toBeGreaterThan(8)
    if (icon.id === "faith" || icon.id === "renown") expect(translucent).toBeGreaterThan(0)
    if (icon.id === "gold") expect(translucent).toBe(0)
  }))))
})

it("ships distinct theme artwork with identical silhouettes and interior details", async () => {
  for (const icon of ILLUSTRATED_ICONS) for (const size of ICON_SIZES) {
    const [light, dark] = await Promise.all(ICON_THEMES.map(theme => sharp(`public${gameIconUrl(icon.id, size, theme)}`).raw().toBuffer()))
    let changed = 0
    for (let i = 0; i < light.length; i += 4) {
      expect(light[i + 3]).toBe(dark[i + 3])
      if (light.subarray(i, i + 3).equals(dark.subarray(i, i + 3))) continue
      changed++
      expect(light[i + 3]).toBe(255)
      for (const surface of [[23, 24, 16], [37, 43, 29], [51, 65, 39]]) {
        expect((luminance(dark.subarray(i, i + 3)) + .05) / (luminance(surface) + .05), `${icon.id} dark contour`).toBeGreaterThanOrEqual(3)
      }
      for (const surface of [[241, 241, 232], [227, 231, 215], [203, 213, 183]]) {
        expect((luminance(surface) + .05) / (luminance(light.subarray(i, i + 3)) + .05), `${icon.id} light contour`).toBeGreaterThanOrEqual(3)
      }
    }
    expect(changed, `${icon.id} ${size}: separate theme palette`).toBeGreaterThan(0)
  }
})
