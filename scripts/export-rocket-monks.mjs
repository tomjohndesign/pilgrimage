import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"

const args = process.argv.slice(2), index = args.indexOf("--url")
const origin = index < 0 ? "http://localhost:3000" : args[index + 1]
const directory = "public/textures/characters/rockets/v1"
if (existsSync(directory)) throw new Error("This rocket version exists; publish a new version instead of overwriting it.")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await page.goto(new URL("/assets/characters", origin).href, { timeout: 120_000 })
  await page.waitForFunction(() => window.__rocketMonkBake, undefined, { timeout: 120_000 })
  const bake = await page.evaluate(() => window.__rocketMonkBake())
  mkdirSync(directory, { recursive: true })
  for (const [name, data] of Object.entries(bake.images)) writeFileSync(`${directory}/${name}.png`, Buffer.from(data.split(",")[1], "base64"))
  writeFileSync(`${directory}/manifest.json`, JSON.stringify(bake.metadata, null, 2) + "\n")
  console.log(`Exported ${Object.keys(bake.images).length} rocket monk sheets; ${bake.metadata.safePadding}px safe padding.`)
} finally { await browser.close() }
