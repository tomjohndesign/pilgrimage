/**
 * Export the approved manuscript branding at its delivery sizes.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBI-1
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/E7H-1
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBK-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBN-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBQ-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBT-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBW-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBZ-0
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

process.chdir(fileURLToPath(new URL('..', import.meta.url)))
await mkdir('public/brand', { recursive: true })
const icon = 'assets/brand/icon.png'
const png = { palette: true, quality: 100, effort: 10 }
for (const [path, size] of [
  ['public/apple-icon.png', 180],
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
]) {
  await sharp(icon).resize(size, size).png(png).toFile(path)
}
await sharp('assets/brand/icon-maskable.png').resize(512, 512).png(png)
  .toFile('public/icon-maskable-512.png')

// PNG-backed SVG retains the painted texture without shipping the large design source.
const svgIcon = await sharp(icon).resize(256, 256).png(png).toBuffer()
await writeFile('public/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,${svgIcon.toString('base64')}"/></svg>\n`)

// Multi-resolution ICO with conventional BGRA bitmaps and opaque AND masks.
const sizes = [16, 32, 48]
const entries = []
let offset = 6 + 16 * sizes.length
for (const size of sizes) {
  const rgba = await sharp(icon).resize(size, size).ensureAlpha().raw().toBuffer()
  const dib = Buffer.alloc(40 + size * size * 4 + Math.ceil(size / 32) * 4 * size)
  dib.writeUInt32LE(40, 0)
  dib.writeInt32LE(size, 4)
  dib.writeInt32LE(size * 2, 8)
  dib.writeUInt16LE(1, 12)
  dib.writeUInt16LE(32, 14)
  dib.writeUInt32LE(size * size * 4, 20)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const src = (y * size + x) * 4
    const dest = 40 + ((size - y - 1) * size + x) * 4
    dib[dest] = rgba[src + 2]
    dib[dest + 1] = rgba[src + 1]
    dib[dest + 2] = rgba[src]
    dib[dest + 3] = rgba[src + 3]
  }
  const entry = Buffer.alloc(16)
  entry[0] = size
  entry[1] = size
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(dib.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += dib.length
  entries.push({ entry, dib })
}
const header = Buffer.from([0, 0, 1, 0, sizes.length, 0])
await writeFile('public/favicon.ico', Buffer.concat([header, ...entries.map(e => e.entry), ...entries.map(e => e.dib)]))

// The approved glyphs remain a separate layer: resizing the frame never redraws the logo.
const wordmark = await sharp('assets/brand/wordmark.png').resize(1200, 400).png().toBuffer()
await sharp('assets/brand/og-background.png').resize(1200, 630, { fit: 'fill' })
  .composite([{ input: wordmark, left: 0, top: 105 }]).png(png)
  .toFile('app/opengraph-image.png')
await writeFile('public/brand/pilgrimage-og.png', await readFile('app/opengraph-image.png'))

// The wide banner preserves the exact approved composition. The cover uses a
// matching frame adapted to its proportions, with the same untouched glyphs.
await sharp('assets/brand/banner.png').resize(1500, 500).png(png)
  .toFile('public/brand/pilgrimage-banner-wide.png')
const coverWordmark = await sharp('assets/brand/wordmark.png').resize(1640).png().toBuffer()
await sharp('assets/brand/cover-background.png').resize(1640, 624, { fit: 'fill' })
  .composite([{ input: coverWordmark, left: 0, top: 20 }]).png(png)
  .toFile('public/brand/pilgrimage-banner-cover.png')
await sharp('assets/brand/settlement-scene.png').resize(1640, 624, { fit: 'fill' })
  .png(png).toFile('public/brand/pilgrimage-social-scene.png')
await sharp('assets/brand/twitter-scene.png').resize(1500, 500, { fit: 'fill' })
  .png(png).toFile('public/brand/pilgrimage-twitter-cover.png')
await sharp('assets/brand/icon-maskable.png').resize(400, 400)
  .png(png).toFile('public/brand/pilgrimage-profile.png')
console.log('Exported app icons, favicon, OG image, social banners, scenes, and profile picture.')
