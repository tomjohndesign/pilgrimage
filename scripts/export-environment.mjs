import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { freezeAssetUpdates } from "./asset-browser.mjs"
const args = process.argv.slice(2), version = args.find(arg => /^v\d+$/.test(arg))
const index = args.indexOf("--url"), origin = index < 0 ? "http://localhost:3107" : args[index + 1]
if (!version) throw new Error("Usage: node scripts/export-environment.mjs v1 [--url http://localhost:3107]")
const directory = `public/textures/environment/${version}`
if (existsSync(directory)) throw new Error("This version already exists; use a fresh asset version.")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await freezeAssetUpdates(page)
  page.on("pageerror", error => console.error(error.message))
  await page.goto(new URL("/assets/textures", origin).href, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.waitForFunction(() => window.__bakeEnvironment, undefined, { timeout: 120_000 })
  const atlas = await page.evaluate(() => window.__bakeEnvironment())
  mkdirSync(directory, { recursive: true })
  for (const kind of ["color", "depth", "topdown"]) writeFileSync(`${directory}/${kind}.png`, Buffer.from(atlas[kind].split(",")[1], "base64"))
  for (const kind of ["color", "depth", "topdown"]) writeFileSync(`${directory}/boulders-${kind}.png`, Buffer.from(atlas.boulders[kind].split(",")[1], "base64"))
  writeFileSync(`${directory}/manifest.json`, JSON.stringify({ frame: atlas.frame, boulders: atlas.boulders.frame, version, depthEncoding: "view-offset-rg16-v1" }, null, 2) + "\n")
  console.log(`Exported ${directory}`)
} finally { await browser.close() }
