"use client"

import { AssetEditorFrame, AssetEditorWorkspace, AssetEditorSection, type AssetEditorNavigation } from "@/components/asset-editor-frame"
import { playgroundHref } from "@/lib/asset-playground"

import { useEffect, useMemo, useRef, useState } from "react"
import { LabSeedInput, LabSeedActions, LabSelect, LabSlider, labButton, labInput } from "@/components/lab-controls"
import { TERRAIN, type TerrainId } from "@/lib/game/map/terrain"
import { parseSeed } from "@/lib/game/rng"
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
  ctx.font = `bold ${Math.round(scale * 5)}px ${getComputedStyle(document.body).fontFamily}`
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
      className="playground-map-canvas" style={{ imageRendering: "pixelated" }} />

    <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-rule pt-3 text-xs">
      {[["Open land", `${stats.open.toFixed(1)}%`], ["Woodland", `${stats.forest.toFixed(1)}%`], ["Dark forest", `${stats.dark.toFixed(1)}%`],
        ["Water", `${stats.water.toFixed(1)}%`], ["Starting lumber", `${stats.nearbyTrees} wooded tiles`], ["Tiny groves (1–8 tiles)", stats.tinyGroves], ["Small groves", stats.smallGroves], ["Largest wood", `${stats.largestWood.toLocaleString("en-US")} tiles`], ["Connected", `${stats.connected}/${map.clearings.length}`]].map(([label, value]) =>
        <div key={label}><dt className="text-ink-light">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
  </article>
}

/** Seed-selected woodland previews in the existing asset playground, using its shared
 * controls and the game's minimap palette. No playable world is instantiated. */
export function MapLab({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const [controlsOpen, setControlsOpen] = useState(false)
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
    const url = `${window.location.origin}${playgroundHref("maps", params)}`
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
    ctx.fillStyle = "#f2e8d5"; ctx.font = `22px ${getComputedStyle(document.body).fontFamily}`
    ctx.fillText(METHODS[method].title, 16, 30)
    ctx.font = `14px ${getComputedStyle(document.body).fontFamily}`
    ctx.fillText(`Seed ${settings.seed} · ${settings.size} × ${settings.size} tile sample · woodland & water`, 16, 54)
    ctx.fillText(`Trees ${settings.forest}% · clearing density ${settings.clearings} · dark woods ${settings.darkCount} × ${settings.darkShare}% · heart size ${settings.heart}`, 16, 76)
    ctx.fillText(`River density ${settings.rivers} · lake density ${settings.lakes}${method === "groves" ? ` · parent stands ${settings.groves} · wind ${settings.wind}°` : ""}`, 16, 98)
    const square = document.createElement("canvas"); square.width = square.height = map.size * 3
    drawMap(square, map, overlay); ctx.imageSmoothingEnabled = false
    ctx.drawImage(square, 16, header, squareSize, squareSize)
    ctx.fillText(`${map.stats.open.toFixed(1)}% open · ${map.stats.tinyGroves} tiny groves · ${map.stats.connected}/${map.clearings.length} clearings connected`, 16, header + squareSize + 28)
    const link = document.createElement("a"); link.download = `woodland-${method}-${settings.seed}.png`; link.href = canvas.toDataURL("image/png"); link.click()
  }
  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} label="Maps editor" version="Maps" controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(value => !value)} status={status || (pending ? "Settings changed — apply seed to regenerate." : "Ready · seed controls regenerate the map")} detail={`Seed ${settings.seed} · ${settings.size} × ${settings.size}`}>
    <AssetEditorWorkspace title="Maps" controlsOpen={controlsOpen} onControlsClose={() => setControlsOpen(false)}
      controlsFooter={<div className="person-panel-footer"><div className="flex flex-wrap gap-2">
            <LabSeedActions draft={seedDraft} seed={settings.seed} onApply={apply} disabled={!ready} />
            <button type="button" className={labButton} onClick={() => { setDraft(DEFAULT_SETTINGS); setSettings(DEFAULT_SETTINGS); setSeedDraft(String(DEFAULT_SETTINGS.seed)); setShareUrl(""); setStatus("Default map restored.") }}>Reset</button>
          </div></div>}
      controls={<><AssetEditorSection title="Layout"><LabSeedInput value={seedDraft} onChange={setSeedDraft} onApply={apply} disabled={!ready} />
<LabSelect label="Sample size" value={String(draft.size)} options={{ 128: "128 × 128", 192: "192 × 192", 256: "256 × 256" }} onChange={value => patch({ size: Number(value) })} />
<LabSlider label="Clearings" help="Clearing density / 192²" value={draft.clearings} min={4} max={14} step={1} onChange={clearings => patch({ clearings })} />
<LabSlider label="Path width" help="Main passage width in tiles" value={draft.corridor} min={1} max={5} step={1} onChange={corridor => patch({ corridor })} /><p className="person-hint">Apply the seed to regenerate after changing settings. Clearing counts are densities per 192 × 192 tiles.</p></AssetEditorSection>
<AssetEditorSection title="Woodland"><LabSlider label="Tree cover" help="Tree cover target" value={draft.forest} min={25} max={60} step={1} suffix="%" onChange={forest => patch({ forest })} />
{method === "groves" && <LabSlider label="Parent stands" help="Parent stands / 192² (wind)" value={draft.groves} min={1} max={28} step={1} onChange={groves => patch({ groves })} />}
{method === "groves" && <LabSlider label="Wind direction" help="Wind direction (wind study)" value={draft.wind} min={0} max={359} step={1} suffix="°" onChange={wind => patch({ wind })} />}
<LabSelect label="Dark forests" help="Dark forests / 192²" value={String(draft.darkCount)} options={{ 0: "None", 1: "One", 2: "Two" }} onChange={value => patch({ darkCount: Number(value) })} />
<LabSlider label="Forest size" help="Dark forest size (% of 192²)" value={draft.darkShare} min={6} max={14} step={1} suffix="%" onChange={darkShare => patch({ darkShare })} />
<LabSlider label="Heart size" help="Forest heart size (tiles)" value={draft.heart} min={5} max={12} step={1} onChange={heart => patch({ heart })} /><p className="person-hint">Tree cover is a target. Forest counts and areas use a 192 × 192 tile reference; changing sample size crops the same surrounding landscape.</p></AssetEditorSection>
<AssetEditorSection title="Water"><LabSelect label="Rivers" help="River density / 192²" value={String(draft.rivers)} options={{ 0: "None", 1: "One", 2: "Two" }} onChange={value => patch({ rivers: Number(value) })} />
<LabSelect label="Lakes" help="Lake density / 192²" value={String(draft.lakes)} options={{ 0: "None", 1: "One", 2: "Two" }} onChange={value => patch({ lakes: Number(value) })} />
<LabSlider label="Water cover" help="Water coverage budget" value={draft.water} min={0} max={25} step={1} suffix="%" onChange={water => patch({ water })} /><p className="person-hint">River and lake counts are densities per 192 × 192 tiles. The coverage limit may reduce how much water is placed.</p></AssetEditorSection>
        <AssetEditorSection title="Files"><button type="button" className={labButton} disabled={!ready || pending} onClick={share}>Copy map link</button>
<button type="button" className={labButton} disabled={!ready || pending} onClick={download}>Save map PNG</button>{shareUrl && <label className="text-xs text-ink-light">Map link<input readOnly className={`${labInput} mt-1`} value={shareUrl} onFocus={e => e.target.select()} /></label>}</AssetEditorSection>
        </>}
      toolbar={<><label className="flex items-center gap-2"><input type="checkbox" className="accent-gold" checked={overlay} onChange={e => setOverlay(e.target.checked)} />Show connections</label>


</>}
      dock={<div className="person-animation-dock hud-well"><><div className="flex flex-wrap gap-4 text-xs" aria-label="Map legend">
        {(["grass", "forest", "darkwood", "clearing", "water", "bridge"] as const).map(id => <span key={id} className="flex items-center gap-2"><span className="h-3 w-3 border border-rule" style={{ background: TERRAIN[id].color }} />{id === "clearing" ? "Forest passage" : TERRAIN[id].label}</span>)}
      </div></></div>}>
      <div className="person-stage playground-stage">{active && <><div className="mx-auto w-full max-w-[800px]">{map && <MapCard map={map} overlay={overlay} />}</div></>}</div>
    </AssetEditorWorkspace>
  </AssetEditorFrame>
}
