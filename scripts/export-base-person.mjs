// Bake from the same page used for review. Run a dev server first.
import { chromium } from "playwright"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { freezeAssetUpdates } from "./asset-browser.mjs"
const args = process.argv.slice(2)
const urlIndex = args.indexOf("--url")
const origin = urlIndex < 0 ? "http://localhost:3000" : args[urlIndex + 1]
const version = args.find((arg) => /^v\d+$/.test(arg))
if (!version || !origin) throw new Error("Usage: npm run assets:base -- v1 [--url http://localhost:3100]")
const prefix = `public/textures/characters/base/base-person-${version}`
const suffixes = ["walk.png", "idle.png", "sides-walk.png", "sides-idle.png", "shadow-walk.png", "shadow-idle.png", "json"]
const path = (suffix) => suffix === "json" ? `${prefix}.json` : `${prefix}-${suffix}`
if (suffixes.some((suffix) => existsSync(path(suffix)))) throw new Error("This version exists. Use a new version; published bakes are never overwritten.")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await freezeAssetUpdates(page)
  await page.goto(new URL("/assets/characters", origin).href)
  await page.waitForFunction(() => window.__basePersonBake, undefined, { timeout: 120_000 })
  const bake = await page.evaluate(() => window.__basePersonBake)
  mkdirSync("public/textures/characters/base", { recursive: true })
  for (const [key, suffix] of Object.entries({ walk: "walk.png", idle: "idle.png", debugWalk: "sides-walk.png", debugIdle: "sides-idle.png", shadowWalk: "shadow-walk.png", shadowIdle: "shadow-idle.png", depthWalk: "depth-walk.png", depthIdle: "depth-idle.png" })) {
    writeFileSync(path(suffix), Buffer.from(bake[key].split(",")[1], "base64"))
  }
  const actions = {}
  for (const [clip, entry] of Object.entries(bake.actions)) {
    actions[clip] = {}
    for (const [kind, data] of Object.entries(entry)) {
      const suffix = `${kind === "url" ? clip : `${kind}-${clip}`}.png`
      writeFileSync(path(suffix), Buffer.from(data.split(",")[1], "base64"))
      actions[clip][kind] = `/${path(suffix).replace(/^public\//, "")}`
    }
  }
  const recipe = readFileSync("assets/recipes/base-person.json")
  // Lighting-only rebakes advance the asset path without changing the walking rig.
  const metadata = { ...bake.metadata, templateVersion: bake.metadata.version, version, recipe: "assets/recipes/base-person.json",
    recipeSha256: createHash("sha256").update(recipe).digest("hex"),
    images: { actions, walk: `/${prefix.replace(/^public\//, "")}-walk.png`, idle: `/${prefix.replace(/^public\//, "")}-idle.png`, shadowWalk: `/${prefix.replace(/^public\//, "")}-shadow-walk.png`, shadowIdle: `/${prefix.replace(/^public\//, "")}-shadow-idle.png`, depthWalk: `/${prefix.replace(/^public\//, "")}-depth-walk.png`, depthIdle: `/${prefix.replace(/^public\//, "")}-depth-idle.png` },
  }
  writeFileSync(path("json"), JSON.stringify(metadata, null, 2) + "\n")
  console.log(`Exported ${prefix}: ${Object.values(bake.metadata.clips).reduce((sum, frames) => sum + frames.length, 0)} poses, shadows, anatomical-side diagnostics and socket coordinates.`)
} finally { await browser.close() }
