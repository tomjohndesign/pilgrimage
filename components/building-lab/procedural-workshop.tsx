"use client"

import { EntitySelect } from "@/components/workspace-navigation"

import { ChromeSelect, ChromeButton, ChromeCheckbox } from "@/components/ui/chrome-controls"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BUILDING_STYLE, DEFAULT_RECIPE, AVAILABLE_EARLY_BUILDINGS, REMOVED_BUILDING_TYPES, earlyBuildingRecipe, isEarlyBuilding, recipeSchema, type BuildingRecipe } from "@/lib/game/building-art/style"
import { BUILDING_VIEWS } from "@/lib/game/building-art/projection"
import { buildingDimensions } from "@/lib/game/building-art/dimensions"
import { hasBuildingLayouts } from "@/lib/game/building-layout"
import { RELIC_TABLE_TOP } from "@/lib/game/building-art/early-geometry"
import type { CaptureMapGuide } from "./map-comparison"
import { RotateCcw } from "lucide-react"
import { minimumBuildingSize } from "@/lib/game/building-art/style"
import { randomPreviewNeighbor, tavernPreviewNeighbors, type PreviewPlacement } from "@/lib/game/building-art/map-preview"
import { normalizeBuildingRotation, type BuildingRotation } from "@/lib/game/building-rotation"
import { previewRandomSeed } from "@/lib/game/preview-random"
import { AssetEditorFrame, AssetEditorWorkspace, AssetEditorSection, type AssetEditorNavigation } from "../asset-editor-frame"
import { Tuner } from "../game/property-controls"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { BUILD_CATALOG } from "@/lib/game/balance"
import { constructionBuilders, constructionWork } from "@/lib/game/construction"
import { MAX_BUILD_RATE, MONK_BUILD_RATE, SETTLER_BUILD_RATE } from "@/lib/game/build-labour"
import { CHURCH_FOOTPRINT } from "@/lib/game/shrine-upgrade"

const ProceduralMapScene = dynamic(() => import("./map-comparison").then(m => m.ProceduralMapScene), { ssr: false })
const STORAGE = "pilgrimage-procedural-buildings-v3"
const SCENE_VERSION = 4
const BUILD_TIME_CATALOG = [
  ...BUILD_CATALOG.filter(building => !building.retired),
  { id: "church", label: "Church upgrade", ...CHURCH_FOOTPRINT, retired: false },
  ...BUILD_CATALOG.filter(building => building.retired),
]

/** Uninterrupted construction at normal game speed, rounded up to whole seconds. */
function buildTime(buildType: string, w: number, d: number, rate: number, builders = 1): string {
  const seconds = Math.ceil(constructionWork(w, d, buildType) / (rate * builders))
  const minutes = Math.floor(seconds / 60), remainder = seconds % 60
  return minutes ? `${minutes}m${remainder ? ` ${remainder}s` : ""}` : `${seconds}s`
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a")
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** The primary building workflow uses the same deterministic model as the game.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/930-0 — Buildings
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/BX2-0 — Buildings · Tavern
 */
export function ProceduralWorkshop({ mode, onModeChange, active: workspaceActive = true }: AssetEditorNavigation & { active?: boolean }) {
  const [entityActive, setEntityActive] = useState(false)
  const active = workspaceActive && entityActive
  const [recipe, setRecipe] = useState<BuildingRecipe>({...earlyBuildingRecipe("tavern"),layoutSeed:18})
  const [ready, setReady] = useState(false)
  const [buildRate, setBuildRate] = useState(SETTLER_BUILD_RATE)
  const [allViews, setAllViews] = useState(false)
  const grid = true
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
  function showSheepPenExample() {
    setSlaughterDemo(0)
    setRecipe({...earlyBuildingRecipe("sheep-pen"),view:recipe.view})
    setNeighbors([]);setNeighbor(false);setSelectedId(null);setPlacement(null)
    setNotice("Eight places: three animals rest under thatch while five are gathered. Shepherds feed, water, tend and replenish the flock. Choose this example again to restart.")
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
  const [playbackRate,setPlaybackRate] = useState(3)
  const [slaughterDemo,setSlaughterDemo] = useState(0)
  const zoom = 1.15
  const [notice, setNotice] = useState("")
  const [controlsOpen, setControlsOpen] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const capture = useRef<CaptureMapGuide | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  const onGuideReady = useCallback((value: CaptureMapGuide | null) => { capture.current = value; setMapReady(Boolean(value)) }, [])
  const dimensions = buildingDimensions(recipe)
  const buildCrew = constructionBuilders(recipe.width, recipe.depth)
  const viewRecipes = useMemo(() => (allViews ? BUILDING_VIEWS : [BUILDING_VIEWS[recipe.view]]).map(v => ({ ...recipe, view: v.id })), [allViews, recipe])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE)
      if (saved) {
        const scene=JSON.parse(saved),result=recipeSchema.safeParse(scene.recipe)
        if (result.success && isEarlyBuilding(result.data.variant) && !REMOVED_BUILDING_TYPES.includes(result.data.variant)) {
          // Upgrade the previous pen preset once; keep subsequent custom dimensions.
          const oldPen = (scene.version ?? 3) < SCENE_VERSION && result.data.variant === "sheep-pen" && result.data.width === 5 && result.data.depth === 3
          setRecipe(oldPen ? {...result.data,depth:4} : result.data)
          if (oldPen) setNotice("Sheep pen expanded to 5 × 4 tiles, with the shed at one side.")
          if(Array.isArray(scene.neighbors)) setNeighbors(scene.neighbors.filter((p:PreviewPlacement)=>
            typeof p.id==="string" && p.id!=="workshop" && !REMOVED_BUILDING_TYPES.includes(p.recipe?.variant) && recipeSchema.safeParse(p.recipe).success && Number.isInteger(p.x) && Number.isInteger(p.z) && [0,1,2,3].includes(p.rotation)))
        }
      }
    } catch { /* The workshop also works without browser storage. */ }
    setReady(true)
  }, [])
  useEffect(() => { if (ready) { try { localStorage.setItem(STORAGE, JSON.stringify({version:SCENE_VERSION,recipe,neighbors})) } catch { /* Recipes can still be downloaded. */ } } }, [ready, recipe, neighbors])

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
      if (!isEarlyBuilding(parsed.variant) || REMOVED_BUILDING_TYPES.includes(parsed.variant)) throw new Error()
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

  return <AssetEditorFrame onSelectionChange={setEntityActive} mode={mode} onModeChange={onModeChange} label="Procedural building editor"
    onRandomize={() => { setRecipe(r=>({...r,layoutSeed:(previewRandomSeed()%65524+(r.layoutSeed ?? 0)+1)%65536,fireplace:undefined,hearthZ:undefined})); setNeighbors(items=>items.map(p=>{
      const next=p.anchor && items.every(item=>item.anchor) ? randomPreviewNeighbor(recipe.variant,previewRandomSeed()) : p.recipe
      return {...p,recipe:{...next,layoutSeed:previewRandomSeed()%65536,hearthZ:undefined,fireplace:undefined}}
    })); setSelectedId(null);setPlacement(null); setNotice(neighbor ? "Building layouts and adjoining buildings randomized." : "Core element positions and interior layout randomized.") }}
    randomizeDisabled={hasBuildingLayouts(recipe.variant) ? undefined : "This building form currently has a fixed layout"}
    version="Timber & earth" controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(!controlsOpen)}
    status={placement ? placementStatus : selectedId ? `${selectedNeighbor?.recipe.subject ?? recipe.subject} selected · click again or the ground to deselect` : notice || "Live procedural model · settings save in this browser"} detail={`${recipe.width} × ${recipe.depth} tiles · 4 directions`}>
    <AssetEditorWorkspace title="Building" controlsOpen={controlsOpen} onControlsClose={() => setControlsOpen(false)}
      controlsHeading={<span>Building</span>}
      controlsHeader={<></>}
      controls={<><AssetEditorSection title="Shape"><label className="person-choice">Form<EntitySelect aria-label="Building form" value={recipe.variant} staging={{ kind: "buildings", active: workspaceActive }} onChange={event => {
          const selected = AVAILABLE_EARLY_BUILDINGS.find(item => item.id === event.target.value)
          if (!selected) return
          setRecipe({ ...earlyBuildingRecipe(selected.id), view: recipe.view, seed: recipe.seed }); setSelectedId(null); setPlacement(null); setNotice(selected.description)
        }}>{AVAILABLE_EARLY_BUILDINGS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</EntitySelect></label></AssetEditorSection>
<AssetEditorSection title="Shape">
            <label className="person-choice">Name<input aria-label="Building name" value={recipe.subject} maxLength={160} onChange={e => update("subject", e.target.value)} /></label>
            {(["width", "depth"] as const).map(key => <label key={key} className="person-choice">Building {key}<ChromeSelect aria-label={`Building ${key}`} value={recipe[key]} onChange={e => update(key, Number(e.target.value))}>{Array.from({ length: 6-minimumBuildingSize(recipe.variant)[key] }, (_, i) => i+minimumBuildingSize(recipe.variant)[key]).map(n => <option key={n} value={n}>{n} tiles</option>)}</ChromeSelect></label>)}
            <Tuner label="Wall height" labelClassName="w-28" value={recipe.wallHeight} min={0.25} max={recipe.variant === "enclosure" ? 0.7 : 1.4} step={0.05} display={`${recipe.wallHeight.toFixed(2)} tiles`} onChange={value => update("wallHeight", value)} />
            {!["enclosure","garden","cross","lumberCamp"].includes(recipe.variant) && <Tuner label="Roof rise" labelClassName="w-28" value={recipe.roofRise} min={0.2} max={1.5} step={0.025} display={`${recipe.roofRise.toFixed(2)} tiles`} onChange={value => update("roofRise", value)} />}
            <p className="person-hint">{dimensions.width} × {dimensions.depth} occupied tiles. {recipe.variant === "enclosure" ? "Open sky and a gate on every side." : "One storey, sized beside a traveler."} No surrounding tile border.</p>
          </AssetEditorSection>
<AssetEditorSection title="Build times">
            <label className="person-choice">Builder type<ChromeSelect aria-label="Builder type" value={buildRate} onChange={e => setBuildRate(Number(e.target.value))}>
              <option value={SETTLER_BUILD_RATE}>Ordinary settler</option>
              <option value={MONK_BUILD_RATE}>Monk</option>
              <option value={MAX_BUILD_RATE}>Maximum-skill settler</option>
            </ChromeSelect></label>
            <div className="text-xs">Uninterrupted work · 1× game speed</div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-xs" aria-label="Current building build time">
              <dt>Current footprint</dt><dd>{recipe.width} × {recipe.depth} tiles</dd>
              <dt>One builder</dt><dd>{buildTime(recipe.variant, recipe.width, recipe.depth, buildRate)}</dd>
              <dt>Full crew · {buildCrew} {buildCrew === 1 ? "builder" : "builders"}</dt><dd>{buildTime(recipe.variant, recipe.width, recipe.depth, buildRate, buildCrew)}</dd>
            </dl>
            <Table className="text-xs" aria-label="All building build times">
              <TableHeader><TableRow>
                <TableHead className="px-1">Default building</TableHead>
                <TableHead className="px-1 text-right">Solo</TableHead>
                <TableHead className="px-1 text-right">Full crew</TableHead>
              </TableRow></TableHeader>
              <TableBody>{BUILD_TIME_CATALOG.map(building => {
                const crew = constructionBuilders(building.w, building.d)
                return <TableRow key={building.id}>
                  <TableCell className="px-1 whitespace-normal">{building.label}
                    <div className="text-ink-light">{building.w} × {building.d} · {crew} {crew === 1 ? "builder" : "builders"}{building.retired ? " · Retired" : ""}</div>
                  </TableCell>
                  <TableCell className="px-1 text-right tabular-nums">{buildTime(building.id, building.w, building.d, buildRate)}</TableCell>
                  <TableCell className="px-1 text-right tabular-nums">{buildTime(building.id, building.w, building.d, buildRate, crew)}</TableCell>
                </TableRow>
              })}</TableBody>
            </Table>
            <div className="text-xs">Starting chapel: already built.</div>
            <p className="person-hint">Times use the game’s construction work and crew limits. Solo means one builder; full crew fills every place with the selected builder type. Travel, rest and other duties add time. Faster game speeds shorten real-world waiting. Maximum-skill settlers work at the rate cap; other skilled settlers fall between that and ordinary settlers. Values round up to the next second.</p>
            <p className="person-hint">The current footprint estimate follows your shape edits. The table uses default game footprints, including scenery and retired buildings from older worlds. Preview edits do not change game defaults.</p>
          </AssetEditorSection>
{hasBuildingLayouts(recipe.variant) && <AssetEditorSection title="Layout">
            <label className="person-choice">Layout seed<input aria-label="Layout seed" type="number" min="0" max="65535" step="1" value={recipe.layoutSeed ?? 0} onChange={e => update("layoutSeed", Math.max(0, Math.min(65535, Math.trunc(Number(e.target.value) || 0))))} /></label>
            {recipe.variant === "house" && <label className="person-choice">Fireplace<ChromeSelect aria-label="House fireplace" value={recipe.fireplace === undefined ? "auto" : recipe.fireplace ? "yes" : "no"} onChange={e=>update("fireplace",e.target.value === "auto" ? undefined : e.target.value === "yes")}><option value="auto">From layout seed</option><option value="yes">Present</option><option value="no">None</option></ChromeSelect></label>}
            <ChromeButton className="hud-action" onClick={() => update("layoutSeed", ((recipe.layoutSeed ?? 0) + 1) % 65536)}>Next layout</ChromeButton>
            {recipe.variant === "house" && <p className="person-hint">One in four seeded house layouts has no fireplace. Choose None to preview an unheated house.</p>}
            <p className="person-hint">Vary gates, furniture positions and rotations. Larger rooms gain more tables, chests and stools. Click a building to inspect its beds and furniture.</p>
          </AssetEditorSection>}
<AssetEditorSection title="Appearance">
            <label className="person-choice">Variation seed<input aria-label="Variation seed" type="number" min="0" max="99999" step="1" value={recipe.seed} onChange={e => update("seed", Math.max(0, Math.min(99999, Math.trunc(Number(e.target.value) || 0))))} /></label>
            <p className="person-hint">Vary chimney masonry, wall timbers, plaster, thatch and the props beside the entrance.</p>
            <div className="person-palette">{Object.entries(BUILDING_STYLE.palette).map(([name, color]) => <span key={name} title={`${name}: ${color}`} style={{ background: color }} />)}</div>
          </AssetEditorSection>
<AssetEditorSection title="Scene">
            <ChromeButton className="hud-action" onClick={showTavernExample}>Tavern + two houses</ChromeButton>
            <ChromeButton className="hud-action" onClick={showInnExample}>Tavern + Inn</ChromeButton>
            <ChromeButton className="hud-action" onClick={showSheepPenExample}>Sheep pen + flock</ChromeButton>
            <label className="person-choice">Building to place<ChromeSelect aria-label="Building to place" value={placeType} onChange={e=>{setPlaceType(e.target.value);setPlacement(null)}}>
              <option value="current">Copy current recipe</option>{AVAILABLE_EARLY_BUILDINGS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </ChromeSelect></label>
            <ChromeButton className="hud-action" disabled={!mapReady} aria-pressed={Boolean(placement)} onClick={()=>placement ? setPlacement(null) : startPlacement()}>{placement ? "Cancel placement" : "Place building"}</ChromeButton>
            <ChromeButton className="hud-action" onClick={rotatePlacement}>Rotate placement · {placementRotation*90}°</ChromeButton>
            <label className="person-check"><ChromeCheckbox type="checkbox" checked={snapRoofs} onChange={e=>setSnapRoofs(e.target.checked)} />Snap rotation to neighboring roofs</label>
            <p className="person-hint">Click a tile to place the building. R turns it by 90°; Escape cancels. Green previews fit, red previews need more space.</p>
            {selectedNeighbor && <>
              <p role="status" className="person-hint">Selected: {selectedNeighbor.recipe.subject} · {selectedNeighbor.rotation*90}°</p>
              {selectedNeighbor.recipe.variant === "house" && <label className="person-choice">Selected fireplace<ChromeSelect aria-label="Selected house fireplace" value={selectedNeighbor.recipe.fireplace===undefined ? "auto" : selectedNeighbor.recipe.fireplace ? "yes" : "no"} onChange={e=>setNeighbors(items=>items.map(p=>p.id===selectedId ? {...p,recipe:{...p.recipe,fireplace:e.target.value==="auto" ? undefined : e.target.value==="yes"}} : p))}><option value="auto">From layout seed</option><option value="yes">Present</option><option value="no">None</option></ChromeSelect></label>}
              <ChromeButton className="hud-action" onClick={()=>{setNeighbors(items=>items.filter(p=>p.id!==selectedId));setSelectedId(null)}}>Remove selected building</ChromeButton>
            </>}
          </AssetEditorSection>
<AssetEditorSection title="Inspect">

            <p className="person-hint">Click a building to select it and reveal its interior. Click it again or the ground to clear selection.</p>
            <label className="person-check"><ChromeCheckbox type="checkbox" checked={neighbor} onChange={e => { setNeighbor(e.target.checked); if (!e.target.checked && selectedId !== "workshop") setSelectedId(null) }} />Adjoining buildings</label>
            {neighbor && <p className="person-hint">{neighbors.length} neighbors. Select one to inspect or remove it.</p>}
            <p className="person-hint">Actual game tiles and characters for scale. All four views render the same buildings.</p>
          </AssetEditorSection>
<AssetEditorSection title="Files">
            <div className="person-file-actions">
              <ChromeButton className="hud-action" disabled={!recipeSchema.safeParse(recipe).success} onClick={exportRecipe}>Export building recipe</ChromeButton>
              <label className="hud-action person-file-input">Import recipe<input ref={upload} aria-label="Import building recipe" type="file" accept="application/json,.json" onChange={e => { importRecipe(e.target.files?.[0]); e.target.value = "" }} /></label>
              <ChromeButton className="hud-action" disabled={!mapReady} onClick={exportViews}>Download four-view map sheet</ChromeButton>
            </div>
          </AssetEditorSection></>}
      controlsFooter={<><footer className="person-panel-footer"><p className="person-hint">Buildings use these same models in the game. These drafts do not change the live game’s default recipe.</p><ChromeButton className="hud-action" onClick={() => { setRecipe(DEFAULT_RECIPE);setNeighbors([]);setPlacement(null); setSelectedId(null); setNotice("House restored.") }}><RotateCcw size={12} />Restore house</ChromeButton></footer></>}
      toolbar={<><div className="person-playback"><span className="person-hint">{AVAILABLE_EARLY_BUILDINGS.find(v => v.id === recipe.variant)?.name}{neighbor && neighbors.length ? ` + ${neighbors.length} buildings` : ""}</span>{recipe.variant === "sheep-pen" && <label>Speed<ChromeSelect aria-label="Herding demo speed" value={playbackRate} onChange={e=>setPlaybackRate(Number(e.target.value))}>{[1,2,3,6].map(rate=><option key={rate} value={rate}>{rate}×</option>)}</ChromeSelect></label>}</div>
<div className="person-view-buttons" aria-label="Building preview modes">{recipe.variant === "sheep-pen" && <><ChromeButton className="hud-action" onClick={()=>{setSlaughterDemo(n=>-Math.abs(n)-1);setNotice("Sheep and goats are milked beside the flock. Workers carry milk in buckets to the public food platform.")}}>Show milking cycle</ChromeButton><ChromeButton className="hud-action" onClick={()=>{setSlaughterDemo(n=>Math.abs(n)+1);setNotice("The shepherd leads an animal to the work spot, collects three small trays of meat onto the public food platform, then replenishes the flock. Each tray adds 50 meat; milk arrives in buckets between harvests.")}}>Show slaughter cycle</ChromeButton></>}<ChromeSelect aria-label="Building view" value={allViews ? "all" : "map"} onChange={e => setAllViews(e.target.value === "all")}><option value="map">On the map</option><option value="all">All four</option></ChromeSelect></div></>}
      dock={<div className="person-animation-dock hud-well"><div className="person-direction-strip" aria-label="Building directions">{BUILDING_VIEWS.map(v => <ChromeButton key={v.id} className="hud-building-tile person-direction asset-building-direction" aria-label={`Face ${v.name}`} aria-pressed={recipe.view === v.id} onClick={() => { update("view", v.id); setAllViews(false) }}><span>{["SE", "NE", "NW", "SW"][v.id]}</span><span>{v.name}</span></ChromeButton>)}</div></div>}>
      <div className={`person-stage asset-building-stage ${allViews ? "asset-building-four" : ""}`}>
          {active && viewRecipes.map((viewRecipe, i) => <ProceduralMapScene slaughterDemo={slaughterDemo} playbackRate={playbackRate} key={viewRecipe.view} embedded recipe={viewRecipe} grid={grid} zoom={zoom} selectedId={selectedId} onSelect={setSelectedId} neighbor={neighbor ? neighbors : undefined} placement={placement} placementRotation={placementRotation} snapRoofs={snapRoofs} onPlace={placeBuilding} onPlacementStatus={setPlacementStatus} onGuideReady={i === 0 ? onGuideReady : undefined} />)}
        </div>
    </AssetEditorWorkspace>
  </AssetEditorFrame>
}
