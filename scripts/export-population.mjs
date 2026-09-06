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
  // Forward the dev hydration/debug stream, but freeze hot updates during a bake.
  let exporting = false
  const updates = new Set(["reloadPage", "serverComponentChanges", "turbopack-message", "built", "sync"])
  await page.routeWebSocket(/\/_next\/webpack-hmr/, socket => {
    const server = socket.connectToServer()
    server.onMessage(message => {
      if (exporting && typeof message === "string" && updates.has(JSON.parse(message).type)) return
      socket.send(message)
    })
  })
  page.on("pageerror", error => console.error(error.message))
  await page.goto(new URL("/assets/characters", origin).href, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.waitForFunction(() => window.__bakePersonPopulation, undefined, { timeout: 120_000 })
  let lastProgress = -1
  await page.exposeFunction("__reportPopulationProgress", progress => {
    const percent = Math.floor(progress * 100)
    if (percent >= lastProgress + 10 || percent === 100) { console.log(`Baking population: ${percent}%`); lastProgress = percent }
  })
  exporting = true
  const pack = await page.evaluate(() => window.__bakePersonPopulation(window.__reportPopulationProgress))
  mkdirSync(prefix, { recursive: true })
  const save = (name, data) => { writeFileSync(`${prefix}/${name}.png`, Buffer.from(data.split(",")[1], "base64")); return `/${prefix.replace(/^public\//, "")}/${name}.png` }
  for (const [type, entry] of Object.entries(pack.callings)) for (const clip of ["walk", "idle"]) entry[clip] = save(`${type}-${clip}`, entry[clip])
  for (const [type, entry] of Object.entries(pack.callings)) for (const [clip, data] of Object.entries(entry.actions ?? {})) entry.actions[clip] = save(`${type}-${clip}`, data)
  for (const [type, entry] of Object.entries(pack.greyCallings ?? {})) {
    for (const clip of ["walk", "idle"]) entry[clip] = save(`${type}-grey-${clip}`, entry[clip])
    for (const [clip, data] of Object.entries(entry.actions ?? {})) entry.actions[clip] = save(`${type}-grey-${clip}`, data)
  }
  for (const [clip, data] of Object.entries(pack.shadows.actions ?? {})) pack.shadows.actions[clip] = save(`shadow-${clip}`, data)
  for (const clip of ["walk", "idle"]) pack.shadows[clip] = save(`shadow-${clip}`, pack.shadows[clip])
  writeFileSync(`${prefix}/manifest.json`, JSON.stringify(pack, null, 2) + "\n")
  console.log(`Exported ${Object.keys(pack.callings).length} callings × 6 body profiles plus ${Object.keys(pack.greyCallings ?? {}).length} grey-haired callings, with shared shadows: ${prefix}`)
} finally { await browser.close() }
