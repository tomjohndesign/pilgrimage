import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
const args = process.argv.slice(2), version = args.find(arg => /^v\d+$/.test(arg))
const urlIndex = args.indexOf("--url"), origin = urlIndex < 0 ? "http://localhost:55010" : args[urlIndex + 1]
if (!version) throw new Error("Usage: npm run assets:population -- v1 [--url http://localhost:55010]")
const prefix = `public/textures/characters/population/${version}`
if (existsSync(prefix)) throw new Error("This population version already exists; use a new version.")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await page.goto(new URL("/assets/characters", origin).href)
  await page.waitForFunction(() => window.__bakePersonPopulation)
  const pack = await page.evaluate(() => window.__bakePersonPopulation())
  mkdirSync(prefix, { recursive: true })
  const save = (name, data) => { writeFileSync(`${prefix}/${name}.png`, Buffer.from(data.split(",")[1], "base64")); return `/${prefix.replace(/^public\//, "")}/${name}.png` }
  for (const [type, entry] of Object.entries(pack.callings)) for (const clip of ["walk", "idle"]) entry[clip] = save(`${type}-${clip}`, entry[clip])
  for (const clip of ["walk", "idle"]) pack.shadows[clip] = save(`shadow-${clip}`, pack.shadows[clip])
  writeFileSync(`${prefix}/manifest.json`, JSON.stringify(pack, null, 2) + "\n")
  console.log(`Exported ${Object.keys(pack.callings).length} callings × 6 body profiles, with shared shadows: ${prefix}`)
} finally { await browser.close() }
