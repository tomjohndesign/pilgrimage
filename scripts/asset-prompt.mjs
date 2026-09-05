import { readFileSync } from "node:fs"
const [kind, id] = process.argv.slice(2)
let prompt
if (kind === "character") {
  prompt = JSON.parse(readFileSync("assets/recipes/characters.json", "utf8")).characters.find((c) => c.id === id)?.prompt
} else if (kind === "texture") {
  prompt = JSON.parse(readFileSync("assets/recipes/textures.json", "utf8"))[id]?.prompt
}
if (!prompt) throw new Error("Usage: npm run assets:prompt -- character <id> OR texture <recipe id>")
console.log(prompt)
