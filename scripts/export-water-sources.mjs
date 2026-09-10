import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { freezeAssetUpdates } from "./asset-browser.mjs"

const args = process.argv.slice(2), urlIndex = args.indexOf("--url")
const origin = urlIndex < 0 ? "http://localhost:3000" : args[urlIndex + 1]
const directory = "public/textures/water-sources/v2"
if (existsSync(directory)) throw new Error("This version exists. Increment the asset version; published bakes are immutable.")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await freezeAssetUpdates(page)
  await page.goto(new URL("/assets/textures", origin).href, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.waitForFunction(() => window.__bakeWaterSources, null, { timeout: 120_000 })
  const bake = await page.evaluate(() => window.__bakeWaterSources())
  mkdirSync(directory, { recursive: true })
  for (const name of ["color", "depth", "topdown"]) writeFileSync(`${directory}/${name}.png`, Buffer.from(bake[name].split(",")[1], "base64"))
  writeFileSync(`${directory}/manifest.json`, JSON.stringify({ frame: bake.frame, definitions: bake.definitions }, null, 2) + "\n")
  console.log(`Exported ${directory}: two water sources, eight views each, color and depth.`)
} finally { await browser.close() }
