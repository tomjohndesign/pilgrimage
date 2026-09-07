import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { freezeAssetUpdates } from "./asset-browser.mjs"
const args = process.argv.slice(2), urlIndex = args.indexOf("--url")
const origin = urlIndex < 0 ? "http://localhost:3000" : args[urlIndex + 1]
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await freezeAssetUpdates(page)
  await page.goto(new URL("/assets/characters", origin).href, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.waitForFunction(() => window.__minstrelBake, undefined, { timeout: 120_000 })
  const bake = await page.evaluate(() => window.__minstrelBake())
  const directory = `public/textures/characters/minstrel/v${bake.metadata.version}`
  if (existsSync(directory)) throw new Error("This minstrel version exists; choose a new asset version.")
  mkdirSync(directory, { recursive: true })
  writeFileSync(`${directory}/playing.png`, Buffer.from(bake.image.split(",")[1], "base64"))
  writeFileSync(`${directory}/depth-playing.png`, Buffer.from(bake.depth.split(",")[1], "base64"))
  writeFileSync(`${directory}/manifest.json`, JSON.stringify(bake.metadata, null, 2) + "\n")
  console.log(`Exported ${directory}, ${bake.metadata.safePadding}px safe padding.`)
} finally { await browser.close() }
