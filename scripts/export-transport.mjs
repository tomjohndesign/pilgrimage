import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"

const args = process.argv.slice(2), index = args.indexOf("--url")
const origin = index < 0 ? "http://localhost:3000" : args[index + 1]
const outputIndex = args.indexOf("--out")
const output = outputIndex < 0 ? undefined : args[outputIndex + 1]
if (outputIndex >= 0 && !output) throw new Error("--out requires a new output directory.")
const knights = args.includes("--knights")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await page.goto(new URL("/assets/characters?asset=cart&bake=transport", origin).href)
  await page.waitForFunction(knights => knights ? window.__knightBake : window.__transportBake, knights, { timeout: 120_000 })
  const bake = await page.evaluate(knights => knights ? window.__knightBake() : window.__transportBake(), knights)
  const directory = output ?? `public/textures/${knights ? "knights" : "transport"}/${bake.metadata.version}`
  if (existsSync(directory)) throw new Error("This version exists. Increment the asset version; published bakes are immutable.")
  mkdirSync(directory, { recursive: true })
  for (const [name, data] of Object.entries(bake.images)) writeFileSync(`${directory}/${name}.png`, Buffer.from(data.split(",")[1], "base64"))
  writeFileSync(`${directory}/manifest.json`, JSON.stringify(bake.metadata, null, 2) + "\n")
  console.log(`Exported ${directory}: ${Object.keys(bake.images).length} sheets, including all authored poses; ${bake.metadata.safePadding}px safe padding.`)
} finally { await browser.close() }
