import sharp from "sharp"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"

const recipe = JSON.parse(readFileSync("assets/recipes/characters.json", "utf8"))
const hashes = new Set()
for (const { id } of recipe.characters) {
  const path = `public/textures/characters/${id}-v1`
  const meta = JSON.parse(readFileSync(`${path}.json`, "utf8"))
  const { data, info } = await sharp(`${path}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.width !== 256 || info.height !== 512 || meta.frames.length !== 32) throw new Error(`Invalid atlas: ${id}`)
  for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
    let opaque = 0
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const alpha = data[((row * 64 + y) * 256 + col * 64 + x) * 4 + 3]
      if (alpha > 127) {
        opaque++
        if (x < 4 || x > 59 || y < 9 || y > 58) throw new Error(`Unregistered or clipped frame: ${id} row ${row} col ${col}`)
      }
    }
    if (opaque < 100) throw new Error(`Empty frame: ${id} row ${row} col ${col}`)
  }
  const wav = readFileSync(`public/sounds/characters/${id}-select-v1.wav`)
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE" || wav.readUInt32LE(40) !== wav.length - 44) throw new Error(`Invalid WAV: ${id}`)
  let peak = 0
  for (let n = 44; n < wav.length; n += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(n)))
  if (peak < 1000 || peak > 30000) throw new Error(`Silent or clipping sound: ${id}`)
  hashes.add(createHash("sha256").update(wav).digest("hex"))
  console.log(`${id}: 32 registered frames, transparent gutters, valid selection WAV`)
}
if (hashes.size !== recipe.characters.length) throw new Error("Selection sounds must be distinct.")
