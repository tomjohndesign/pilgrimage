"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"
import { LabSelect, LabSlider, labButton, labInput } from "@/components/lab-controls"
import { buildCatalog, DEFAULT_BALANCE, RULE_FIELDS } from "@/lib/game/balance"
import { useBuildStore } from "@/lib/game/build-store"
import { useCameraStore } from "@/lib/game/camera-store"
import { placementSite } from "@/lib/game/building-placement-layout"
import { rotatedFootprint } from "@/lib/game/building-rotation"
import { footprintGrading } from "@/lib/game/map/elevation"
import { parseSeed, randomSeed } from "@/lib/game/rng"
import { generateRelic } from "@/lib/game/relic"
import { completeConstruction, createSettlement, placementError, purchaseStructure, settlementMap, type Settlement } from "@/lib/game/settlement"
import { DEFAULT_PLACEMENT_LAB, PLACEMENT_LAB_LIMITS, normalizePlacementLab, placementLabBalance, placementLabMap, type PlacementLabSettings } from "@/lib/game/placement-lab"

const PlacementScene = dynamic(() => import("./placement-scene").then(m => m.PlacementScene), { ssr: false })

const LIMIT_FIELD = RULE_FIELDS.find(field => field.key === "levellingLimit")!
const VIEW_NAMES = ["North-east", "North-west", "South-west", "South-east"]

/** Hillside placement study: the real purchase rules with a tunable levelling limit,
 * on a generated slope, so grading can be watched building by building. */
export function PlacementLab() {
  const [settings, setSettings] = useState<PlacementLabSettings>(DEFAULT_PLACEMENT_LAB)
  const [draft, setDraft] = useState<PlacementLabSettings>(DEFAULT_PLACEMENT_LAB)
  const [seedDraft, setSeedDraft] = useState(String(DEFAULT_PLACEMENT_LAB.seed))
  const [limit, setLimit] = useState(DEFAULT_BALANCE.rules.levellingLimit)
  const [view, setView] = useState(0)
  const [grid, setGrid] = useState(true)
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
    useBuildStore.getState().setTool("house")
    return () => { useBuildStore.getState().setTool(null); useCameraStore.getState().setHovered(null) }
  }, [])
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
  return <main className="min-h-screen bg-[#14100a] px-4 py-8 text-parchment sm:px-8">
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <header>
        <Link href="/assets" className="font-display text-[10px] uppercase tracking-[3px] text-gold hover:text-gold-light">← Assets</Link>
        <h1 className="mt-4 font-display text-2xl font-semibold uppercase tracking-[4px] sm:text-3xl">Placement playground</h1>
        <p className="mt-2 text-parchment-dark">Buildings no longer need perfectly level ground. A purchase cuts and fills its footprint to the height under its centre, as long as no tile or corner moves more than the levelling limit.</p>
        <p className="mt-2 max-w-4xl text-sm text-parchment-dark">This study founds a hovel on generated hills and applies the game’s own purchase rules with unlimited supplies. The ghost turns red where the pad would move too much earth, break off as a cliff, or leave its entrance tile too far above or below the floor. The levelling limit here is the same rule as in Game tuning; the slider only changes this page.</p>
      </header>
      <section aria-label="Placement settings" className="border border-rule bg-parchment p-4 text-ink sm:p-5">
        <div className="grid grid-cols-2 items-end gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-ink-light">Hillside seed<input className={labInput} value={seedDraft} inputMode="numeric" aria-invalid={seed === null}
            onChange={e => setSeedDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && seed !== null) apply(seed) }} /></label>
          <LabSlider label="Hill height" value={draft.relief} {...PLACEMENT_LAB_LIMITS.relief} onChange={relief => setDraft(old => ({ ...old, relief }))} />
          <LabSlider label="Hill wavelength (tiles)" value={draft.wavelength} {...PLACEMENT_LAB_LIMITS.wavelength} onChange={wavelength => setDraft(old => ({ ...old, wavelength }))} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={labButton} disabled={seed === null} onClick={() => seed !== null && apply(seed)}>Generate</button>
            <button type="button" className={labButton} onClick={() => apply((settings.seed + 1) >>> 0)}>Next seed</button>
            <button type="button" className={labButton} onClick={() => apply(randomSeed())}>Random</button>
          </div>
          <LabSlider label={LIMIT_FIELD.label} value={limit} min={LIMIT_FIELD.min} max={LIMIT_FIELD.max} step={LIMIT_FIELD.step} onChange={setLimit} />
          <LabSelect label="Structure" value={tool ?? ""} options={Object.fromEntries(catalog.map(def => [def.id, `${def.label} · ${def.w} × ${def.d}`]))} onChange={value => useBuildStore.getState().setTool(value)} />
          <div className="flex flex-col gap-1 text-xs text-ink-light">Rotation · {rotation * 90}°
            <div className="flex gap-2">
              <button type="button" className={labButton} onClick={() => useBuildStore.getState().rotateBuilding(-1)}>↺ Left</button>
              <button type="button" className={labButton} onClick={() => useBuildStore.getState().rotateBuilding(1)}>↻ Right</button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-xs text-ink-light">View · {VIEW_NAMES[view]}
            <div className="flex gap-2">
              <button type="button" className={labButton} aria-label="Turn view left" onClick={() => setView(v => (v + 3) % 4)}>↺</button>
              <button type="button" className={labButton} aria-label="Turn view right" onClick={() => setView(v => (v + 1) % 4)}>↻</button>
              <button type="button" className={labButton} disabled={!placed} onClick={undo}>Undo</button>
              <button type="button" className={labButton} disabled={!placed} onClick={() => { setSettlement(createSettlement(balance)); setStatus("Buildings cleared.") }}>Clear</button>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-light">{pending ? "Terrain changed — generate to rebuild the hillside. This clears placed buildings." : `Showing hillside ${settings.seed} with ${placed} placed ${placed === 1 ? "building" : "buildings"}.`} The default limit is {LIMIT_FIELD.default}; the game rejects placements above it with the same message shown here.</p>
      </section>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-gold" checked={grid} onChange={e => setGrid(e.target.checked)} />Show tile grid</label>
        <span className="text-xs text-parchment-dark">Green pad = the purchase would level here. Red = refused for the reason shown below.</span>
      </div>
      <p role="status" className="text-sm text-parchment-dark">{status || "Hover to preview, click to place."}</p>
      <div className="relative h-[560px] w-full border border-rule bg-[#14100a]">
        <PlacementScene map={map} relic={relic} balance={balance} buildType={tool} resources={settlement.resources} view={view} grid={grid} onPlace={place} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border border-rule bg-parchment p-4 text-xs text-ink md:grid-cols-5" aria-label="Pad under the cursor">
        {[["Tile", hovered ? `${hovered.x}, ${hovered.z}` : "—"],
          ["Floor height", candidate ? candidate.grading.foundation.toFixed(2) : "—"],
          ["Deepest cut", candidate ? candidate.grading.cut.toFixed(2) : "—"],
          ["Tallest fill", candidate ? candidate.grading.fill.toFixed(2) : "—"],
          ["Verdict", verdict]].map(([label, value]) =>
          <div key={label}><dt className="text-ink-light">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      <p className="text-xs text-parchment-dark">Heights are in tile units relative to the map base. Cut and fill measure the highest and lowest footprint tile or corner against the floor. A pad also needs every neighbouring tile within the cliff cutoff of the floor, or the graded edge would break off as a cliff. Existing pads and water never move.</p>
    </div>
  </main>
}
