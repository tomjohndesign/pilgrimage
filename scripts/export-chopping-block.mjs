// Reuse the character editor's baker; published sprite versions are immutable.
import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"

const args = process.argv.slice(2)
const version = args.find(arg => /^v\d+$/.test(arg))
const urlIndex = args.indexOf("--url")
const origin = urlIndex < 0 ? "http://localhost:3000" : args[urlIndex + 1]
if (!version || !origin) throw new Error("Usage: node scripts/export-chopping-block.mjs v1 [--url http://localhost:3100]")
const directory = `public/textures/trees/chopping-block/${version}`
if (existsSync(directory)) throw new Error("This version exists. Use a new version.")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await page.goto(new URL("/assets/characters?asset=cart", origin).href)
  await page.waitForFunction(() => window.__choppingBlockBake, undefined, { timeout: 120_000 })
  const { url, ...metadata } = await page.evaluate(() => window.__choppingBlockBake())
  mkdirSync(directory, { recursive: true })
  writeFileSync(`${directory}/stump.png`, Buffer.from(url.split(",")[1], "base64"))
  writeFileSync(`${directory}/manifest.json`, JSON.stringify({ ...metadata,
    url: `/${directory.replace(/^public\//, "")}/stump.png` }, null, 2) + "\n")
  console.log(`Exported ${directory}: the character rig's chopping block in eight directions.`)
} finally { await browser.close() }
