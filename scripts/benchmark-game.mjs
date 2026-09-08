import { mkdir, writeFile } from "node:fs/promises"
import { cpus, totalmem, loadavg } from "node:os"
import { chromium } from "playwright"
import assert from "node:assert/strict"
import { freezeAssetUpdates } from "./asset-browser.mjs"

// Exercise the actual /play scene with the repository's Playwright installation.
const base = process.env.BENCH_URL ?? "http://localhost:3100"
const scenario = process.env.BENCH_SCENARIO ?? "forest"
assert.ok(["forest", "city"].includes(scenario), "BENCH_SCENARIO must be forest or city")
const target = process.env.BENCH_TARGET ?? "centre"
assert.ok(["centre", "water"].includes(target), "BENCH_TARGET must be centre or water")
const mobile = process.env.BENCH_MOBILE === "1"
const count = Number(process.env.BENCH_COUNT ?? 3840)
assert.ok(Number.isInteger(count / 16) && count > 0, "BENCH_COUNT must be a positive multiple of 16 on the 512-square map")
const trees = process.env.BENCH_TREES ?? "sprites"
assert.ok(["sprites", "procedural"].includes(trees), "BENCH_TREES must be sprites or procedural")
const seconds = Number(process.env.BENCH_SECONDS ?? 20)
const zooms = (process.env.BENCH_ZOOMS ?? process.env.BENCH_ZOOM ?? "36").split(",").map(Number)
const zoom = zooms[0]
const motion = process.env.BENCH_MOTION === "1"
const rotate = process.env.BENCH_ROTATE !== "0"
const zoomMotion = process.env.BENCH_ZOOM_MOTION === "1"
const inputMotion = process.env.BENCH_INPUT === "1"
const speeds = (process.env.BENCH_SPEEDS ?? process.env.BENCH_SPEED ?? "1").split(",").map(Number)
const output = process.env.BENCH_OUTPUT ?? ".context/performance"
await mkdir(output, { recursive: true })
// Use the full browser and hardware ANGLE; headless shell defaults to software
// SwiftShader on macOS, which is not representative of the playable game.
const browser = await chromium.launch({ channel: "chromium", headless: process.env.BENCH_HEADED !== "1", args: [...(process.platform === "darwin" ? ["--use-angle=metal"] : []), ...(process.env.BENCH_DEBUG_PORT ? [`--remote-debugging-port=${process.env.BENCH_DEBUG_PORT}`] : [])] })
try {
  const page = await browser.newPage({ viewport: mobile ? { width: 412, height: 915 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })
  await page.addInitScript(() => performance.setResourceTimingBufferSize(10000))
  await freezeAssetUpdates(page)
  await page.route("**/_vercel/insights/script.js", route => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }))
  const errors = []
  page.on("pageerror", error => { errors.push(error.message); console.error(error.message) })
  page.on("response", response => { if (response.status() >= 400) console.log(`HTTP ${response.status()}: ${response.url()}`) })
  const browserWarnings = []
  page.on("console", message => {
    if (message.type() !== "error") return
    if (message.text().startsWith("Permissions policy violation:")) browserWarnings.push(message.text())
    else errors.push(message.text())
  })
  const session = await page.context().newCDPSession(page)
  await session.send("Performance.enable")
  console.log(`Loading 512 × 512 with ${count} travelers and ${trees} trees`)
  await page.goto(`${base}/play?seed=12345&size=512&traffic=${count / 16}&trees=${trees}&benchmark=${scenario}`, { timeout: 180000 })
  await page.waitForFunction(count => window.__pilgrimage?.sim().length === count, count, { timeout: 180000 })
  // Simulation is ready before Suspense has mounted the sprite assets.
  await page.evaluate(({ zoom, target }) => {
    const game = window.__pilgrimage, road = game.map.road
    game.setPaused?.(true)
    let point = game.benchmarkTarget ?? road[Math.floor(road.length / 2)]
    if (target === "water") {
      const wet = game.map.tiles.flatMap((tile, i) => tile === "water" ? [{ x: i % game.map.width, z: Math.floor(i / game.map.width) }] : [])
      wet.sort((a, b) => Math.hypot(a.x - point.x, a.z - point.z) - Math.hypot(b.x - point.x, b.z - point.z))
      if (!wet.length) throw new Error("Water benchmark requires visible water")
      point = wet[0]
    }
    game.setTarget(point.x - game.map.width / 2 + .5, point.z - game.map.depth / 2 + .5)
    game.setZoom(zoom)
  }, { zoom, target })
  await page.waitForFunction(trees => {
    const game = window.__pilgrimage, scene = game.sceneStats?.()
    if (scene?.treeRenderer && scene.treeRenderer !== trees) return false
    return scene?.units ? scene.loadedUnits === scene.units && (scene.pendingUnits ?? ((scene.requestedUnits ?? scene.units) - scene.units)) === 0 : game.travelerSprites().length >= game.sim().length * .98
  }, trees, { timeout: 180000, polling: 1000 }).catch(async error => {
    const state = await page.evaluate(() => ({ scene: window.__pilgrimage?.sceneStats?.(), camera: window.__pilgrimage?.camera() }))
    await writeFile(`${output}/startup-timeout.json`, JSON.stringify(state, null, 2))
    throw error
  })
  await page.evaluate(speed => {
    window.__pilgrimage.setSpeed?.(speed)
    window.__pilgrimage.setPaused?.(false)
  }, Number(process.env.BENCH_WARMUP_SPEED ?? speeds[0]))
  console.log("Warming scene")
  await page.waitForTimeout(Number(process.env.BENCH_WARMUP ?? 15000))
  if (process.env.BENCH_GPU === "1") await page.evaluate(() => {
    const gl = document.querySelector("canvas[data-engine]")?.getContext("webgl2")
    const ext = gl?.getExtension("EXT_disjoint_timer_query_webgl2")
    const probe = window.__benchmarkGPU = { supported: !!ext, active: false, samples: [], disjoint: 0 }
    if (!ext) return
    let current = null
    const pending = []
    probe.reset = () => pending.splice(0).forEach(query => gl.deleteQuery(query))
    const poll = () => {
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        probe.disjoint++; pending.splice(0).forEach(query => gl.deleteQuery(query)); return
      }
      while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const query = pending.shift()
        if (probe.active) probe.samples.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6)
        gl.deleteQuery(query)
      }
    }
    // Time actual draw commands without waiting for the GPU. One query spans
    // each synchronous multipass render; microtasks end it before browser idle.
    // This optional instrumentation adds CPU overhead, so keep ordinary FPS
    // comparisons in runs without BENCH_GPU.
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const original = gl[name]
      gl[name] = function () {
        if (!current && probe.active) {
          poll()
          if (pending.length < 8 && !gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
            current = gl.createQuery()
            if (current) {
              gl.beginQuery(ext.TIME_ELAPSED_EXT, current)
              queueMicrotask(() => {
                gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(current); current = null
              })
            }
          }
        }
        return original.apply(this, arguments)
      }
    }
  })
  for (const viewSize of zooms) {
    if (viewSize !== zoom) {
      await page.evaluate(viewSize => { window.__pilgrimage.setPaused(true); window.__pilgrimage.setZoom(viewSize) }, viewSize)
      await page.waitForTimeout(3000)
      await page.waitForFunction(() => {
        const s = window.__pilgrimage.sceneStats()
        return s.loadedUnits === s.units && s.pendingUnits === 0
      }, undefined, { timeout: 180000 })
      await page.evaluate(() => window.__pilgrimage.setPaused(false))
      await page.waitForTimeout(5000)
    }
  for (const speed of speeds) {
    await page.evaluate(speed => window.__pilgrimage.setSpeed?.(speed), speed)
    const tag = `${speeds.length === 1 ? count : `${count}-${speed}x`}${zooms.length > 1 ? `-zoom${viewSize}` : ""}`
    const info = await page.evaluate(() => {
      const game = window.__pilgrimage, gl = document.querySelector("canvas[data-engine]")?.getContext("webgl2")
      const ext = gl?.getExtension("WEBGL_debug_renderer_info")
      return { inventory: game.inventory?.(), terrainAssets: performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname).filter(path => /\/textures\/(grass|water|environment\/)/.test(path)), city: game.cityStats?.(), map: [game.map.width, game.map.depth], count: game.sim().length, playback: game.playback?.(), sceneryDetail: game.sceneryDetail?.(), camera: game.camera(), render: game.renderInfo(), geometry: game.geometryStats?.(), scene: game.sceneStats?.(), gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null }
    })
    if (process.env.BENCH_TERRAIN === "sprites") {
      assert.ok(info.terrainAssets.includes("/textures/grass-sprites.png"), "new grass atlas must be loaded")
      assert.ok(info.terrainAssets.includes("/textures/water.png"), "new water sprite must be loaded")
    }
    console.log(JSON.stringify(info))
    const metricsBefore = await session.send("Performance.getMetrics")
    const populationBefore = await page.evaluate(() => window.__pilgrimage.sim().map(({ id, x, z }) => ({ id, x, z })))
    const gameTimeBefore = await page.evaluate(() => ({ time: window.__pilgrimage.time(), now: performance.now() }))
    console.log(`Measuring ${seconds}s at ${speed}×`)
    if (process.env.BENCH_GPU === "1") await page.evaluate(() => {
      const probe = window.__benchmarkGPU
      probe.reset?.(); probe.samples.length = 0; probe.disjoint = 0; probe.active = true
    })
    if (inputMotion && motion) { await page.mouse.move(700, 400); await page.mouse.down() }
    if (process.env.BENCH_PROFILE_MOTION === "1") { await session.send("Profiler.enable"); await session.send("Profiler.start") }
    if (process.env.BENCH_ALLOCATIONS === "1") await session.send("HeapProfiler.startSampling", { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
    await page.evaluate(() => window.__pilgrimage.profileFrames?.(true))
    const measured = await page.evaluate(({ seconds, motion, rotate, zoomMotion, inputMotion, motionTrace }) => new Promise(resolve => {
      const samples = [], motionSamples = [], longTasks = [], detailTransitions = [], sceneryDetails = new Set();
      let previousDetail, detailChangesDuringZoom = 0
      const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))))
      observer.observe({ type: "longtask", buffered: false }); let start, previous, misaligned = 0, missingFigures = 0
      const game = window.__pilgrimage, pose = game.camera()
      const canvas = document.querySelector("canvas[data-engine]")
      const x = pose.targetX, z = pose.targetZ
      function frame(now) {
        start ??= now
        if (previous !== undefined) samples.push(now - previous)
        previous = now
        const detail = game.sceneryDetailStatus?.()
        if (detail) {
          if (previousDetail !== undefined && detail.current !== previousDetail) {
            detailTransitions.push({ now, ...detail })
            if (detail.zooming) detailChangesDuringZoom++
          }
          previousDetail = detail.current
        }
        if (motionTrace) motionSamples.push({ now, people: game.motionSamples?.() })
        if (samples.length % 30 === 0) {
          sceneryDetails.add(game.sceneryDetail?.())
          if (game.cameraAlignment?.() > 1e-6) misaligned++
          missingFigures = Math.max(missingFigures, game.sceneStats?.().missingVisibleUnits ?? 0)
        }
        if (motion) {
          const phase = (now - start) / (seconds * 1000)
          if (inputMotion) canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, pointerType: "mouse", buttons: 1,
            clientX: 700 + Math.sin(phase * Math.PI * 2) * 200, clientY: 400 + (1 - Math.cos(phase * Math.PI * 2)) * 100 }))
          else game.setTarget(x + Math.sin(phase * Math.PI * 2) * 35, z + (1 - Math.cos(phase * Math.PI * 2)) * 20)
          if (rotate) game.setView(Math.floor(phase * 8))
        }
        if (zoomMotion) {
          const phase = (now - start) / (seconds * 1000)
          const next = 24 + (140 - 24) * (.5 - .5 * Math.cos(phase * Math.PI * 4))
          if (inputMotion) canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 700, clientY: 400, deltaY: Math.log(next / game.camera().viewSize) / .0015 }))
          else game.setZoom(next)
        }
        if (now - start < seconds * 1000) requestAnimationFrame(frame)
        else { observer.disconnect(); resolve({ motionSamples, longTasks, frames: samples, misaligned, missingFigures, sceneryDetails: [...sceneryDetails], detailTransitions, detailChangesDuringZoom }) }
      }
      requestAnimationFrame(frame)
    }), { seconds, motion, rotate, zoomMotion, inputMotion, motionTrace: process.env.BENCH_MOTION_TRACE === "1" })
    if (inputMotion && motion) await page.mouse.up()
    const gpuTimings = process.env.BENCH_GPU === "1" ? await page.evaluate(() => {
      const probe = window.__benchmarkGPU; probe.active = false
      const sorted = [...probe.samples].sort((a, b) => a - b)
      return { supported: probe.supported, samples: sorted.length, disjoint: probe.disjoint,
        meanMs: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
        p95Ms: sorted[Math.floor(sorted.length * .95)] ?? null }
    }) : undefined
    if (process.env.BENCH_PROFILE_MOTION === "1") {
      const { profile } = await session.send("Profiler.stop")
      await writeFile(`${output}/motion-${tag}.cpuprofile`, JSON.stringify(profile))
    }
    if (process.env.BENCH_ALLOCATIONS === "1") {
      const { profile } = await session.send("HeapProfiler.stopSampling")
      await writeFile(`${output}/allocations-${tag}.heapprofile`, JSON.stringify(profile))
    }
    if (process.env.BENCH_MOTION_TRACE === "1") await writeFile(`${output}/motion-samples-${tag}.json`, JSON.stringify(measured.motionSamples))
    const poseFrames = new Map()
    const characterMotion = { observations: 0, simulatedHolds: 0, longestSimulatedHoldMs: 0, renderedHolds: 0, longestRenderedHoldMs: 0 }
    let previousPeople = new Map(), previousTime
    const simHolds = new Map(), bodyHolds = new Map()
    for (const sample of measured.motionSamples) {
      for (const person of sample.people ?? []) {
        if (person.clip === "walk" && Number.isInteger(person.displayedFrame)) {
          const poses = poseFrames.get(person.poseDetail) ?? new Set()
          poses.add(person.displayedFrame); poseFrames.set(person.poseDetail, poses)
        }
        const previous = previousPeople.get(person.id)
        if (!previous || !person.moving || !previous.moving) { simHolds.delete(person.id); bodyHolds.delete(person.id); continue }
        const dt = sample.now - previousTime
        characterMotion.observations++
        const held = (x, z) => Math.hypot(person[x] - previous[x], person[z] - previous[z]) < 1e-6
        const sim = held("x", "z") ? (simHolds.get(person.id) ?? 0) + dt : 0
        const body = held("spriteX", "spriteZ") ? (bodyHolds.get(person.id) ?? 0) + dt : 0
        simHolds.set(person.id, sim); bodyHolds.set(person.id, body)
        if (sim) characterMotion.simulatedHolds++
        if (body) characterMotion.renderedHolds++
        characterMotion.longestSimulatedHoldMs = Math.max(characterMotion.longestSimulatedHoldMs, sim)
        characterMotion.longestRenderedHoldMs = Math.max(characterMotion.longestRenderedHoldMs, body)
      }
      previousPeople = new Map((sample.people ?? []).map(person => [person.id, person])); previousTime = sample.now
    }
    const frames = measured.frames
    assert.equal(measured.misaligned, 0, "camera movement must not leave character batches a frame behind the scenery")
    assert.equal(measured.detailChangesDuringZoom, 0, "detail layers must stay resident throughout zoom input and camera easing")
    const metricsAfter = await session.send("Performance.getMetrics")
    const sorted = [...frames].sort((a, b) => a - b)
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length
    const metrics = Object.fromEntries(metricsAfter.metrics.map(({ name, value }) => [name, value - (metricsBefore.metrics.find(m => m.name === name)?.value ?? 0)]))
    const timings = await page.evaluate(() => window.__pilgrimage.profileFrames?.(false))
    const gameTimeAfter = await page.evaluate(() => ({ time: window.__pilgrimage.time(), now: performance.now() }))
    const elapsedSeconds = (gameTimeAfter.now - gameTimeBefore.now) / 1000
    const simulatedSeconds = (gameTimeAfter.time - gameTimeBefore.time) * 600
    const population = await page.evaluate(before => {
      const after = new Map(window.__pilgrimage.sim().map(s => [s.id, s]))
      return { count: after.size, moved: before.filter(s => { const next = after.get(s.id); return next && Math.hypot(next.x - s.x, next.z - s.z) > .01 }).length }
    }, populationBefore)
    assert.equal(population.count, count, "culling must retain the complete simulation")
    assert.ok(population.moved > count * .5, "travelers outside the camera must keep walking")
    const city = await page.evaluate(() => window.__pilgrimage.cityStats?.())
    if (scenario === "city") {
      assert.ok(city?.buildings >= 200, "city must contain hundreds of real buildings")
      assert.equal(city.failed, 0, "every requested city destination must be reachable")
      assert.ok(city.active >= count * .98, "city population must keep following routes")
      assert.ok(city.completed > info.city.completed, "city must finish and assign new routes during measurement")
      assert.ok(city.uniqueDestinations >= 200, "routes must spread throughout the city")
    }
    const occlusion = process.env.BENCH_OCCLUSION === "1" ? await page.evaluate(() => window.__pilgrimage.characterOcclusion()) : undefined
    const observedWalkPoses = Object.fromEntries([...poseFrames].map(([detail, frames]) => [detail, [...frames].sort((a, b) => a - b)]))
    const result = { ...info, zoom: viewSize, occlusion, city, scenario, trees, target, measuredAt: new Date().toISOString(), host: { cpu: cpus()[0]?.model, memoryGiB: totalmem() / 2 ** 30, loadAverage: loadavg() }, speed, gameTime: { elapsedSeconds, simulatedSeconds, effectiveSpeed: simulatedSeconds / elapsedSeconds / 2 }, population, timings, gpuTimings, characterMotion, observedWalkPoses, longTasks: measured.longTasks, seconds, motion, rotate, zoomMotion, inputMotion, sceneryDetails: measured.sceneryDetails, detailTransitions: measured.detailTransitions, detailChangesDuringZoom: measured.detailChangesDuringZoom, cameraMisalignedFrames: measured.misaligned, missingVisibleFigures: measured.missingFigures, frames: frames.length, fps: 1000 / mean, mean, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], p99: sorted[Math.floor(sorted.length * .99)], overBudgetPercent: frames.filter(ms => ms > 18).length / frames.length * 100, metrics, errors, browserWarnings: [...new Set(browserWarnings)] }
    await writeFile(`${output}/result-${tag}.json`, JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
    await page.screenshot({ path: `${output}/scene-${tag}.png`, timeout: 120000 })
    if (process.env.BENCH_MIN_FPS) assert.ok(result.fps >= Number(process.env.BENCH_MIN_FPS), `FPS ${result.fps.toFixed(1)} is below the requested budget`)
    if (process.env.BENCH_MAX_P95) assert.ok(result.p95 <= Number(process.env.BENCH_MAX_P95), `p95 ${result.p95.toFixed(1)} ms exceeds the requested budget`)
    if (process.env.BENCH_PROFILE !== "0") {
      await session.send("Profiler.enable")
      await session.send("Profiler.start")
      await page.waitForTimeout(8000)
      const { profile } = await session.send("Profiler.stop")
      await writeFile(`${output}/cpu-${tag}.cpuprofile`, JSON.stringify(profile))
      const times = new Map()
      profile.samples.forEach((id, i) => times.set(id, (times.get(id) ?? 0) + profile.timeDeltas[i]))
      console.log("CPU self time (ms)", profile.nodes.map(n => ({ fn: n.callFrame.functionName, url: n.callFrame.url, line: n.callFrame.lineNumber + 1, ms: Math.round((times.get(n.id) ?? 0) / 1000) })).sort((a, b) => b.ms - a.ms).slice(0, 35))
    }
  }
  }
  if (process.env.BENCH_SMOKE === "1" || process.env.BENCH_DETAIL_SMOKE === "1") {
    // Repeated real wheel changes must keep the resident layers until input
    // and easing finish. Capture the following half second separately so a
    // delayed hitch cannot disappear into a smooth-gesture average.
    await page.evaluate(mobile => { window.__pilgrimage.setPaused(true); window.__pilgrimage.setZoom(mobile ? 20 : 36) }, mobile)
    await page.waitForFunction(() => {
      const state = window.__pilgrimage.sceneryDetailStatus()
      return state?.current === 0 && !state.zooming
    }, undefined, { timeout: 30000 })
    if (process.env.BENCH_PROFILE_SETTLE === "1") { await session.send("Profiler.enable"); await session.send("Profiler.start") }
    const settling = await page.evaluate(async mobile => {
      const game = window.__pilgrimage, canvas = document.querySelector("canvas[data-engine]")
      const results = []
      const close = mobile ? 20 : 36, middle = mobile ? 45 : 70
      for (const target of [140, close, 140, middle, close]) {
        const result = await new Promise((resolve, reject) => {
          const frames = [], transitions = []; let start, last, settledAt, previousDetail = game.sceneryDetail()
          canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true,
            clientX: 700, clientY: 400, deltaY: Math.log(target / game.camera().viewSize) / .0015 }))
          function frame(now) {
            start ??= now
            const status = game.sceneryDetailStatus(), dt = last === undefined ? 0 : now - last
            if (last !== undefined) frames.push({ dt, zooming: status.zooming, fade: status.fade,
              presentationFade: status.presentationFade, afterSettle: settledAt !== undefined })
            if (status.current !== previousDetail) transitions.push({ ...status, dt, elapsed: now - start })
            previousDetail = status.current; last = now
            if (!status.zooming && now - start > 200) settledAt ??= now
            if (settledAt !== undefined && now - settledAt >= 500) {
              const geometry = game.geometryStats()
              resolve({ target, status, transitions, frames, layers: {
                terrainEdges: !!geometry["elevation-rims"], detailedBridge: !!geometry["bridge-box-close"], coarseBridge: !!geometry["bridge-box-distant"] } })
            }
            else if (now - start > 15000) reject(new Error("Zoom detail failed to settle"))
            else requestAnimationFrame(frame)
          }
          requestAnimationFrame(frame)
        })
        results.push(result)
      }
      return results
    }, mobile)
    if (process.env.BENCH_PROFILE_SETTLE === "1") {
      const { profile } = await session.send("Profiler.stop")
      await writeFile(`${output}/detail-settle.cpuprofile`, JSON.stringify(profile))
    }
    for (const result of settling) {
      assert.equal(result.status.current, result.target === 140 ? 2 : result.target === (mobile ? 45 : 70) ? 1 : 0)
      assert.ok(result.transitions.length > 0, "settling must apply the final requested layer set")
      assert.ok(result.transitions.every(change => !change.zooming), "layer changes must wait for the camera")
      assert.ok(result.frames.some(frame => frame.presentationFade), "the world presentation must actually fade after the detail switch")
      if (result.status.current > 0) {
        assert.equal(result.layers.terrainEdges, false, "distant terrain rims must be hidden")
        assert.equal(result.layers.detailedBridge, false, "distant bridges must skip fine parts")
      } else assert.equal(result.layers.coarseBridge, false, "close bridges must restore their original parts")
    }
    await writeFile(`${output}/detail-settle.json`, JSON.stringify(settling, null, 2))
    console.log("Zoom settling passed: layers retained through easing, final detail applied, post-settle frames captured")
  }
  if (process.env.BENCH_SMOKE === "1") {
    await page.evaluate(() => { window.__pilgrimage.setPaused(true); window.__pilgrimage.setZoom(36); window.__pilgrimage.setView(0) })
    await page.waitForTimeout(1500)
    const points = await page.evaluate(() => window.__pilgrimage.travelerScreenPoints()
      .filter(p => p.x > 260 && p.x < 1050 && p.y > 150 && p.y < 720)
      .sort((a, b) => Math.hypot(a.x - 700, a.y - 450) - Math.hypot(b.x - 700, b.y - 450)))
    let selected
    for (const point of points.slice(0, 12)) {
      await page.mouse.click(point.x, point.y)
      selected = await page.evaluate(() => window.__pilgrimage.camera().selection)
      if (selected?.kind === "traveler") break
    }
    assert.equal(selected?.kind, "traveler", "batched people must remain clickable")
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${output}/selected-traveler.png` })
    const selectionVisuals = await page.evaluate(() => window.__pilgrimage.selectionVisuals())
    assert.ok(selectionVisuals.shadows > 0 && selectionVisuals.sprites > 0, "selection must retain its character highlight and individual sprite")
    await page.evaluate(() => window.__pilgrimage.setZoom(140))
    await page.waitForFunction(() => window.__pilgrimage.sceneryDetail() === 2, undefined, { timeout: 30000 })
    const wideSelection = await page.evaluate(() => window.__pilgrimage.selectionVisuals())
    assert.ok(wideSelection.sprites > 0, "selected characters must remain visible at distant zoom")
    assert.equal(wideSelection.reducedWalking, 0, "selected characters must retain full walking poses at distant zoom")
    await page.screenshot({ path: `${output}/selected-traveler-wide.png` })
    await page.evaluate(() => window.__pilgrimage.setZoom(36))
    await page.waitForFunction(() => window.__pilgrimage.sceneryDetail() === 0, undefined, { timeout: 30000 })
    const pose = await page.evaluate(() => window.__pilgrimage.camera())
    await page.evaluate(pose => window.__pilgrimage.setTarget(pose.targetX + 80, pose.targetZ), pose)
    await page.waitForTimeout(700)
    assert.deepEqual(await page.evaluate(() => window.__pilgrimage.camera().selection), selected)
    await page.evaluate(pose => window.__pilgrimage.setTarget(pose.targetX, pose.targetZ), pose)
    await page.waitForTimeout(700)
    const transport = await page.evaluate(() => {
      const game = window.__pilgrimage
      const pose = game.camera()
      const person = game.sim().filter(person => person.convoy).sort((a, b) =>
        Math.hypot(a.x - pose.targetX, a.z - pose.targetZ) - Math.hypot(b.x - pose.targetX, b.z - pose.targetZ))[0]
      if (person) game.setTarget(person.x, person.z)
      return person?.id
    })
    assert.notEqual(transport, undefined, "selection smoke needs a convoy in the population")
    await page.waitForTimeout(1800)
    await page.evaluate(id => window.__pilgrimage.selectTraveler(id), transport)
    await page.waitForTimeout(500)
    const transportVisuals = await page.evaluate(() => window.__pilgrimage.selectionVisuals())
    assert.ok(transportVisuals.shadows > 0 && transportVisuals.sprites > 0, "batched transport must restore its individual selection rendering")
    await page.screenshot({ path: `${output}/selected-transport.png` })
    // The city centre has almost no trees, and its buildings occlude the few
    // projected into that view. Exercise picking in the surrounding forest.
    await page.evaluate(() => {
      const game = window.__pilgrimage, pose = game.camera()
      const candidates = game.treePlacements().filter(tree => game.map.buildings.every(b => {
        const x = tree.x + game.map.width / 2, z = tree.z + game.map.depth / 2
        return x < b.x - 4 || x > b.x + b.w + 4 || z < b.z - 4 || z > b.z + b.d + 4
      }))
      candidates.sort((a, b) => Math.hypot(a.x - pose.targetX, a.z - pose.targetZ) - Math.hypot(b.x - pose.targetX, b.z - pose.targetZ))
      if (!candidates.length) throw new Error("Selection smoke needs an unobstructed forest area")
      game.setTarget(candidates[0].x, candidates[0].z)
    })
    await page.waitForTimeout(1800)
    const trees = await page.evaluate(() => {
      const game = window.__pilgrimage
      return game.treePlacements().map(tree => game.worldScreenPoint(tree.x, tree.y + (tree.shape?.trunkHeight ?? 1) * (tree.scale ?? 1), tree.z))
        .filter(p => p.x > 250 && p.x < 1050 && p.y > 150 && p.y < 720)
        .sort((a, b) => Math.hypot(a.x - 700, a.y - 400) - Math.hypot(b.x - 700, b.y - 400))
    })
    let treeSelection
    for (const point of trees.slice(0, 12)) {
      await page.mouse.click(point.x, point.y)
      treeSelection = await page.evaluate(() => window.__pilgrimage.camera().selection)
      if (treeSelection?.kind === "tree") break
    }
    assert.equal(treeSelection?.kind, "tree", "batched scenery must retain tree picking")
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${output}/selected-tree.png` })
    for (const [zoom, detail] of [[140, 2], [70, 1], [36, 0]]) {
      await page.evaluate(zoom => window.__pilgrimage.setZoom(zoom), zoom)
      await page.waitForFunction(detail => window.__pilgrimage.sceneryDetail() === detail, detail, { timeout: 30000 })
      assert.equal(await page.evaluate(() => window.__pilgrimage.sceneryDetail()), detail, `zoom ${zoom} must select the expected scenery detail`)
      assert.deepEqual(await page.evaluate(() => window.__pilgrimage.camera().selection), treeSelection, "zoom detail changes must retain tree selection")
      if (zoom === 140) await page.screenshot({ path: `${output}/selected-tree-wide.png` })
    }
    console.log("Selection smoke passed: traveler picking, highlight, camera departure/return, tree picking, transport highlight, and scenery detail restoration")
  }
  if (process.env.BENCH_CITY_SMOKE === "1") {
    assert.equal(scenario, "city")
    await page.evaluate(() => {
      const game = window.__pilgrimage
      game.setPaused(true); game.camera().select(null); game.setView(0); game.setZoom(36)
      const p = game.benchmarkTarget
      game.setTarget(p.x - game.map.width / 2 + .5, p.z - game.map.depth / 2 + .5)
    })
    await page.waitForTimeout(1500)
    const triangles = await page.evaluate(() => { const g = window.__pilgrimage.geometryStats(); return (g["building-surfaces"]?.triangles ?? 0) + (g["building-block-surfaces"]?.triangles ?? 0) })
    const roofs = await page.evaluate(() => {
      const game = window.__pilgrimage
      return game.map.buildings.filter(b => b.buildType === "house").map(b => ({ id: b.id,
        ...game.worldScreenPoint(b.x - game.map.width / 2 + b.w / 2, 1.1, b.z - game.map.depth / 2 + b.d / 2) }))
        .filter(p => p.x > 300 && p.x < 1050 && p.y > 180 && p.y < 650)
        .sort((a, b) => Math.hypot(a.x - 700, a.y - 420) - Math.hypot(b.x - 700, b.y - 420))
    })
    let selected
    for (const point of roofs) {
      await page.mouse.click(point.x, point.y)
      selected = await page.evaluate(() => window.__pilgrimage.camera().selection)
      if (selected?.kind === "building" && selected.id === point.id) break
    }
    assert.equal(selected?.kind, "building", "merged building roofs must remain clickable")
    await page.waitForTimeout(700)
    assert.ok(await page.evaluate(() => { const g = window.__pilgrimage.geometryStats(); return (g["building-surfaces"]?.triangles ?? 0) + (g["building-block-surfaces"]?.triangles ?? 0) }) < triangles,
      "selected buildings must remove their roof and near walls")
    await page.screenshot({ path: `${output}/city-selected-building.png` })
    for (const zoom of [140, 70, 36]) {
      await page.evaluate(zoom => window.__pilgrimage.setZoom(zoom), zoom)
      await page.waitForFunction(zoom => window.__pilgrimage.sceneryDetail() === (zoom === 140 ? 2 : zoom === 70 ? 1 : 0), zoom, { timeout: 30000 })
      await page.waitForTimeout(700)
      const effects = await page.evaluate(() => window.__pilgrimage.distantEffects())
      if (zoom > 36) assert.deepEqual(effects, { smoke: 0, fires: 0, pointLights: 0, floaters: 0, cutaways: 0 }, "wide views must omit interiors, smoke, fire, local lights and floating receipts")
      else assert.ok(effects.cutaways > 0 && effects.pointLights > 0 && effects.floaters > 0, "zooming in must restore the selected interior and effects")
      assert.deepEqual(await page.evaluate(() => window.__pilgrimage.camera().selection), selected)
    }
    await page.evaluate(() => window.__pilgrimage.camera().select(null))
    await page.waitForTimeout(700)
    assert.equal(await page.evaluate(() => { const g = window.__pilgrimage.geometryStats(); return (g["building-surfaces"]?.triangles ?? 0) + (g["building-block-surfaces"]?.triangles ?? 0) }), triangles,
      "deselecting must restore the complete building geometry")
    console.log("City smoke passed: building picking, roof cutaway, selection through zoom, and complete roof restoration")
  }
  if (process.env.BENCH_DIAGNOSTICS === "1") {
    await page.evaluate(() => window.__pilgrimage.setPaused(true))
    const diagnostics = []
    for (const [label, terrain, lights] of [["complete scene", true, true], ["hearth lights disabled", true, false], ["terrain disabled", false, true], ["both disabled", false, false]]) {
      await page.evaluate(({ terrain, lights }) => {
        window.__pilgrimage.setTerrainVisible(terrain); window.__pilgrimage.setHearthLightsVisible(lights)
      }, { terrain, lights })
      await page.waitForTimeout(3000)
      if (process.env.BENCH_GPU === "1") await page.evaluate(() => {
        const probe = window.__benchmarkGPU
        probe.reset?.(); probe.samples.length = 0; probe.disjoint = 0; probe.active = true
      })
      const times = await page.evaluate(() => new Promise(resolve => {
        let start, last; const times = []
        function frame(now) { start ??= now; if (last) times.push(now - last); last = now
          if (now - start < 6000) requestAnimationFrame(frame); else resolve(times) }
        requestAnimationFrame(frame)
      }))
      const sorted = [...times].sort((a, b) => a - b)
      const gpu = process.env.BENCH_GPU === "1" ? await page.evaluate(() => {
        const probe = window.__benchmarkGPU
        probe.active = false
        const sorted = [...probe.samples].sort((a, b) => a - b)
        return { supported: probe.supported, count: sorted.length, disjoint: probe.disjoint,
          meanMs: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
          p95Ms: sorted[Math.floor(sorted.length * .95)] ?? null }
      }) : undefined
      diagnostics.push({ label, paused: true, fps: times.length * 1000 / times.reduce((a, b) => a + b, 0), p95: sorted[Math.floor(sorted.length * .95)], gpu })
    }
    await page.evaluate(() => { window.__pilgrimage.setTerrainVisible(true); window.__pilgrimage.setHearthLightsVisible(true) })
    await writeFile(`${output}/diagnostics.json`, JSON.stringify(diagnostics, null, 2))
    console.log("Paused isolation diagnostics (not gameplay FPS)", diagnostics)
  }
  if (errors.length) process.exitCode = 1
} finally {
  await browser.close()
}
