// Keep ordinary and dark floor sprites in one sampler: terrain already uses
// the WebGL minimum texture-unit budget. Packing does not recolor either asset.
import sharp from "sharp"
const root = new URL("../public/textures/", import.meta.url)
await sharp({ create: { width: 256, height: 128, channels: 4, background: "#000000" } })
  .composite([
    { input: new URL("forest-floor-v1.png", root).pathname, left: 0, top: 0 },
    { input: new URL("dark-forest-floor-v2.png", root).pathname, left: 128, top: 0 },
  ]).png().toFile(new URL("forest-floors-v2.png", root).pathname)
console.log("Packed ordinary and dark forest floor sprites without changing their pixels.")
