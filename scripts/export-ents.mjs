import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { freezeAssetUpdates } from "./asset-browser.mjs"

const args = process.argv.slice(2), version = args.find(arg => /^v\d+$/.test(arg))
const index = args.indexOf("--url"), origin = index < 0 ? "http://localhost:3219" : args[index + 1]
if (!version) throw new Error("Usage: node scripts/export-ents.mjs v1 [--url http://localhost:3219]")
const directory = `public/textures/trees/ents/${version}`
if (existsSync(directory)) throw new Error("This version exists; published bakes are immutable.")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await freezeAssetUpdates(page)
  page.on("pageerror", error => console.error(error.message))
  await page.goto(new URL("/assets/characters?asset=ents", origin).href, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.waitForFunction(() => window.__bakeEnts, undefined, { timeout: 120_000 })
  const atlas = await page.evaluate(() => window.__bakeEnts())
  mkdirSync(directory, { recursive: true })
  for (const kind of ["color", "depth"]) writeFileSync(`${directory}/${kind}.png`, Buffer.from(atlas[kind].split(",")[1], "base64"))
  writeFileSync(`${directory}/manifest.json`, JSON.stringify({ version,
    color: `/${directory.slice(7)}/color.png`, depth: `/${directory.slice(7)}/depth.png`,
    cellSize: 64, extent: 64 * .74 * 1.5 / 48, anchor: [32, 54], directions: 8,
    frames: 20, rows: 126, secondsPerStride: 6, stanceFraction: .6,
    species: ["oak", "beech", "birch", "scotsPine", "hawthorn", "holly"],
    layout: "21 rows per species: 20 distance-driven walking poses, then idle. Columns are eight directions. Existing foliage crowns attach at the shared rig pelvis.",
    depthEncoding: "view-offset-rg16-v1",
  }, null, 2) + "\n")
  await page.screenshot({ path: ".context/ent-playground.png" })
  console.log(`Exported ${directory}: six species, 1008 paired limb poses.`)
} finally { await browser.close() }
