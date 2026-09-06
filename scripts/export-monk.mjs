// Bake the editor's Monk preset through the shared parametric character renderer.
import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
const args = process.argv.slice(2), version = args.find(arg => /^v\d+$/.test(arg))
const urlIndex = args.indexOf("--url"), origin = urlIndex < 0 ? "http://localhost:3000" : args[urlIndex + 1]
if (!version) throw new Error("Usage: node scripts/export-monk.mjs v1 [--grey] [--url http://localhost:3000]")
const grey = args.includes("--grey")
const directory = `public/textures/characters/monks/${version}`
if (existsSync(directory)) throw new Error("This monk version already exists; use a new version.")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await page.goto(new URL("/assets/characters", origin).href)
  await page.getByRole("button", { name: "Monk", exact: true }).click()
  await page.waitForFunction(() => window.__basePersonBake?.metadata.design.garment === "Robe" && !!window.__basePersonBake.actions, undefined, { timeout: 120_000 })
  if (grey) {
    await page.getByLabel("Hair color", { exact: true }).fill("#a8aaa5")
    await page.waitForFunction(() => window.__basePersonBake?.metadata.design.hairColor === "#a8aaa5", undefined, { timeout: 120_000 })
  }
  const bake = await page.evaluate(() => window.__basePersonBake)
  mkdirSync(directory, { recursive: true })
  const images = {}
  for (const key of ["walk", "idle", "shadowWalk", "shadowIdle"]) {
    writeFileSync(`${directory}/${key}.png`, Buffer.from(bake[key].split(",")[1], "base64"))
    images[key] = `/${directory.replace(/^public\//, "")}/${key}.png`
  }
  const actions = {}
  for (const [clip, entry] of Object.entries(bake.actions)) {
    actions[clip] = {}
    for (const kind of ["url", "shadow"]) {
      const name = kind === "url" ? clip : `shadow-${clip}`
      writeFileSync(`${directory}/${name}.png`, Buffer.from(entry[kind].split(",")[1], "base64"))
      actions[clip][kind] = `/${directory.replace(/^public\//, "")}/${name}.png`
    }
  }
  images.actions = actions
  writeFileSync(`${directory}/manifest.json`, JSON.stringify({ ...bake.metadata, images }, null, 2) + "\n")
  console.log(`Exported ${directory}: walking, idle and ${Object.keys(actions).length} activity poses with cast shadows.`)
} finally { await browser.close() }
