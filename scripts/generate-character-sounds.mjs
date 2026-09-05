// Deterministic, original synthesized SFX. No credentials or paid service needed.
// Add a recipe in assets/recipes/sounds.json to create another sound.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { makeRng } from "./texture-lib.mjs"

const recipe = JSON.parse(readFileSync("assets/recipes/sounds.json", "utf8"))
const sampleRate = recipe.sampleRate
if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new Error("Invalid sample rate")
mkdirSync("public/sounds/characters", { recursive: true })
for (const [id, sound] of Object.entries(recipe.sounds)) {
  if (!/^[a-z][a-z0-9-]*$/.test(id) || !Array.isArray(sound.events) || !sound.events.length) throw new Error(`Invalid recipe: ${id}`)
  for (const event of sound.events) {
    if (![event.at, event.frequency, event.duration, event.gain].every(Number.isFinite) ||
      event.at < 0 || event.at > 10 || event.duration <= 0 || event.duration > 5 ||
      event.frequency <= 0 || event.frequency > sampleRate / 2 || event.gain < 0 || event.gain > 1 ||
      !["tone", "pluck", "wood", "noise"].includes(event.kind) ||
      !Array.isArray(event.overtones) || !event.overtones.length || !event.overtones.every((n) => Number.isFinite(n) && n > 0 && n < 20)) {
      throw new Error(`Invalid sound event: ${id}`)
    }
  }
  const seconds = Math.max(...sound.events.map((e) => e.at + e.duration)) + 0.03
  const samples = new Float64Array(Math.ceil(seconds * sampleRate))
  const rng = makeRng(sound.seed)
  for (const event of sound.events) {
    let filteredNoise = 0
    for (let n = 0; n < Math.ceil(event.duration * sampleRate); n++) {
      const t = n / sampleRate
      const attack = Math.min(1, t / 0.005)
      const release = Math.min(1, (event.duration - t) / 0.025)
      const decay = Math.exp(-t / (event.duration / 5))
      const phase = 2 * Math.PI * event.frequency * t
      let value = 0
      if (event.kind === "noise") {
        filteredNoise += (rng() * 2 - 1 - filteredNoise) * Math.min(0.8, event.frequency / 4000)
        value = filteredNoise * 4
      } else if (event.kind === "wood") {
        value = Math.sin(phase) * 0.7 + Math.sin(phase * 2.76) * 0.22 + (rng() * 2 - 1) * Math.exp(-t * 100) * 0.2
      } else {
        event.overtones.forEach((ratio, i) => {
          if (event.frequency * ratio < sampleRate / 2) value += Math.sin(phase * ratio) * Math.exp(-t * i * (event.kind === "pluck" ? 12 : 5)) / ((i + 1) * 1.5)
        })
      }
      samples[Math.floor(event.at * sampleRate) + n] += value * event.gain * attack * release * decay
    }
  }
  const peak = samples.reduce((p, s) => Math.max(p, Math.abs(s)), 0)
  const normalization = peak > 0 ? 0.72 / peak : 1
  const wav = Buffer.alloc(44 + samples.length * 2)
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36)
  wav.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((sample, i) => wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample * normalization)) * 32767), 44 + i * 2))
  const path = `public/sounds/characters/${id}-select-v${recipe.version}.wav`
  writeFileSync(path, wav)
  console.log(`Wrote ${path} (${seconds.toFixed(2)}s)`)
}
