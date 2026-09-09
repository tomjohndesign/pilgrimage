// Render the church's shared geometry through the existing /play export handle.
import { chromium } from "playwright"
import { mkdir, writeFile } from "node:fs/promises"
import sharp from "sharp"
import { freezeAssetUpdates } from "./asset-browser.mjs"
const origin = process.argv[2] ?? "http://localhost:3000"
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--use-angle=metal"] })
try {
  const page = await browser.newPage()
  await freezeAssetUpdates(page)
  await page.goto(`${origin}/play?seed=12345&size=64&traffic=0`, { timeout: 180000 })
  await page.waitForFunction(() => window.__pilgrimage?.bakeLoadingChurch, null, { timeout: 180000 })
  const result = await page.evaluate(() => window.__pilgrimage.bakeLoadingChurch())
  const directory = "public/textures/ui/loading-church-v1"
  await mkdir(directory, { recursive: true })
  for (const [view, image] of result.images.entries()) {
    const bytes = await sharp(Buffer.from(image.split(",")[1], "base64")).webp({ lossless: true }).toBuffer()
    await writeFile(`${directory}/${view}.webp`, bytes)
    console.log(`Church view ${view}: ${bytes.length} bytes`)
  }
} finally { await browser.close() }
