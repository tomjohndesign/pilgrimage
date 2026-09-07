import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { freezeAssetUpdates } from "./asset-browser.mjs"

const args = process.argv.slice(2), index = args.indexOf("--url")
const origin = index < 0 ? "http://localhost:3000" : args[index + 1]
const outputIndex = args.indexOf("--out")
const output = outputIndex < 0 ? undefined : args[outputIndex + 1]
if (outputIndex >= 0 && !output) throw new Error("--out requires a new output directory.")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await freezeAssetUpdates(page)
  // The export hook is shared by the editor. Avoid previewing not-yet-published carts.
  await page.goto(new URL("/assets/characters", origin).href, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.waitForFunction(() => window.__transportBake, undefined, { timeout: 120_000 })
  const bake = await page.evaluate(() => window.__transportBake())
  const directory = output ?? `public/textures/transport/${bake.metadata.version}`
  if (existsSync(directory)) throw new Error("This version exists. Increment TRANSPORT.version; published bakes are immutable.")
  mkdirSync(directory, { recursive: true })
  for (const [name, data] of Object.entries(bake.images)) writeFileSync(`${directory}/${name}.png`, Buffer.from(data.split(",")[1], "base64"))
  writeFileSync(`${directory}/manifest.json`, JSON.stringify(bake.metadata, null, 2) + "\n")
  console.log(`Exported ${directory}: ${Object.keys(bake.images).length} sheets, including cart states, animal coats/harnesses and merchant actions; ${bake.metadata.safePadding}px safe padding.`)
} finally { await browser.close() }
