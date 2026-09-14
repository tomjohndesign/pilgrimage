// PLACEHOLDER selection barks, rendered with the macOS `say` voices so the
// interaction can be heard and tuned before real voice work is commissioned.
// Apple's voices are not licensed for redistribution, so the output is
// gitignored and never committed; the game falls back to the synthesized
// selection cue whenever a bark file is absent.
// Add a line in assets/recipes/voices.json to create another bark.
import { readFileSync, mkdirSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"

if (process.platform !== "darwin") throw new Error("Placeholder barks need the macOS `say` command.")

const recipe = JSON.parse(readFileSync("assets/recipes/voices.json", "utf8"))
const sampleRate = recipe.sampleRate
if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new Error("Invalid sample rate")

const safeText = (value) => typeof value === "string" && value.length > 0 && value.length <= 120 && !/[`$\\"]/.test(value)
const scratch = join(tmpdir(), `pilgrimage-voice-${process.pid}.aiff`)
let written = 0

for (const [id, voice] of Object.entries(recipe.voices)) {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`Invalid voice id: ${id}`)
  const bodyTypes = Object.entries(voice.prototype)
  if (!bodyTypes.length) throw new Error(`No prototype voices: ${id}`)
  for (const [bodyType, actor] of bodyTypes) {
    if (bodyType !== "Male" && bodyType !== "Female") throw new Error(`Invalid body type: ${id}/${bodyType}`)
    if (!/^[A-Za-z ]{1,40}$/.test(actor.voice)) throw new Error(`Invalid prototype voice: ${id}/${bodyType}`)
    if (!Number.isInteger(actor.rate) || actor.rate < 90 || actor.rate > 300) throw new Error(`Invalid prototype rate: ${id}/${bodyType}`)
    const dir = `public/sounds/voices/${id}/${bodyType.toLowerCase()}`
    mkdirSync(dir, { recursive: true })
    for (const line of [...voice.select, ...voice.repeat]) {
      if (!/^[a-z][a-z0-9-]*$/.test(line.id)) throw new Error(`Invalid line id: ${line.id}`)
      if (!safeText(line.phonetic) || !safeText(line.text) || !safeText(line.gloss)) throw new Error(`Invalid line text: ${line.id}`)
      execFileSync("say", ["-v", actor.voice, "-r", String(actor.rate), "-o", scratch, line.phonetic])
      const path = `${dir}/${line.id}-v${recipe.version}.wav`
      execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${sampleRate}`, "-c", "1", scratch, path])
      written++
      console.log(`Wrote ${path}  ${actor.voice}  "${line.text}"`)
    }
  }
}
rmSync(scratch, { force: true })
console.log(`\n${written} placeholder barks across ${Object.keys(recipe.voices).length} characters. Not for release: replace with recorded or licensed audio.`)
