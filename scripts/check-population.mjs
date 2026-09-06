import sharp from "sharp"
import { readFileSync } from "node:fs"
const version = process.argv[2] ?? "v7"
if (!/^v\d+$/.test(version)) throw new Error("Expected a population version such as v1")
const pack = JSON.parse(readFileSync(`public/textures/characters/population/${version}/manifest.json`, "utf8"))
const size = pack.cellSize
let frames = 0
for (const [type, entry] of Object.entries(pack.callings)) {
  if (Number(version.slice(1)) >= 2) for (const clip of ["sleeping", "sitting", "praying", "woodcutting", "gathering", "carrying"]) {
    if (!entry.actions?.[clip] || !pack.shadows.actions?.[clip]) throw new Error(`Missing action: ${type}/${clip}`)
  }
  if (entry.designs.length !== 6) throw new Error(`Missing profiles: ${type}`)
  for (const [clip, url] of Object.entries({ walk: entry.walk, idle: entry.idle, ...entry.actions })) {
    const { data, info } = await sharp(`public${url}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const columns = pack.frameCounts?.[clip] ?? pack.actionFrames?.[clip] ?? (clip === "idle" ? 1 : 8)
    if (info.width !== size * columns || info.height !== pack.rows * size) throw new Error(`Wrong dimensions: ${type}/${clip}`)
    for (let row = 0; row < pack.rows; row++) for (let frame = 0; frame < columns; frame++) {
      let solid = 0
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const alpha = data[((row * size + y) * info.width + frame * size + x) * 4 + 3]
        if (alpha !== 0 && alpha !== 255) throw new Error(`Non-binary body alpha: ${type}/${clip}`)
        if (alpha) {
          if (Math.min(x, y, size - 1 - x, size - 1 - y) < 4) throw new Error(`Clipped frame: ${type}/${clip}/${row}/${frame}`)
          solid++
        }
      }
      if (solid < 30) throw new Error(`Empty body frame: ${type}/${clip}`)
      frames++
    }
  }
}
for (const [clip, url] of Object.entries({ walk: pack.shadows.walk, idle: pack.shadows.idle, ...pack.shadows.actions })) {
  const { data, info } = await sharp(`public${url}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.width !== (pack.frameCounts?.[clip] ?? pack.actionFrames?.[clip] ?? (clip === "idle" ? 1 : 8)) * size || info.height !== pack.rows * size) throw new Error("Shadow dimensions do not match bodies")
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3]
    if (alpha > 80) throw new Error("Shadow is too dark")
    if (alpha && Math.min(x % size, y % size, size - 1 - x % size, size - 1 - y % size) < 4) throw new Error("Shadow crosses frame padding")
  }
}
console.log(`Population ${version}: ${frames} body frames across 7 callings × 6 profiles; safe margins and shared shadows verified.`)
