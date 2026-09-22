// Export the reviewed native-size PNGs from the shared playground.
import { chromium } from "playwright"
import { mkdir, writeFile, access, rename, rm } from "node:fs/promises"
import sharp from "sharp"
import { freezeAssetUpdates } from "./asset-browser.mjs"

const args = process.argv.slice(2), version = args.find(arg => /^v\d+$/.test(arg))
const urlIndex = args.indexOf("--url"), origin = urlIndex < 0 ? "http://localhost:3000" : args[urlIndex + 1]
if (!version || !origin) throw new Error("Usage: node scripts/export-icons.mjs v2 [--url http://localhost:3197]")
const destination = `public/game-icons/${version}`, staging = `${destination}-export-${process.pid}`
try { await access(destination); throw new Error("This icon version exists. Export to an unused version.") } catch (error) { if (error.code !== "ENOENT") throw error }
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await freezeAssetUpdates(page)
  await page.goto(new URL("/assets?asset=icons", origin).href)
  await page.waitForFunction(() => window.__iconBake, undefined, { timeout: 120_000 })
  const { atlas, themes, design, icons, sizes } = await page.evaluate(() => window.__iconBake)
  await mkdir(staging, { recursive: true })
  for (const theme of themes) {
  await mkdir(`${staging}/${theme}`, { recursive: true })
  for (const { id } of icons) for (const size of sizes) {
    const buffer = Buffer.from(atlas[theme][id][size].split(",")[1], "base64")
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    if (info.width !== size || info.height !== size) throw new Error(`Wrong dimensions for ${id} ${size}`)
    let opaque = 0
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const alpha = data[(y * size + x) * 4 + 3]
      if (alpha) opaque++
      if (alpha && (x === 0 || y === 0 || x === size - 1 || y === size - 1)) throw new Error(`Clipped icon: ${id} ${size}`)
    }
    if (!opaque) throw new Error(`Empty icon: ${id} ${size}`)
    await writeFile(`${staging}/${theme}/${id}-${size}.png`, buffer)
  }
  }
  await writeFile(`${staging}/manifest.json`, JSON.stringify({ version, design, themes, sizes, icons: icons.map(({ id, label }) => ({ id, label })) }, null, 2) + "\n")
  await rename(staging, destination)
  console.log(`Exported ${themes.length * icons.length * sizes.length} transparent PNGs to ${destination}.`)
} finally { await browser.close(); await rm(staging, { recursive: true, force: true }) }
