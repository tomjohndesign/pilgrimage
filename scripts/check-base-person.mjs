import sharp from "sharp"
import { readFileSync } from "node:fs"
const monk = process.argv.includes("--monk")
const version = process.argv.find(arg => /^v\d+$/.test(arg)) ?? (monk ? "v24" : "v28")
if (!/^v\d+$/.test(version)) throw new Error("Expected a version such as v1")
const prefix = monk ? `public/textures/characters/monks/${version}/manifest` : `public/textures/characters/base/base-person-${version}`
const metadata = JSON.parse(readFileSync(`${prefix}.json`, "utf8"))
const recipe = JSON.parse(readFileSync("assets/recipes/base-person.json", "utf8"))
const legacyPalette = ["#30251e", "#503b2b", "#785637", "#9c724e", "#c39368", "#e3b78a", "#5e625c", "#82867a", "#b0b0a0", "#c9c7b4", "#44452e", "#606142"]
const allowed = new Set((metadata.renderPalette ?? legacyPalette).map((hex) => hex.toLowerCase()))
const size = metadata.cellSize
const nominalHeight = metadata.nominalHeightPixels ?? 20 * size / 32
let minHeight = Infinity, maxHeight = 0
for (const [clip, url] of Object.entries({ walk: metadata.images.walk, idle: metadata.images.idle, ...Object.fromEntries(Object.entries(metadata.images.actions ?? {}).map(([clip, entry]) => [clip, entry.url])) })) {
  const columns = metadata.clips[clip].length / metadata.directions.length
  const { data, info } = await sharp(`public${url}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.width !== columns * size || info.height !== 8 * size) throw new Error(`Wrong ${clip} dimensions`)
  if (metadata.clips[clip].length !== columns * 8) throw new Error(`Missing ${clip} registrations`)
  for (let row = 0; row < 8; row++) for (let frame = 0; frame < columns; frame++) {
    let top = size, bottom = -1, count = 0
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const offset = ((row * size + y) * info.width + frame * size + x) * 4
      const alpha = data[offset + 3]
      if (alpha !== 0 && alpha !== 255) throw new Error("Anti-aliased pixels in native sprite")
      if (!alpha) continue
      if (!allowed.has(`#${data.subarray(offset, offset + 3).toString("hex")}`)) throw new Error("Pixel outside shared palette")
      const margin = metadata.safePadding === undefined ? 1 : 4
      if (Math.min(x, y, size - 1 - x, size - 1 - y) < margin) throw new Error("Frame violates safe padding")
      top = Math.min(top, y); bottom = Math.max(bottom, y); count++
    }
    const height = bottom - top + 1
    if (count < 30 || ((clip === "idle" || clip === "walk") && (height < nominalHeight * 0.85 || height > nominalHeight * 1.1))) throw new Error(`Unexpected size: ${clip} ${row}/${frame}, ${height}px`)
    minHeight = Math.min(minHeight, height); maxHeight = Math.max(maxHeight, height)
    const registration = metadata.clips[clip][row * columns + frame]
    if (registration.direction !== recipe.directions[row] || registration.frame !== frame) throw new Error("Frame order mismatch")
    for (const socket of Object.values(registration.sockets)) {
      if (![socket.x, socket.y, socket.depth].every(Number.isFinite) || socket.x < 0 || socket.x > size || socket.y < 0 || socket.y > size) throw new Error("Invalid socket coordinates")
    }
    const first = metadata.clips[clip][row * columns].sockets.head
    if ((clip === "idle" || clip === "walk") && (Math.abs(first.x - registration.sockets.head.x) > (Number(String(metadata.version).replace(/^v/, "")) >= 15 ? 0.5 : 1e-8) || Math.abs(first.y - registration.sockets.head.y) > (Number(String(metadata.version).replace(/^v/, "")) >= 14 ? 2 : 1e-8))) throw new Error("Head registration exceeds the supported walk bob and turn")
  }
}
console.log(`${monk ? "Monk" : "Base"} ${version}: ${Object.values(metadata.clips).reduce((sum, frames) => sum + frames.length, 0)} frames, ${minHeight}–${maxHeight}px figures, fixed palette, transparent margins and registered attachments.`)

if (metadata.images.shadowWalk) for (const [clip, url] of Object.entries({ walk: metadata.images.shadowWalk, idle: metadata.images.shadowIdle, ...Object.fromEntries(Object.entries(metadata.images.actions ?? {}).map(([clip, entry]) => [clip, entry.shadow])) })) {
  const { data, info } = await sharp(`public${url}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.width !== (metadata.clips[clip].length / metadata.directions.length) * size || info.height !== 8 * size) throw new Error("Wrong shadow dimensions")
  let pixels = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3]
    if (alpha > 80) throw new Error("Cast shadow is too opaque")
    if (alpha > 0) {
      pixels++
      if (Math.min(x % size, y % size, size - 1 - x % size, size - 1 - y % size) < 4) throw new Error("Shadow crosses frame padding")
    }
  }
  if (!pixels) throw new Error("Missing cast shadow")
}
