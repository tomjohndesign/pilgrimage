"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BUILDING_STYLE, DEFAULT_RECIPE, EARLY_BUILDINGS, earlyBuildingRecipe, isEarlyBuilding, recipeSchema, type BuildingRecipe } from "@/lib/game/building-art/style"
import { BUILDING_VIEWS } from "@/lib/game/building-art/projection"
import { buildingDimensions } from "@/lib/game/building-art/dimensions"
import { hasBuildingLayouts } from "@/lib/game/building-layout"
import { RELIC_TABLE_TOP } from "@/lib/game/building-art/early-geometry"
import type { CaptureMapGuide } from "./map-comparison"
import { RotateCcw, X } from "lucide-react"
import { minimumBuildingSize } from "@/lib/game/building-art/style"
import { randomPreviewNeighbor, tavernPreviewNeighbors, type PreviewPlacement } from "@/lib/game/building-art/map-preview"
import { normalizeBuildingRotation, type BuildingRotation } from "@/lib/game/building-rotation"
import { previewRandomSeed } from "@/lib/game/preview-random"
import { AssetEditorFrame, type AssetEditorNavigation } from "../asset-editor-frame"
import { Section, Tuner } from "../game/property-controls"

const ProceduralMapScene = dynamic(() => import("./map-comparison").then(m => m.ProceduralMapScene), { ssr: false })
const STORAGE = "pilgrimage-procedural-buildings-v3"

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a")
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** The primary building workflow uses the same deterministic model as the game.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0 — Building workshop — procedural (214-0)
 */
export function ProceduralWorkshop({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const [recipe, setRecipe] = useState<BuildingRecipe>({...earlyBuildingRecipe("tavern"),layoutSeed:18})
  const [ready, setReady] = useState(false)
  const [allViews, setAllViews] = useState(false)
  const [grid, setGrid] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [neighbor, setNeighbor] = useState(true)
  const [neighbors, setNeighbors] = useState<PreviewPlacement[]>(tavernPreviewNeighbors)
  const [placeType, setPlaceType] = useState("house")
  const [placement, setPlacement] = useState<BuildingRecipe | null>(null)
  const [placementRotation, setPlacementRotation] = useState<BuildingRotation>(0)
  const [snapRoofs, setSnapRoofs] = useState(true)
  const [placementStatus, setPlacementStatus] = useState("")
  const selectedNeighbor = neighbors.find(p=>p.id===selectedId)
  const rotatePlacement = useCallback(() => setPlacementRotation(r=>normalizeBuildingRotation(r+1)), [])
  const placeBuilding = useCallback((placed: PreviewPlacement) => {
    const id=`placed-${previewRandomSeed()}`
    setNeighbors(items=>[...items,{...placed,id}]); setSelectedId(id)
    setPlacement(null); setPlacementStatus(""); setNotice(`${placed.recipe.subject} placed.`)
  }, [])
  function startPlacement() {
    const base=placeType === "current" ? recipe : earlyBuildingRecipe(placeType as Parameters<typeof earlyBuildingRecipe>[0])
    setPlacement({...base,layoutSeed:placeType === "current" ? base.layoutSeed : previewRandomSeed()%65536,hearthZ:undefined}); setNeighbor(true); setSelectedId(null);setPlacementStatus("Move over the map and click a clear tile. R rotates; Escape cancels.")
  }
  function showTavernExample() {
    setRecipe({...earlyBuildingRecipe("tavern"),layoutSeed:18});setNeighbors(tavernPreviewNeighbors());setNeighbor(true)
    setSelectedId(null);setPlacement(null);setNotice("Tavern with two houses: one shared hearth and one house without a fireplace.")
  }
  function showInnExample() {
    const inn=earlyBuildingRecipe("inn")
    setRecipe({...earlyBuildingRecipe("tavern"),layoutSeed:0,fireplace:true})
    setNeighbors([{id:"upper-inn",recipe:inn,x:0,z:0,rotation:0},
      {id:"standalone-inn",recipe:inn,x:4,z:1,rotation:0}])
    setNeighbor(true);setSelectedId(null);setPlacement(null)
    setNotice("Inn over the full tavern, beside a standalone inn. Select either floor to look inside.")
  }
  useEffect(() => {
    if(!placement) return
    const key=(event:KeyboardEvent)=>{
      if((event.target as HTMLElement)?.closest("input,select,textarea")) return
      if(event.key.toLowerCase()==="r") {event.preventDefault();rotatePlacement()}
      if(event.key==="Escape") {setPlacement(null);setPlacementStatus("")}
    }
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)
  }, [placement,rotatePlacement])
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
      if (saved) {
        const scene=JSON.parse(saved),result=recipeSchema.safeParse(scene.recipe)
        if (result.success && isEarlyBuilding(result.data.variant)) {
          setRecipe(result.data)
          if(Array.isArray(scene.neighbors)) setNeighbors(scene.neighbors.filter((p:PreviewPlacement)=>
            typeof p.id==="string" && p.id!=="workshop" && recipeSchema.safeParse(p.recipe).success && Number.isInteger(p.x) && Number.isInteger(p.z) && [0,1,2,3].includes(p.rotation)))
        }
      }
    } catch { /* The workshop also works without browser storage. */ }
    setReady(true)
  }, [])
  useEffect(() => { if (ready) { try { localStorage.setItem(STORAGE, JSON.stringify({recipe,neighbors})) } catch { /* Recipes can still be downloaded. */ } } }, [ready, recipe, neighbors])

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
    onRandomize={() => { setRecipe(r=>({...r,layoutSeed:(previewRandomSeed()%65524+(r.layoutSeed ?? 0)+1)%65536,fireplace:undefined,hearthZ:undefined})); setNeighbors(items=>items.map(p=>{
      const next=p.anchor && items.every(item=>item.anchor) ? randomPreviewNeighbor(recipe.variant,previewRandomSeed()) : p.recipe
      return {...p,recipe:{...next,layoutSeed:previewRandomSeed()%65536,hearthZ:undefined,fireplace:undefined}}
    })); setSelectedId(null);setPlacement(null); setNotice(neighbor ? "Building layouts and adjoining buildings randomized." : "Core element positions and interior layout randomized.") }}
    randomizeDisabled={hasBuildingLayouts(recipe.variant) ? undefined : "This building form currently has a fixed layout"}
    version="Timber & earth" controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(!controlsOpen)}
    status={placement ? placementStatus : selectedId ? `${selectedNeighbor?.recipe.subject ?? recipe.subject} selected · click again or the ground to deselect` : notice || "Live procedural model · settings save in this browser"} detail={`${recipe.width} × ${recipe.depth} tiles · 4 directions`}>
    <div className="person-workspace">
      <aside className={`person-controls hud-well ${controlsOpen ? "is-open" : ""}`} aria-label="Building controls">
        <div className="person-panel-heading"><span>Building</span><button className="hud-close person-controls-toggle" aria-label="Close building controls" onClick={() => setControlsOpen(false)}><X size={14} /></button></div>
        <div className="person-controls-scroll">
          <Section {...section("Building forms")}><div className="person-presets">{EARLY_BUILDINGS.map(v => <button key={v.id} className="hud-action" aria-pressed={recipe.variant === v.id} onClick={() => { setRecipe({ ...earlyBuildingRecipe(v.id), view: recipe.view, seed: recipe.seed }); setSelectedId(null);setPlacement(null); setNotice(v.description) }}>{v.name}</button>)}</div></Section>
          <Section {...section("Dimensions")}>
            <label className="person-choice">Name<input aria-label="Building name" value={recipe.subject} maxLength={160} onChange={e => update("subject", e.target.value)} /></label>
            {(["width", "depth"] as const).map(key => <label key={key} className="person-choice">Building {key}<select aria-label={`Building ${key}`} value={recipe[key]} onChange={e => update(key, Number(e.target.value))}>{Array.from({ length: 6-minimumBuildingSize(recipe.variant)[key] }, (_, i) => i+minimumBuildingSize(recipe.variant)[key]).map(n => <option key={n} value={n}>{n} tiles</option>)}</select></label>)}
            <Tuner label="Wall height" labelClassName="w-28" value={recipe.wallHeight} min={0.25} max={recipe.variant === "enclosure" ? 0.7 : 1.4} step={0.05} display={`${recipe.wallHeight.toFixed(2)} tiles`} onChange={value => update("wallHeight", value)} />
            {!["enclosure","garden","cross","lumberCamp"].includes(recipe.variant) && <Tuner label="Roof rise" labelClassName="w-28" value={recipe.roofRise} min={0.2} max={1.5} step={0.025} display={`${recipe.roofRise.toFixed(2)} tiles`} onChange={value => update("roofRise", value)} />}
            <p className="person-hint">{dimensions.width} × {dimensions.depth} occupied tiles. {recipe.variant === "enclosure" ? "Open sky and a gate on every side." : "One storey, sized beside a traveler."} No surrounding tile border.</p>
          </Section>
          {hasBuildingLayouts(recipe.variant) && <Section {...section("Layout")}>
            <label className="person-choice">Layout seed<input aria-label="Layout seed" type="number" min="0" max="65535" step="1" value={recipe.layoutSeed ?? 0} onChange={e => update("layoutSeed", Math.max(0, Math.min(65535, Math.trunc(Number(e.target.value) || 0))))} /></label>
            {recipe.variant === "house" && <label className="person-choice">Fireplace<select aria-label="House fireplace" value={recipe.fireplace === undefined ? "auto" : recipe.fireplace ? "yes" : "no"} onChange={e=>update("fireplace",e.target.value === "auto" ? undefined : e.target.value === "yes")}><option value="auto">From layout seed</option><option value="yes">Present</option><option value="no">None</option></select></label>}
            <button className="hud-action" onClick={() => update("layoutSeed", ((recipe.layoutSeed ?? 0) + 1) % 65536)}>Next layout</button>
            {recipe.variant === "house" && <p className="person-hint">One in four seeded house layouts has no fireplace. Choose None to preview an unheated house.</p>}
            <p className="person-hint">Vary gates, furniture positions and rotations. Larger rooms gain more tables, chests and stools. Click a building to inspect its beds and furniture.</p>
          </Section>}
          <Section {...section("Materials")}>
            <label className="person-choice">Variation seed<input aria-label="Variation seed" type="number" min="0" max="99999" step="1" value={recipe.seed} onChange={e => update("seed", Math.max(0, Math.min(99999, Math.trunc(Number(e.target.value) || 0))))} /></label>
            <p className="person-hint">Vary chimney masonry, wall timbers, plaster, thatch and the props beside the entrance.</p>
            <div className="person-palette">{Object.entries(BUILDING_STYLE.palette).map(([name, color]) => <span key={name} title={`${name}: ${color}`} style={{ background: color }} />)}</div>
          </Section>
          <Section {...section("Place buildings")}>
            <button className="hud-action" onClick={showTavernExample}>Tavern + two houses</button>
            <button className="hud-action" onClick={showInnExample}>Tavern + Inn</button>
            <label className="person-choice">Building to place<select aria-label="Building to place" value={placeType} onChange={e=>{setPlaceType(e.target.value);setPlacement(null)}}>
              <option value="current">Copy current recipe</option>{EARLY_BUILDINGS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
            <button className="hud-action" disabled={!mapReady} aria-pressed={Boolean(placement)} onClick={()=>placement ? setPlacement(null) : startPlacement()}>{placement ? "Cancel placement" : "Place building"}</button>
            <button className="hud-action" onClick={rotatePlacement}>Rotate placement · {placementRotation*90}°</button>
            <label className="person-check"><input type="checkbox" checked={snapRoofs} onChange={e=>setSnapRoofs(e.target.checked)} />Snap rotation to neighboring roofs</label>
            <p className="person-hint">Click a tile to place the building. R turns it by 90°; Escape cancels. Green previews fit, red previews need more space.</p>
            {selectedNeighbor && <>
              <p className="person-hint">Selected: {selectedNeighbor.recipe.subject} · {selectedNeighbor.rotation*90}°</p>
              {selectedNeighbor.recipe.variant === "house" && <label className="person-choice">Selected fireplace<select aria-label="Selected house fireplace" value={selectedNeighbor.recipe.fireplace===undefined ? "auto" : selectedNeighbor.recipe.fireplace ? "yes" : "no"} onChange={e=>setNeighbors(items=>items.map(p=>p.id===selectedId ? {...p,recipe:{...p.recipe,fireplace:e.target.value==="auto" ? undefined : e.target.value==="yes"}} : p))}><option value="auto">From layout seed</option><option value="yes">Present</option><option value="no">None</option></select></label>}
              <button className="hud-action" onClick={()=>{setNeighbors(items=>items.filter(p=>p.id!==selectedId));setSelectedId(null)}}>Remove selected building</button>
            </>}
          </Section>
          <Section {...section("Inspection")}>
            <label className="person-check"><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} />Isometric grid</label>
            <p className="person-hint">Click a building to select it and reveal its interior. Click it again or the ground to clear selection.</p>
            <label className="person-check"><input type="checkbox" checked={neighbor} onChange={e => { setNeighbor(e.target.checked); if (!e.target.checked && selectedId !== "workshop") setSelectedId(null) }} />Adjoining buildings</label>
            {neighbor && <p className="person-hint">{neighbors.length} neighbors. Select one to inspect or remove it.</p>}
            <p className="person-hint">Actual game tiles and characters for scale. All four views render the same buildings.</p>
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
        <footer className="person-panel-footer"><p className="person-hint">The relic enclosure uses this same model in the game. These drafts do not change the live game’s default recipe.</p><button className="hud-action" onClick={() => { setRecipe(DEFAULT_RECIPE);setNeighbors([]);setPlacement(null); setSelectedId(null); setNotice("Relic enclosure restored.") }}><RotateCcw size={12} />Restore relic enclosure</button></footer>
      </aside>
      <div className="person-preview" aria-label="Building preview">
        <div className="person-preview-toolbar hud-well">
          <div className="person-playback"><span className="person-hint">{EARLY_BUILDINGS.find(v => v.id === recipe.variant)?.name}{neighbor && neighbors.length ? ` + ${neighbors.length} buildings` : ""}</span><label>Zoom<select aria-label="Building preview zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[0.75, 1, 1.15, 1.5, 1.7].map(n => <option key={n} value={n}>{n}×</option>)}</select></label></div>
          <div className="person-view-buttons" aria-label="Building preview modes"><button className="hud-action" aria-pressed={!allViews} onClick={() => setAllViews(false)}>On the map</button><button className="hud-action" aria-pressed={allViews} onClick={() => setAllViews(true)}>All four</button></div>
        </div>
        <div className={`person-stage asset-building-stage ${allViews ? "asset-building-four" : ""}`}>
          {active && viewRecipes.map((viewRecipe, i) => <ProceduralMapScene key={viewRecipe.view} embedded recipe={viewRecipe} grid={grid} zoom={zoom} selectedId={selectedId} onSelect={setSelectedId} neighbor={neighbor ? neighbors : undefined} placement={placement} placementRotation={placementRotation} snapRoofs={snapRoofs} onPlace={placeBuilding} onPlacementStatus={setPlacementStatus} onGuideReady={i === 0 ? onGuideReady : undefined} />)}
        </div>
        <div className="person-animation-dock hud-well"><div className="person-direction-strip" aria-label="Building directions">{BUILDING_VIEWS.map(v => <button key={v.id} className="hud-building-tile person-direction asset-building-direction" aria-label={`Face ${v.name}`} aria-pressed={recipe.view === v.id} onClick={() => { update("view", v.id); setAllViews(false) }}><span>{["SE", "NE", "NW", "SW"][v.id]}</span><span>{v.name}</span></button>)}</div></div>
      </div>
    </div>
  </AssetEditorFrame>
}
