"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { LabSelect, LabSlider, labButton, labInput } from "@/components/lab-controls"
import { TERRAIN, type TerrainId } from "@/lib/game/map/terrain"
import { parseSeed, randomSeed } from "@/lib/game/rng"
import { DEFAULT_SETTINGS, LIMITS, METHODS, generatePreview, normalizeSettings, seedingMethodForSeed, type Preview, type Settings } from "@/lib/map-lab/generate"

const palette = Object.fromEntries(Object.entries(TERRAIN).map(([id, def]) => {
  const hex = parseInt(def.color.slice(1), 16)
  return [id, [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]]
})) as Record<TerrainId, number[]>

function drawMap(canvas: HTMLCanvasElement, map: Preview, overlay: boolean) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const base = document.createElement("canvas")
  base.width = base.height = map.size
  const baseCtx = base.getContext("2d")!
  const image = baseCtx.createImageData(map.size, map.size)
  map.tiles.forEach((tile, i) => { image.data.set([...palette[tile], 255], i * 4) })
  baseCtx.putImageData(image, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height)
  const drawChurch = () => {
    const scale = canvas.width / map.size
    const x = (map.church.x + .5) * scale, y = (map.church.z + .5) * scale
    ctx.fillStyle = "#14100a"; ctx.fillRect(x - scale * 4, y - scale * 5, scale * 8, scale * 10)
    ctx.fillStyle = "#f2e8d5"
    ctx.fillRect(x - scale, y - scale * 4, scale * 2, scale * 8)
    ctx.fillRect(x - scale * 3, y - scale * 2, scale * 6, scale * 2)
  }
  if (!overlay) { drawChurch(); return }
  const scale = canvas.width / map.size
  ctx.strokeStyle = "#e1c777"
  ctx.lineWidth = Math.max(1, scale * .65)
  for (const route of map.routes) {
    ctx.beginPath()
    route.forEach((i, n) => {
      const x = (i % map.size + .5) * scale, y = (Math.floor(i / map.size) + .5) * scale
      if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
  ctx.font = `bold ${Math.round(scale * 5)}px sans-serif`
  ctx.textAlign = "center"; ctx.textBaseline = "middle"
  map.clearings.forEach((c, i) => {
    const x = (c.x + .5) * scale, y = (c.z + .5) * scale
    ctx.fillStyle = "#14100a"; ctx.fillRect(x - scale * 4, y - scale * 4, scale * 8, scale * 8)
    ctx.fillStyle = c.kind === "heart" ? "#e1c777" : "#f2e8d5"
    ctx.fillText(String(i + 1), x, y)
  })
  drawChurch()
}

function MapCard({ map, overlay }: { map: Preview; overlay: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (canvas.current) drawMap(canvas.current, map, overlay) }, [map, overlay])
  const { stats } = map
  return <article className="min-w-0 border border-rule bg-parchment p-4 text-ink">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-lg font-semibold">{METHODS[map.method].title}</h2>
    </div>
    <canvas ref={canvas} width={map.size * 3} height={map.size * 3} role="img"
      aria-label={`${METHODS[map.method].title}: ${stats.open.toFixed(1)}% open land, ${stats.smallGroves} small groves, ${stats.connected} of ${map.clearings.length} clearings connected; initial church with ${stats.nearbyTrees} nearby wooded tiles`}
      className="block aspect-square h-auto w-full border border-rule" style={{ imageRendering: "pixelated" }} />
    <p className="mt-3 text-sm text-ink-light">{METHODS[map.method].description}</p>
    <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-rule pt-3 text-xs">
      {[["Open land", `${stats.open.toFixed(1)}%`], ["Woodland", `${stats.forest.toFixed(1)}%`], ["Dark forest", `${stats.dark.toFixed(1)}%`],
        ["Water", `${stats.water.toFixed(1)}%`], ["Starting lumber", `${stats.nearbyTrees} wooded tiles`], ["Tiny groves (1–8 tiles)", stats.tinyGroves], ["Small groves", stats.smallGroves], ["Largest wood", `${stats.largestWood.toLocaleString("en-US")} tiles`], ["Connected", `${stats.connected}/${map.clearings.length}`]].map(([label, value]) =>
        <div key={label}><dt className="text-ink-light">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
  </article>
}

/** Seed-selected woodland previews in the existing asset playground, using its shared
 * controls and the game's minimap palette. No playable world is instantiated. */
export function MapLab() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [draft, setDraft] = useState<Settings>(DEFAULT_SETTINGS)
  const [seedDraft, setSeedDraft] = useState(String(DEFAULT_SETTINGS.seed))
  const [overlay, setOverlay] = useState(true)
  const method = seedingMethodForSeed(settings.seed)
  const [status, setStatus] = useState("")
  const [shareUrl, setShareUrl] = useState("")
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search), restored: Partial<Settings> = {}
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const value = params.get(key)
      if (value !== null && value.trim() !== "" && Number.isFinite(Number(value))) restored[key] = Number(value)
    }
    const next = normalizeSettings(restored)
    setSettings(next); setDraft(next); setSeedDraft(String(next.seed))
    setOverlay(params.get("overlay") !== "0"); setReady(true)
  }, [])
  const map = useMemo(() => ready ? generatePreview(method, settings) : null, [settings, ready, method])
  const patch = (values: Partial<Settings>) => setDraft(old => ({ ...old, ...values }))
  const seed = parseSeed(seedDraft)
  const pending = seed !== settings.seed || Object.keys(LIMITS).some(key => draft[key as keyof Settings] !== settings[key as keyof Settings])
  const apply = (newSeed: number) => {
    const next = normalizeSettings({ ...draft, seed: newSeed })
    setSettings(next); setDraft(next); setSeedDraft(String(next.seed)); setShareUrl("")
    setStatus(`Generated ${METHODS[seedingMethodForSeed(next.seed)].title.toLowerCase()} with seed ${next.seed}.`)
  }
  const share = async () => {
    const params = new URLSearchParams(Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)])))
    params.set("overlay", overlay ? "1" : "0")
    const url = `${window.location.origin}/assets/maps?${params}`
    setShareUrl(url); window.history.replaceState(null, "", url)
    try { await navigator.clipboard.writeText(url); setStatus("Map link copied.") }
    catch { setStatus("Copy the map link below.") }
  }
  const download = () => {
    if (!map) return
    const canvas = document.createElement("canvas"), squareSize = 768, header = 120
    canvas.width = squareSize + 32; canvas.height = header + squareSize + 48
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = "#14100a"; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#f2e8d5"; ctx.font = "22px sans-serif"
    ctx.fillText(METHODS[method].title, 16, 30)
    ctx.font = "14px sans-serif"
    ctx.fillText(`Seed ${settings.seed} · ${settings.size} × ${settings.size} tile sample · woodland & water`, 16, 54)
    ctx.fillText(`Trees ${settings.forest}% · clearing density ${settings.clearings} · dark woods ${settings.darkCount} × ${settings.darkShare}% · heart size ${settings.heart}`, 16, 76)
    ctx.fillText(`River density ${settings.rivers} · lake density ${settings.lakes}${method === "groves" ? ` · parent stands ${settings.groves} · wind ${settings.wind}°` : ""}`, 16, 98)
    const square = document.createElement("canvas"); square.width = square.height = map.size * 3
    drawMap(square, map, overlay); ctx.imageSmoothingEnabled = false
    ctx.drawImage(square, 16, header, squareSize, squareSize)
    ctx.fillText(`${map.stats.open.toFixed(1)}% open · ${map.stats.tinyGroves} tiny groves · ${map.stats.connected}/${map.clearings.length} clearings connected`, 16, header + squareSize + 28)
    const link = document.createElement("a"); link.download = `woodland-${method}-${settings.seed}.png`; link.href = canvas.toDataURL("image/png"); link.click()
  }
  return <main className="min-h-screen bg-[#14100a] px-4 py-8 text-parchment sm:px-8">
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <header>
        <Link href="/assets" className="font-display text-[10px] uppercase tracking-[3px] text-gold hover:text-gold-light">← Assets</Link>
        <h1 className="mt-4 font-display text-2xl font-semibold uppercase tracking-[4px] sm:text-3xl">Map playground</h1>
        <p className="mt-2 text-parchment-dark">More meadow, smaller groves, deeper woods. Each seed grows its woodland through wind spread or cellular growth.</p>
        <p className="mt-2 max-w-4xl text-sm text-parchment-dark">Terrain studies with shared rivers and lakes. Dark forests have irregular hearts and a single entrance, enclosed by normal woodland; the initial church sits beside harvestable trees. Every main clearing, forest heart and church has a walking connection, with preview crossings where needed. These seeding styles also generate playable worlds. This lightweight study omits elevation and settlement simulation; playable paths follow the actual slopes and river crossings.</p>
      </header>
      <section aria-label="Map settings" className="border border-rule bg-parchment p-4 text-ink sm:p-5">
        <div className="grid grid-cols-2 items-end gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-ink-light">Map seed<input className={labInput} value={seedDraft} inputMode="numeric" aria-invalid={seed === null}
            onChange={e => setSeedDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && seed !== null) apply(seed) }} /></label>
          <LabSelect label="Sample size" value={String(draft.size)} options={{ 128: "128 × 128", 192: "192 × 192", 256: "256 × 256" }} onChange={value => patch({ size: Number(value) })} />
          <LabSlider label="Tree cover target" value={draft.forest} min={25} max={60} step={1} suffix="%" onChange={forest => patch({ forest })} />
          <LabSlider label="Clearing density / 192²" value={draft.clearings} min={4} max={14} step={1} onChange={clearings => patch({ clearings })} />
          {method === "groves" && <LabSlider label="Parent stands / 192² (wind)" value={draft.groves} min={1} max={28} step={1} onChange={groves => patch({ groves })} />}
          {method === "groves" && <LabSlider label="Wind direction (wind study)" value={draft.wind} min={0} max={359} step={1} suffix="°" onChange={wind => patch({ wind })} />}
          <LabSelect label="River density / 192²" value={String(draft.rivers)} options={{ 0: "None", 1: "One", 2: "Two" }} onChange={value => patch({ rivers: Number(value) })} />
          <LabSelect label="Lake density / 192²" value={String(draft.lakes)} options={{ 0: "None", 1: "One", 2: "Two" }} onChange={value => patch({ lakes: Number(value) })} />
          <LabSlider label="Water coverage budget" value={draft.water} min={0} max={25} step={1} suffix="%" onChange={water => patch({ water })} />
          <LabSelect label="Dark forests / 192²" value={String(draft.darkCount)} options={{ 0: "None", 1: "One", 2: "Two" }} onChange={value => patch({ darkCount: Number(value) })} />
          <LabSlider label="Dark forest size (% of 192²)" value={draft.darkShare} min={6} max={14} step={1} suffix="%" onChange={darkShare => patch({ darkShare })} />
          <LabSlider label="Forest heart size (tiles)" value={draft.heart} min={5} max={12} step={1} onChange={heart => patch({ heart })} />
          <LabSlider label="Main passage width in tiles" value={draft.corridor} min={1} max={5} step={1} onChange={corridor => patch({ corridor })} />
          <div className="col-span-2 flex flex-wrap gap-2 md:col-span-3">
            <button type="button" className={labButton} disabled={seed === null || !ready} onClick={() => seed !== null && apply(seed)}>Generate map</button>
            <button type="button" className={labButton} disabled={!ready} onClick={() => apply((settings.seed + 1) >>> 0)}>Next seed</button>
            <button type="button" className={labButton} disabled={!ready} onClick={() => apply(randomSeed())}>Random seed</button>
            <button type="button" className={labButton} onClick={() => { setDraft(DEFAULT_SETTINGS); setSettings(DEFAULT_SETTINGS); setSeedDraft(String(DEFAULT_SETTINGS.seed)); setShareUrl(""); setStatus("Default map restored.") }}>Reset</button>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-light">{pending ? "Settings changed — generate to apply them to the map." : `Showing seed ${settings.seed} at ${settings.size} × ${settings.size}.`} Sample size crops the same surrounding landscape: features keep their tile dimensions. Counts set density per 192 × 192 tiles, and the visible totals vary with the crop. Tree cover is a target for the surrounding region, including dark forest. Enclosing woodland, clearings and passages take priority, so actual coverage may differ. Wind is clockwise from east; parent stands and wind affect the wind study. Water counts are requested seedings within the coverage budget. The game and these studies start at 40% tree cover, with one large dark-forest seed per 192 × 192 tiles and a 9% footprint per seed.</p>
      </section>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-gold" checked={overlay} onChange={e => setOverlay(e.target.checked)} />Show connections & clearing numbers</label>
        <button type="button" className={labButton} disabled={!ready || pending} onClick={share}>Copy map link</button>
        <button type="button" className={labButton} disabled={!ready || pending} onClick={download}>Save map PNG</button>
        <span className="text-xs text-parchment-dark">Cross = initial church. Gold numbers = forest hearts. The seed determines the woodland style.</span>
      </div>
      <div className="flex flex-wrap gap-4 text-xs" aria-label="Map legend">
        {(["grass", "forest", "darkwood", "clearing", "water", "bridge"] as const).map(id => <span key={id} className="flex items-center gap-2"><span className="h-3 w-3 border border-rule" style={{ background: TERRAIN[id].color }} />{id === "clearing" ? "Forest passage" : TERRAIN[id].label}</span>)}
      </div>
      <p role="status" className="text-sm text-parchment-dark">{status || "Change the seed to compare several layouts; turn off connections to judge the woodland shapes."}</p>
      {shareUrl && <label className="text-xs text-parchment-dark">Map link<input readOnly className={`${labInput} mt-1`} value={shareUrl} onFocus={e => e.target.select()} /></label>}
      <div className="mx-auto w-full max-w-[800px]">{map && <MapCard map={map} overlay={overlay} />}</div>
      <p className="text-xs text-parchment-dark">Connectivity is measured on the final tiles using four-direction walking. Tiny groves are detached woods of 1–8 tiles; small groves have 9–120 tiles at every sample size. Largest wood includes ordinary and dark forest. Dark footprints are measured before their hearts and entrances are carved. Starting lumber counts normal forest within 8 tiles of the church in each axis; at least 24 wooded tiles are protected. Percentages below each map use total map area, including water. Saplings also extend existing treelines, so attached clusters are not counted as detached groves. The seeded terrain matches exactly in overlapping samples. Church placement and access paths are planned for each visible window. Wind groves are seeded beyond the square and cropped at its edges. Heart size sets an area equivalent to that radius, with an irregular outline. Dark-forest access tracks stay one tile wide. Crossings are planning sketches, not the live bridge generator.</p>
    </div>
  </main>
}
