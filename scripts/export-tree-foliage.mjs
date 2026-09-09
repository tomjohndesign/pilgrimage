import { chromium } from "playwright"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { freezeAssetUpdates } from "./asset-browser.mjs"

const args = process.argv.slice(2), version = args.find(arg => /^v\d+$/.test(arg))
const index = args.indexOf("--url"), origin = index < 0 ? "http://localhost:3219" : args[index + 1]
if (!version) throw new Error("Usage: node scripts/export-tree-foliage.mjs v1 [--url http://localhost:3219]")
const directory = `public/textures/trees/foliage/${version}`
if (existsSync(directory)) throw new Error("This version exists; published bakes are immutable.")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--max-active-webgl-contexts=64"] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  await freezeAssetUpdates(page)
  page.on("pageerror", error => console.error(error.message))
  page.on("console", message => { if (message.type() === "error" || message.text().includes("context")) console.error(message.text()) })
  await page.goto(new URL("/assets/textures", origin).href, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.waitForFunction(() => window.__bakeTreeFoliage, undefined, { timeout: 120_000 })
  const atlas = await page.evaluate(() => window.__bakeTreeFoliage())
  mkdirSync(directory, { recursive: true })
  for (const kind of ["color", "depth"]) writeFileSync(`${directory}/${kind}.png`, Buffer.from(atlas[kind].split(",")[1], "base64"))
  writeFileSync(`${directory}/manifest.json`, JSON.stringify({ ...atlas, color: `/${directory.slice(7)}/color.png`, depth: `/${directory.slice(7)}/depth.png`, version, depthEncoding: "view-offset-rg16-v1", species: ["oak", "beech", "birch", "scotsPine", "hawthorn", "holly"] }, null, 2) + "\n")
  console.log(`Exported ${directory}: ${atlas.frame.rows * atlas.frame.directions} views, paired color/depth, ${atlas.safePadding}px safe margin.`)
  await page.screenshot({ path: ".context/foliage-first.png", fullPage: true })
} finally { await browser.close() }
