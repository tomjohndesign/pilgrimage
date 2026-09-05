// Save a versioned terrain/material texture after generating it with imagegen.
import sharp from "sharp"
import { mkdirSync, existsSync, copyFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
const [id, input, version = "v1"] = process.argv.slice(2)
if (!id || !/^[a-z][a-z0-9-]*$/.test(id) || !input || !/^v\d+$/.test(version)) throw new Error("Usage: npm run assets:import-texture -- <id> <source.png> [v2]")
const output = `public/textures/${id}-${version}.png`
const source = `public/textures/sources/${id}-${version}.png`
if (existsSync(output) || existsSync(source)) throw new Error("This version already exists. Choose a new version.")
const info = await sharp(input).metadata()
if (info.format !== "png" || !info.width || info.width !== info.height) throw new Error("Expected a square PNG texture.")
mkdirSync("public/textures/sources", { recursive: true })
if (resolve(input) !== resolve(source)) copyFileSync(input, source)
await sharp(input).resize(128, 128, { kernel: "nearest" }).png().toFile(output)
writeFileSync(output.replace(/\.png$/, ".json"), JSON.stringify({ id, version, source, width: 128, height: 128, generator: "Built-in imagegen", recipe: `assets/recipes/textures.json#${id}` }, null, 2) + "\n")
console.log(`Imported ${output}. Inspect a repeated tile before registering it in lib/game/render/textures.ts and its terrain material.`)
