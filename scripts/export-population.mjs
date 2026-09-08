import { chromium } from "playwright"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
const args = process.argv.slice(2), version = args.find(arg => /^v\d+$/.test(arg))
const urlIndex = args.indexOf("--url"), origin = urlIndex < 0 ? "http://localhost:55010" : args[urlIndex + 1]
if (!version) throw new Error("Usage: npm run assets:population -- v1 [--jobs] [--url http://localhost:55010]")
const jobs = args.includes("--jobs")
const onlyIndex = args.indexOf("--only"), fromIndex = args.indexOf("--from")
const only = onlyIndex < 0 ? undefined : args[onlyIndex + 1]
const from = fromIndex < 0 ? undefined : args[fromIndex + 1]
if ((only || from) && (jobs || !only || !/^v\d+$/.test(from ?? ""))) throw new Error("Partial exports require --only CALLING --from vPREVIOUS.")
const previous = from ? JSON.parse(readFileSync(`public/textures/characters/population/${from}/manifest.json`, "utf8")) : null
const prefix = `public/textures/characters/${jobs ? "jobs" : "population"}/${version}`
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
  await page.waitForFunction(jobs => jobs ? window.__jobBake : window.__bakePersonPopulation, jobs, { timeout: 120_000 })
  let lastProgress = -1
  await page.exposeFunction("__reportPopulationProgress", progress => {
    const percent = Math.floor(progress * 100)
    if (percent >= lastProgress + 10 || percent === 100) { console.log(`Baking population: ${percent}%`); lastProgress = percent }
  })
  exporting = true
  const pack = await page.evaluate(({ jobs, only }) => jobs ? window.__jobBake(window.__reportPopulationProgress) : window.__bakePersonPopulation(window.__reportPopulationProgress, only), { jobs, only })
  if (only && !pack.callings[only]) throw new Error(`Unknown calling: ${only}`)
  if (previous) for (const key of ["templateVersion", "cellSize", "anchor", "rows", "frameCounts", "depthEncoding", "walkStrides", "reservedTones", "strideRatios"]) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(pack[key])) throw new Error(`Cannot reuse population with different ${key}; export the full pack.`)
  }
  mkdirSync(prefix, { recursive: true })
  const save = (name, data) => { writeFileSync(`${prefix}/${name}.png`, Buffer.from(data.split(",")[1], "base64")); return `/${prefix.replace(/^public\//, "")}/${name}.png` }
  for (const [type, entry] of Object.entries(pack.callings)) for (const clip of ["walk", "idle"]) entry[clip] = save(`${type}-${clip}`, entry[clip])
  for (const [type, entry] of Object.entries(pack.callings)) for (const [clip, data] of Object.entries(entry.actions ?? {})) entry.actions[clip] = save(`${type}-${clip}`, data)
  for (const [type, entry] of Object.entries(pack.callings)) for (const [clip, data] of Object.entries(entry.depths)) entry.depths[clip] = save(`${type}-depth-${clip}`, data)
  for (const [type, entry] of Object.entries(pack.greyCallings ?? {})) {
    for (const clip of ["walk", "idle"]) entry[clip] = save(`${type}-grey-${clip}`, entry[clip])
    for (const [clip, data] of Object.entries(entry.actions ?? {})) entry.actions[clip] = save(`${type}-grey-${clip}`, data)
    for (const [clip, data] of Object.entries(entry.depths)) entry.depths[clip] = save(`${type}-grey-depth-${clip}`, data)
  }
  if (previous) {
    pack.callings = { ...previous.callings, ...pack.callings }
    pack.greyCallings = { ...previous.greyCallings, ...pack.greyCallings }
    pack.shadows = previous.shadows
  }
  if (!previous) for (const [clip, data] of Object.entries(pack.shadows.actions ?? {})) pack.shadows.actions[clip] = save(`shadow-${clip}`, data)
  if (!previous) for (const clip of ["walk", "idle"]) pack.shadows[clip] = save(`shadow-${clip}`, pack.shadows[clip])
  writeFileSync(`${prefix}/manifest.json`, JSON.stringify(pack, null, 2) + "\n")
  console.log(`Exported ${Object.keys(pack.callings).length} callings × 6 body profiles plus ${Object.keys(pack.greyCallings ?? {}).length} grey-haired callings, with shared shadows: ${prefix}`)
} finally { await browser.close() }
