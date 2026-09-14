import assert from "node:assert/strict"
import { chromium } from "playwright"
import { freezeAssetUpdates } from "./asset-browser.mjs"

// Use the real game and its existing debug handle. For a production check:
// NEXT_PUBLIC_GAME_BENCHMARK=1 npm run build
// npm run start -- --port 3100
// node scripts/test-construction-browser.mjs
const base = process.env.BENCH_URL ?? "http://localhost:3100"
const browser = await chromium.launch({ channel: "chromium", headless: true,
  args: process.platform === "darwin" ? ["--use-angle=metal"] : [] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  page.on("crash", () => errors.push("Browser tab crashed"))
  await freezeAssetUpdates(page)
  await page.goto(`${base}/play?seed=12345&size=128&traffic=1`, { timeout: 120000 })
  await page.getByRole("button", { name: "Build", exact: true }).waitFor({ timeout: 120000 })
  await page.evaluate(() => {
    const game = window.__pilgrimage
    game.setPaused(true)
    game.setAdaptiveQuality(false)
    game.setZoom(18)
  })
  await page.waitForTimeout(3000)

  const results = []
  // This seed has cleared ground on both sides of the founding church.
  for (const [index, x] of [65, 70].entries()) {
    await page.evaluate(() => window.__pilgrimage.selectObject({ kind: "building", id: "hovel" }))
    await page.getByRole("button", { name: "Build monks’ residence", exact: true }).click()
    const point = await page.evaluate(x => window.__pilgrimage.tileScreenPoint(x, 74), x)
    await page.mouse.click(point.x, point.y)
    const id = `settlement-${index}`
    await page.waitForFunction(id => window.__pilgrimage.map.buildings.some(b => b.id === id), id)

    // Advance the live worker-owned progress, retaining the ordinary React
    // publication, geometry, batching and light-registration completion path.
    for (const fraction of [.4, .75]) {
      await page.evaluate(({ id, fraction }) => {
        const construction = window.__pilgrimage.map.buildings.find(b => b.id === id).construction
        construction.work = construction.required * fraction
      }, { id, fraction })
      await page.waitForTimeout(600)
    }
    await page.waitForTimeout(1000)
    const before = await page.evaluate(() => ({ ...window.__pilgrimage.renderInfo(), ...window.__pilgrimage.distantEffects() }))
    await page.evaluate(id => {
      const construction = window.__pilgrimage.map.buildings.find(b => b.id === id).construction
      construction.work = construction.required
    }, id)
    await page.waitForFunction(count => window.__pilgrimage.distantEffects().fires === count, index + 1)
    await page.waitForTimeout(1000)
    const after = await page.evaluate(() => ({ ...window.__pilgrimage.renderInfo(), ...window.__pilgrimage.distantEffects() }))
    assert.equal(after.pointLights, before.pointLights, "completing a hearth must reuse the existing light slots")
    // The first fire/smoke can introduce their own materials; completing a
    // building must not compile a new lighting variant of every scene shader.
    assert.ok(after.programs <= before.programs + 3, `completion compiled ${after.programs - before.programs} programs`)
    results.push({ id, programsBefore: before.programs, programsAfter: after.programs, lightSlots: after.pointLights })
  }
  await page.evaluate(() => window.__pilgrimage.setZoom(72))
  await page.waitForFunction(() => window.__pilgrimage.distantEffects().pointLights === 0)
  await page.evaluate(() => window.__pilgrimage.setZoom(18))
  await page.waitForFunction(() => window.__pilgrimage.distantEffects().fires === 2)
  assert.deepEqual(errors, [])
  console.log("Construction completion and light-pool checks passed", results)
} finally {
  await browser.close()
}
