// Add an action through the shared playground. Published sheets stay immutable.
// Example: node scripts/export-character-action.mjs sittingChair --population v36:v37 --base v36:v37 --monks v46:v48,v47:v49 --jobs v5:v6 --knights v13:v14 --rockets v17:v18 --rocket-monks v46,v47 --url http://localhost:3109
import { chromium } from "playwright"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { freezeAssetUpdates } from "./asset-browser.mjs"
const [clip, ...args] = process.argv.slice(2)
const option = name => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1] }
if (!clip || !/^[a-zA-Z]+$/.test(clip)) throw new Error("Supply an action clip and --FAMILY vOLD:vNEW")
const read = file => JSON.parse(readFileSync(file, "utf8"))
const families = ["base", "monks", "population", "jobs", "knights", "rockets"]
const tasks = families.flatMap(family => (option(family)?.split(",") ?? []).map(pair => {
  if (!/^v\d+:v\d+$/.test(pair)) throw new Error(`Invalid version pair: ${pair}`)
  const [from, to] = pair.split(":")
  const prefix = family === "knights" ? "public/textures/knights" : `public/textures/characters/${family}`
  const source = family === "base" ? `${prefix}/base-person-${from}.json` : `${prefix}/${from}/manifest.json`
  const directory = family === "base" ? prefix : `${prefix}/${to}`
  const target = family === "base" ? `${prefix}/base-person-${to}.json` : `${directory}/manifest.json`
  if (existsSync(target) || (family !== "base" && existsSync(directory))) throw new Error(`Version exists: ${target}`)
  return { family, from, to, directory, target, manifest: read(source) }
}))
if (!tasks.length) throw new Error("No families selected")
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await freezeAssetUpdates(page)
  page.on("pageerror", error => console.error(error.message))
  await page.goto(new URL("/assets?asset=characters", option("url") ?? "http://localhost:3000").href, { timeout: 120_000 })
  await page.waitForFunction(() => window.__personActionBake, undefined, { timeout: 120_000 })
  for (const { family, from, to, directory, target, manifest } of tasks) {
    mkdirSync(directory, { recursive: true })
    const bake = async (name, designs, equipment) => {
      const result = await page.evaluate(({ clip, designs, equipment }) => window.__personActionBake(clip, designs, equipment), { clip, designs, equipment })
      const expected = family === "knights" ? manifest.person : manifest
      if (result.cellSize !== expected.cellSize || JSON.stringify(result.anchor) !== JSON.stringify(expected.anchor)) throw new Error(`Incompatible atlas: ${family}`)
      const images = {}
      // Population families share the first calling's shadow atlas.
      const kinds = (family === "population" || family === "jobs") && name !== Object.keys(manifest.callings)[0]
        ? ["url", "depth"] : ["url", "depth", "shadow"]
      for (const kind of kinds) {
        const path = `${directory}/${name}-${kind === "url" ? "" : `${kind}-`}${clip}.png`
        if (existsSync(path)) throw new Error(`Sheet exists: ${path}`)
        writeFileSync(path, Buffer.from(result[kind].split(",")[1], "base64"))
        images[kind] = `/${path.replace(/^public\//, "")}`
      }
      console.log(`${family} ${to}: ${name} (${result.rows * result.columns} poses)`)
      return { ...result, images }
    }
    if (family === "base" || family === "monks") {
      const result = await bake(family === "base" ? `base-person-${to}` : "person", [manifest.design])
      manifest.images.actions[clip] = result.images
      manifest.clips[clip] = result.frames
      manifest.safePadding = Math.min(manifest.safePadding, result.padding)
      if (family === "base") manifest.version = to
    } else if (family === "population" || family === "jobs") {
      for (const [key, group] of [["callings", manifest.callings], ["greyCallings", manifest.greyCallings ?? {}]]) {
        for (const [name, entry] of Object.entries(group)) {
          const result = await bake(`${name}${key === "greyCallings" ? "-grey" : ""}`, entry.designs)
          entry.actions = { ...entry.actions, [clip]: result.images.url }
          entry.depths = { ...entry.depths, [clip]: result.images.depth }
          manifest.frameCounts = { ...manifest.frameCounts, [clip]: result.columns }
          if (key === "callings" && name === Object.keys(group)[0]) manifest.shadows.actions[clip] = result.images.shadow
        }
      }
    } else if (family === "knights") {
      const result = await bake("knight", manifest.designs, "knight")
      manifest.person.frameCounts[clip] = result.columns
      manifest.person.actionImages = { ...manifest.person.actionImages, [clip]: result.images }
      // Unchanged mounted and squire sheets still live under their original version.
      manifest.sourceVersion ??= from
      manifest.version = to
    } else {
      const monkVersions = option("rocket-monks")?.split(",")
      for (const [i, hair] of ["brown", "grey"].entries()) {
        const version = monkVersions?.[i]
        const design = version ? read(`public/textures/characters/monks/${version}/manifest.json`).design : manifest.designs?.[hair]
        if (!design) throw new Error("Supply --rocket-monks vBROWN,vGREY for packs without saved designs")
        manifest.designs = { ...manifest.designs, [hair]: design }
        const result = await bake(hair, [design], "rocket")
        manifest.frameCounts[clip] = result.columns
        manifest.actionImages ??= {}
        manifest.actionImages[hair] = { ...manifest.actionImages[hair], [clip]: result.images }
      }
      manifest.sourceVersion ??= Number(from.slice(1))
      manifest.version = Number(to.slice(1))
    }
    writeFileSync(target, JSON.stringify(manifest, null, 2) + "\n")
  }
} finally { await browser.close() }
