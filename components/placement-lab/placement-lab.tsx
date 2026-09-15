"use client"

import { ChromeButton, ChromeCheckbox } from "@/components/ui/chrome-controls"
import { AssetEditorFrame, AssetEditorWorkspace, AssetEditorSection, type AssetEditorNavigation } from "@/components/asset-editor-frame"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"
import { LabSeedInput, LabSeedActions, LabSelect, LabSlider, labButton } from "@/components/lab-controls"
import { buildCatalog, DEFAULT_BALANCE, RULE_FIELDS } from "@/lib/game/balance"
import { useBuildStore } from "@/lib/game/build-store"
import { useCameraStore } from "@/lib/game/camera-store"
import { placementSite } from "@/lib/game/building-placement-layout"
import { rotatedFootprint } from "@/lib/game/building-rotation"
import { footprintGrading } from "@/lib/game/map/elevation"
import { parseSeed } from "@/lib/game/rng"
import { generateRelic } from "@/lib/game/relic"
import { completeConstruction, createSettlement, placementError, purchaseStructure, settlementMap, type Settlement } from "@/lib/game/settlement"
import { DEFAULT_PLACEMENT_LAB, PLACEMENT_LAB_LIMITS, normalizePlacementLab, placementLabBalance, placementLabMap, type PlacementLabSettings } from "@/lib/game/placement-lab"

const PlacementScene = dynamic(() => import("./placement-scene").then(m => m.PlacementScene), { ssr: false })

const LIMIT_FIELD = RULE_FIELDS.find(field => field.key === "levellingLimit")!
const VIEW_NAMES = ["North-east", "North-west", "South-west", "South-east"]

/** Hillside placement study: the real purchase rules with a tunable levelling limit,
 * on a generated slope, so grading can be watched building by building.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/9LH-0 — Building placement
 */
export function PlacementLab({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const [controlsOpen, setControlsOpen] = useState(false)
  const [settings, setSettings] = useState<PlacementLabSettings>(DEFAULT_PLACEMENT_LAB)
  const [draft, setDraft] = useState<PlacementLabSettings>(DEFAULT_PLACEMENT_LAB)
  const [seedDraft, setSeedDraft] = useState(String(DEFAULT_PLACEMENT_LAB.seed))
  const [limit, setLimit] = useState(DEFAULT_BALANCE.rules.levellingLimit)
  const [view, setView] = useState(0)
  const grid = true
  const [status, setStatus] = useState("")
  const balance = useMemo(() => placementLabBalance(limit), [limit])
  const baseMap = useMemo(() => placementLabMap(settings), [settings])
  const relic = useMemo(() => generateRelic(settings.seed), [settings.seed])
  const [settlement, setSettlement] = useState<Settlement>(() => createSettlement(balance))
  const map = useMemo(() => settlementMap(baseMap, settlement), [baseMap, settlement])
  const catalog = useMemo(() => buildCatalog(balance).filter(def => !def.retired), [balance])
  const tool = useBuildStore(s => s.tool)
  const rotation = useBuildStore(s => s.rotation)
  const hovered = useCameraStore(s => s.hovered)
  const def = catalog.find(item => item.id === tool) ?? null
  useEffect(() => {
    if (!active) return
    useBuildStore.getState().setTool("house")
    return () => { useBuildStore.getState().setTool(null); useCameraStore.getState().setHovered(null) }
  }, [active])
  const candidate = useMemo(() => {
    if (!def || !hovered) return null
    const site = placementSite(map, def, hovered, rotation)
    return { grading: footprintGrading(map, { ...site, ...rotatedFootprint(def, site.rotation) }), error: placementError(map, def, hovered, balance, rotation) }
  }, [map, def, hovered, rotation, balance])
  const seed = parseSeed(seedDraft)
  const pending = seed !== settings.seed || draft.relief !== settings.relief || draft.wavelength !== settings.wavelength
  const apply = (newSeed: number) => {
    const next = normalizePlacementLab({ ...draft, seed: newSeed })
    setSettings(next); setDraft(next); setSeedDraft(String(next.seed))
    setSettlement(createSettlement(balance))
    setStatus(`Generated hillside ${next.seed}; buildings cleared.`)
  }
  const place = (at: { x: number; z: number }) => {
    if (!def) return
    const grading = candidate?.grading ?? footprintGrading(map, { ...at, ...rotatedFootprint(def, rotation) })
    const result = purchaseStructure(settlement, baseMap, [], [relic], def.id, at, balance, 0, rotation)
    if (result.error) { setStatus(result.error); return }
    // The study is about the ground, so skip the building work itself.
    setSettlement(completeConstruction(result.settlement))
    setStatus(`${def.label} placed at ${at.x}, ${at.z}: cut ${grading.cut.toFixed(2)}, fill ${grading.fill.toFixed(2)}.`)
  }
  const undo = () => {
    // Replay the remaining purchases so the terrain forgets the undone pad.
    let next = createSettlement(balance)
    for (const building of settlement.structures.slice(0, -1)) {
      const result = purchaseStructure(next, baseMap, [], [relic], building.buildType!, building, balance, 0, building.rotation)
      if (!result.error) next = result.settlement
    }
    setSettlement(completeConstruction(next)); setStatus("Last building removed.")
  }
  const placed = settlement.structures.length
  const verdict = !def ? "Choose a structure." : !hovered ? "Hover the hillside to preview a pad." : candidate?.error ?? "Click to build and level the pad."
  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} label="Building placement editor" version="Building placement" controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(value => !value)} status={status || "Hover to preview, click to place."} detail={`${placed} buildings · seed ${settings.seed}`}>
    <AssetEditorWorkspace title="Building placement" controlsOpen={controlsOpen} onControlsClose={() => setControlsOpen(false)}
      controls={<><AssetEditorSection title="Terrain & building"><div className="person-file-actions">
          <LabSeedInput value={seedDraft} onChange={setSeedDraft} onApply={apply} />
          <LabSlider label="Hill height" value={draft.relief} {...PLACEMENT_LAB_LIMITS.relief} onChange={relief => setDraft(old => ({ ...old, relief }))} />
          <LabSlider label="Hill wavelength (tiles)" value={draft.wavelength} {...PLACEMENT_LAB_LIMITS.wavelength} onChange={wavelength => setDraft(old => ({ ...old, wavelength }))} />
          <div className="flex flex-wrap gap-2">
            <LabSeedActions draft={seedDraft} seed={settings.seed} onApply={apply} />
          </div>
          <LabSlider label={LIMIT_FIELD.label} value={limit} min={LIMIT_FIELD.min} max={LIMIT_FIELD.max} step={LIMIT_FIELD.step} onChange={setLimit} />
          <LabSelect navigation label="Structure" value={tool ?? ""} options={Object.fromEntries(catalog.map(def => [def.id, `${def.label} · ${def.w} × ${def.d}`]))} onChange={value => useBuildStore.getState().setTool(value)} />
          <div className="flex flex-col gap-1 text-xs text-ink-light">Rotation · {rotation * 90}°
            <div className="flex gap-2">
              <ChromeButton type="button" className={labButton} onClick={() => useBuildStore.getState().rotateBuilding(-1)}>↺ Left</ChromeButton>
              <ChromeButton type="button" className={labButton} onClick={() => useBuildStore.getState().rotateBuilding(1)}>↻ Right</ChromeButton>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-xs text-ink-light">View · {VIEW_NAMES[view]}
            <div className="flex gap-2">
              <ChromeButton type="button" className={labButton} aria-label="Turn view left" onClick={() => setView(v => (v + 3) % 4)}>↺</ChromeButton>
              <ChromeButton type="button" className={labButton} aria-label="Turn view right" onClick={() => setView(v => (v + 1) % 4)}>↻</ChromeButton>
              <ChromeButton type="button" className={labButton} disabled={!placed} onClick={undo}>Undo</ChromeButton>
              <ChromeButton type="button" className={labButton} disabled={!placed} onClick={() => { setSettlement(createSettlement(balance)); setStatus("Buildings cleared.") }}>Clear</ChromeButton>
            </div>
          </div>
        </div>
<p className="person-hint">Apply the seed after changing terrain. Regenerating clears placed buildings. The levelling limit uses the same rule as the game.</p></AssetEditorSection>
        <AssetEditorSection title="Pad under the cursor">{[["Tile", hovered ? `${hovered.x}, ${hovered.z}` : "—"],
          ["Floor height", candidate ? candidate.grading.foundation.toFixed(2) : "—"],
          ["Deepest cut", candidate ? candidate.grading.cut.toFixed(2) : "—"],
          ["Tallest fill", candidate ? candidate.grading.fill.toFixed(2) : "—"],
          ["Verdict", verdict]].map(([label, value]) =>
          <div key={label}><dt className="text-ink-light">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}</AssetEditorSection>
        </>}
      toolbar={<>
</>}
      dock={<div className="person-animation-dock hud-well"><><span className="person-hint">{verdict}</span></></div>}>
      <div className="person-stage asset-building-stage">{active && <><div className="asset-building-viewport">
        <PlacementScene map={map} relic={relic} balance={balance} buildType={tool} resources={settlement.resources} view={view} grid={grid} onPlace={place} />
      </div></>}</div>
    </AssetEditorWorkspace>
  </AssetEditorFrame>
}
