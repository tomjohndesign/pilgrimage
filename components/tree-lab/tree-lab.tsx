"use client"

import dynamic from "next/dynamic"
import { AssetEditorFrame, AssetEditorWorkspace, AssetEditorSection, type AssetEditorNavigation } from "../asset-editor-frame"
import { LabSelect, LabSlider, labButton } from "../lab-controls"
import { useEffect, useState } from "react"
import { DEFAULT_FOLIAGE, FOLIAGE_SPECIES, isFoliageSpecies, type FoliageAtlas, type FoliageDesigns } from "@/lib/game/trees/foliage/design"
import { DEFAULT_FOLIAGE_ATLAS } from "@/lib/game/trees/foliage/assets"

import { TREE_SPECIES, type TreeSpeciesId } from "@/lib/game/trees/species"

/* three.js touches browser globals on import, so the canvases are client-only. */
const TreeLineup = dynamic(() => import("./tree-lineup").then((m) => m.TreeLineup), {
  ssr: false,
})
const TreeMapPreview = dynamic(
  () => import("./tree-map-preview").then((m) => m.TreeMapPreview),
  { ssr: false },
)

const MAP_SIZES = [32, 48, 64]

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

/** Tree foliage controls and previews in the shared playground.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/9VE-0 — Trees
 */
export function TreeLab({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const [controlsOpen, setControlsOpen] = useState(false)
  const [preview, setPreview] = useState("species")
  const species = TREE_SPECIES
  const [foliage, setFoliage] = useState<FoliageDesigns>(() => structuredClone(DEFAULT_FOLIAGE))
  const [atlas, setAtlas] = useState<FoliageAtlas>(DEFAULT_FOLIAGE_ATLAS)
  const [baking, setBaking] = useState(false)
  const [bakeError, setBakeError] = useState("")
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const target = window as unknown as { __foliageAtlas?: FoliageAtlas; __bakeTreeFoliage?: () => Promise<FoliageAtlas> }
    target.__bakeTreeFoliage = async () => {
      const { bakeFoliage } = await import("@/lib/game/trees/foliage/bake")
      return bakeFoliage(foliage)
    }
    if (JSON.stringify(foliage) === JSON.stringify(DEFAULT_FOLIAGE)) {
      setAtlas(DEFAULT_FOLIAGE_ATLAS); target.__foliageAtlas = DEFAULT_FOLIAGE_ATLAS
      setBaking(false); setBakeError("")
      return () => { delete target.__bakeTreeFoliage; delete target.__foliageAtlas }
    }
    setBaking(true); setBakeError("")
    const timer = setTimeout(async () => {
      try {
        const { bakeFoliage } = await import("@/lib/game/trees/foliage/bake")
        const result = await bakeFoliage(foliage, () => cancelled)
        if (!cancelled) { setAtlas(result); target.__foliageAtlas = result }
      } catch (error) {
        if (!cancelled) setBakeError(error instanceof Error ? error.message : "The trees could not be baked.")
      } finally { if (!cancelled) setBaking(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer); delete target.__bakeTreeFoliage; delete target.__foliageAtlas }
  }, [foliage, active])
  const [selected, setSelected] = useState<TreeSpeciesId>("oak")
  const [lineupSeed, setLineupSeed] = useState(1)
  const [lineupView, setLineupView] = useState(0)
  const [darkForest, setDarkForest] = useState(false)
  const [mapSeed, setMapSeed] = useState<number | null>(null)
  const [mapSize, setMapSize] = useState(48)
  const [copied, setCopied] = useState(false)

  // Roll the map seed client-side so server and client never disagree.
  useEffect(() => {
    if (mapSeed === null) setMapSeed(randomSeed())
  }, [mapSeed])

  // ?species=oak opens the lab on that species, so a tuning session is linkable.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("species")
    if (wanted && isFoliageSpecies(wanted)) {
      setSelected(wanted as TreeSpeciesId)
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(foliage, null, 2))
    setCopied(true)
  }


  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} label="Trees editor" version="" controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(value => !value)} status={bakeError || (baking ? "Updating foliage…" : copied ? "Species JSON copied" : species[selected].label)} detail="Preview draft">
    <AssetEditorWorkspace title="Trees" controlsOpen={controlsOpen} onControlsClose={() => setControlsOpen(false)}
      controls={<>
        <AssetEditorSection title="Foliage">
          <LabSelect label="Species" value={selected} options={Object.fromEntries(FOLIAGE_SPECIES.map(id => [id, species[id].label]))} onChange={value => setSelected(value as TreeSpeciesId)} />
          {isFoliageSpecies(selected) && ([
            ["height", "Height", 1.4, 3.25, 0.05], ["spread", "Branch spread", 0.55, 1.2, 0.05],
            ["density", "Foliage density", 0.4, 1.4, 0.05], ["leafSize", "Leaf clusters", 0.6, 1.3, 0.05],
          ] as const).map(([key, label, min, max, step]) => <LabSlider key={key} label={label} value={foliage[selected][key]} min={min} max={max} step={step}
            onChange={value => setFoliage(old => ({ ...old, [selected]: { ...old[selected], [key]: value } }))} />)}
        </AssetEditorSection>
        <AssetEditorSection title="Forest">
          <LabSelect label="Map size" value={String(mapSize)} options={Object.fromEntries(MAP_SIZES.map(size => [size, `${size} × ${size}`]))} onChange={value => setMapSize(Number(value))} />
          <button className={labButton} onClick={() => { setMapSeed(randomSeed()); setPreview("forest") }}>New map</button>
          <p className="person-hint">Drag to pan, scroll to zoom, Q and E to rotate, O to cycle outlines.</p>
        </AssetEditorSection>
        <AssetEditorSection title="Files"><button className={labButton} onClick={() => { void copyJson().catch(() => setBakeError("Could not copy species JSON.")) }}>Copy species JSON</button><button className={labButton} onClick={() => setFoliage(structuredClone(DEFAULT_FOLIAGE))}>Reset foliage</button></AssetEditorSection>
      </>}
      toolbar={<>
        <div className="person-view-buttons">{["species", "all", "forest"].map(value => <button key={value} className={labButton} aria-pressed={preview === value} onClick={() => setPreview(value)}>{value === "all" ? "All species" : value === "forest" ? "Forest" : "Species"}</button>)}</div>
        {preview !== "forest" && <><label className="person-check"><input type="checkbox" checked={darkForest} onChange={event => setDarkForest(event.target.checked)} />Dark forest</label><button className={labButton} onClick={() => setLineupView(value => (value + 1) % 4)}>Rotate</button><button className={labButton} onClick={() => setLineupSeed(randomSeed())}>New variations</button></>}
      </>}
      dock={null}>
      <div className="person-stage playground-stage">{active && (preview === "forest" ? <div className="workspace-forest-preview">{mapSeed !== null && <TreeMapPreview seed={mapSeed} size={mapSize} atlas={atlas} />}</div> : <div className="workspace-tree-lineup">{(preview === "all" ? [0, 1] : [0]).map(speciesPage => <div key={speciesPage}>
        <div className="aspect-[3/1] min-h-52"><TreeLineup species={preview === "all" ? "all" : selected} seed={lineupSeed} view={lineupView} darkForest={darkForest} speciesPage={speciesPage} atlas={atlas} /></div>
        {preview === "all" && <div className="grid grid-cols-3 text-center text-xs">{FOLIAGE_SPECIES.slice(speciesPage * 3, speciesPage * 3 + 3).map(id => <span key={id}>{species[id].label}</span>)}</div>}
      </div>)}</div>)}</div>
    </AssetEditorWorkspace>
  </AssetEditorFrame>
}
