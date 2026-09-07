"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BUILDING_STYLE, DEFAULT_RECIPE, EARLY_BUILDINGS, earlyBuildingRecipe, isEarlyBuilding, recipeSchema, type BuildingRecipe } from "@/lib/game/building-art/style"
import { BUILDING_VIEWS } from "@/lib/game/building-art/projection"
import { buildingDimensions } from "@/lib/game/building-art/dimensions"
import { RELIC_TABLE_TOP } from "@/lib/game/building-art/early-geometry"
import type { CaptureMapGuide } from "./map-comparison"
import { RotateCcw, X } from "lucide-react"
import { AssetEditorFrame, type AssetEditorNavigation } from "../asset-editor-frame"
import { Section, Tuner } from "../game/property-controls"

const ProceduralMapScene = dynamic(() => import("./map-comparison").then(m => m.ProceduralMapScene), { ssr: false })
const STORAGE = "pilgrimage-procedural-buildings-v2"

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a")
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** The primary building workflow uses the same deterministic model as the game.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0 — Building workshop — procedural (214-0)
 */
export function ProceduralWorkshop({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const [recipe, setRecipe] = useState<BuildingRecipe>(DEFAULT_RECIPE)
  const [ready, setReady] = useState(false)
  const [allViews, setAllViews] = useState(false)
  const [grid, setGrid] = useState(true)
  const [cutaway, setCutaway] = useState(false)
  const [zoom, setZoom] = useState(1.15)
  const [notice, setNotice] = useState("")
  const [controlsOpen, setControlsOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const section = (title: string, defaultOpen = true) => ({ title, open: openSections[title] ?? defaultOpen, onToggle: () => setOpenSections(s => ({ ...s, [title]: !(s[title] ?? defaultOpen) })) })
  const [mapReady, setMapReady] = useState(false)
  const capture = useRef<CaptureMapGuide | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  const onGuideReady = useCallback((value: CaptureMapGuide | null) => { capture.current = value; setMapReady(Boolean(value)) }, [])
  const dimensions = buildingDimensions(recipe)
  const viewRecipes = useMemo(() => (allViews ? BUILDING_VIEWS : [BUILDING_VIEWS[recipe.view]]).map(v => ({ ...recipe, view: v.id })), [allViews, recipe])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE)
      if (saved) { const result = recipeSchema.safeParse(JSON.parse(saved)); if (result.success && isEarlyBuilding(result.data.variant)) setRecipe(result.data) }
    } catch { /* The workshop also works without browser storage. */ }
    setReady(true)
  }, [])
  useEffect(() => { if (ready) { try { localStorage.setItem(STORAGE, JSON.stringify(recipe)) } catch { /* Recipes can still be downloaded. */ } } }, [ready, recipe])

  function update<K extends keyof BuildingRecipe>(key: K, value: BuildingRecipe[K]) { setRecipe(r => ({ ...r, [key]: value })) }
  function exportRecipe() {
    const manifest = { kind: "procedural-building", version: 3, style: BUILDING_STYLE.id, recipe,
      placement: { plot: [recipe.width, recipe.depth], footprint: [dimensions.width, dimensions.depth], origin: "centre of ground footprint", entrances: recipe.variant === "enclosure" ? ["north", "east", "south", "west"] : ["south"], ...(recipe.variant === "enclosure" ? { tableTop: RELIC_TABLE_TOP } : {}) },
      views: BUILDING_VIEWS, construction: "buildingParts(recipe) / BuildingModel; seed controls repeatable straw variation. Workshop edits do not change the live game's default recipe.",
    }
    saveFile(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), `building-${recipe.variant}-${recipe.seed}.json`)
    setNotice("Building recipe saved. Import it here to reproduce this model.")
  }
  async function importRecipe(file?: File) {
    if (!file) return
    try {
      if (file.size > 64_000) throw new Error()
      const data = JSON.parse(await file.text()), value = data.recipe ?? data
      const legacy = ["gable", "hipped", "porch"].includes(value.variant)
      if (legacy) {
        const preset = earlyBuildingRecipe(value.variant === "porch" ? "monk-shelter" : "house")
        Object.assign(value, { variant: preset.variant, width: Math.max(1, Math.min(5, value.width)), depth: Math.max(1, Math.min(5, value.depth)), wallHeight: preset.wallHeight, roofRise: preset.roofRise })
      }
      const parsed = recipeSchema.parse(value)
      if (!isEarlyBuilding(parsed.variant)) throw new Error()
      setRecipe({ ...parsed, roofRise: parsed.variant === "enclosure" ? 0 : parsed.roofRise }); setNotice(legacy ? "Earlier recipe adapted to early medieval construction and the 1–5 tile range." : "Building recipe restored.")
    } catch { setNotice("Choose a valid building recipe JSON file.") }
  }
  async function exportViews() {
    try {
      if (!capture.current) throw new Error("Wait for the map to finish loading.")
      saveFile(await capture.current(), `building-${recipe.variant}-${recipe.seed}-four-view-map.png`)
      setNotice("Four-view map sheet saved from this procedural model.")
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save the map sheet.") }
  }

  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} label="Procedural building editor"
    version="Timber & earth" controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(!controlsOpen)}
    status={notice || "Live procedural model · settings save in this browser"} detail={`${recipe.width} × ${recipe.depth} tiles · 4 directions`}>
    <div className="person-workspace">
      <aside className={`person-controls hud-well ${controlsOpen ? "is-open" : ""}`} aria-label="Building controls">
        <div className="person-panel-heading"><span>Building</span><button className="hud-close person-controls-toggle" aria-label="Close building controls" onClick={() => setControlsOpen(false)}><X size={14} /></button></div>
        <div className="person-controls-scroll">
          <Section {...section("Building forms")}><div className="person-presets">{EARLY_BUILDINGS.map(v => <button key={v.id} className="hud-action" aria-pressed={recipe.variant === v.id} onClick={() => { setRecipe({ ...earlyBuildingRecipe(v.id), view: recipe.view, seed: recipe.seed }); setCutaway(false); setNotice(v.description) }}>{v.name}</button>)}</div></Section>
          <Section {...section("Dimensions")}>
            <label className="person-choice">Name<input aria-label="Building name" value={recipe.subject} maxLength={160} onChange={e => update("subject", e.target.value)} /></label>
            {(["width", "depth"] as const).map(key => <label key={key} className="person-choice">Building {key}<select aria-label={`Building ${key}`} value={recipe[key]} onChange={e => update(key, Number(e.target.value))}>{Array.from({ length: 5 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} tiles</option>)}</select></label>)}
            <Tuner label="Wall height" labelClassName="w-28" value={recipe.wallHeight} min={0.25} max={recipe.variant === "enclosure" ? 0.7 : 1.4} step={0.05} display={`${recipe.wallHeight.toFixed(2)} tiles`} onChange={value => update("wallHeight", value)} />
            {recipe.variant !== "enclosure" && <Tuner label="Roof rise" labelClassName="w-28" value={recipe.roofRise} min={0.2} max={1.5} step={0.025} display={`${recipe.roofRise.toFixed(2)} tiles`} onChange={value => update("roofRise", value)} />}
            <p className="person-hint">{dimensions.width} × {dimensions.depth} occupied tiles. {recipe.variant === "enclosure" ? "Open sky and a gate on every side." : "One storey, sized beside a traveler."} No surrounding tile border.</p>
          </Section>
          <Section {...section("Materials")}>
            <label className="person-choice">Variation seed<input aria-label="Variation seed" type="number" min="0" max="99999" step="1" value={recipe.seed} onChange={e => update("seed", Math.max(0, Math.min(99999, Math.trunc(Number(e.target.value) || 0))))} /></label>
            <p className="person-hint">The same seed reproduces the stone, timber and thatch detail.</p>
            <div className="person-palette">{Object.entries(BUILDING_STYLE.palette).map(([name, color]) => <span key={name} title={`${name}: ${color}`} style={{ background: color }} />)}</div>
          </Section>
          <Section {...section("Inspection")}>
            <label className="person-check"><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} />Isometric grid</label>
            <label className="person-check"><input type="checkbox" checked={cutaway} onChange={e => setCutaway(e.target.checked)} />Cutaway view</label>
            <p className="person-hint">Actual game tiles and characters for scale. All four views render the same building.</p>
          </Section>
          <Section {...section("Files")}>
            <div className="person-file-actions">
              <button className="hud-action" disabled={!recipeSchema.safeParse(recipe).success} onClick={exportRecipe}>Export building recipe</button>
              <label className="hud-action person-file-input">Import recipe<input ref={upload} aria-label="Import building recipe" type="file" accept="application/json,.json" onChange={e => { importRecipe(e.target.files?.[0]); e.target.value = "" }} /></label>
              <button className="hud-action" disabled={!mapReady} onClick={exportViews}>Download four-view map sheet</button>
              <Link className="hud-action" href="/assets/buildings/studies">Illustrated references</Link>
            </div>
          </Section>
        </div>
        <footer className="person-panel-footer"><p className="person-hint">The relic enclosure uses this same model in the game. These drafts do not change the live game’s default recipe.</p><button className="hud-action" onClick={() => { setRecipe(DEFAULT_RECIPE); setCutaway(false); setNotice("Relic enclosure restored.") }}><RotateCcw size={12} />Restore relic enclosure</button></footer>
      </aside>
      <div className="person-preview" aria-label="Building preview">
        <div className="person-preview-toolbar hud-well">
          <div className="person-playback"><span className="person-hint">{EARLY_BUILDINGS.find(v => v.id === recipe.variant)?.name}</span><label>Zoom<select aria-label="Building preview zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[0.75, 1, 1.15, 1.5, 1.7].map(n => <option key={n} value={n}>{n}×</option>)}</select></label></div>
          <div className="person-view-buttons" aria-label="Building preview modes"><button className="hud-action" aria-pressed={!allViews} onClick={() => setAllViews(false)}>On the map</button><button className="hud-action" aria-pressed={allViews} onClick={() => setAllViews(true)}>All four</button></div>
        </div>
        <div className={`person-stage asset-building-stage ${allViews ? "asset-building-four" : ""}`}>
          {active && viewRecipes.map((viewRecipe, i) => <ProceduralMapScene key={viewRecipe.view} embedded recipe={viewRecipe} grid={grid} zoom={zoom} cutaway={cutaway} onGuideReady={i === 0 ? onGuideReady : undefined} />)}
        </div>
        <div className="person-animation-dock hud-well"><div className="person-direction-strip" aria-label="Building directions">{BUILDING_VIEWS.map(v => <button key={v.id} className="hud-building-tile person-direction asset-building-direction" aria-label={`Face ${v.name}`} aria-pressed={recipe.view === v.id} onClick={() => { update("view", v.id); setAllViews(false) }}><span>{["SE", "NE", "NW", "SW"][v.id]}</span><span>{v.name}</span></button>)}</div></div>
      </div>
    </div>
  </AssetEditorFrame>
}
