"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { AssetEditorFrame, AssetEditorWorkspace, AssetEditorSection, AssetEditorHelp, type AssetEditorNavigation } from "../asset-editor-frame"
import { EntitySelect } from "../workspace-navigation"
import { ChromeButton, ChromeCheckbox, ChromeSelect } from "../ui/chrome-controls"
import { LabSelect, LabSlider, labInput } from "../lab-controls"
import { randomSeed, parseSeed } from "@/lib/game/rng"
import { experimentSprite } from "@/lib/game/overlap-experiment-assets"
import {
  createExperiment, experimentSuite, experimentJson, parseExperiments, refreshExperimentBaseline, reviseExperiment, moveExperimentActor, editExperimentActor,
  EXPERIMENT_STORAGE, EXPERIMENT_SCENARIOS, EXPERIMENT_PEOPLE, EXPERIMENT_TRANSPORT, EXPERIMENT_KIND_LABELS, EXPERIMENT_CLIPS, TRANSPORT_SCENARIOS,
  type ExperimentActor, type ExperimentScenario, type OverlapExperiment, type OverlapExperimentSuite,
} from "@/lib/game/overlap-experiments"

const OverlapScene = dynamic(() => import("./overlap-scene").then(m => m.OverlapScene), { ssr: false })
const transportStarters = () => TRANSPORT_SCENARIOS.map((scenario, i) => createExperiment(20260930 + i, scenario, 7, experimentSprite))
const initialSuite = () => experimentSuite(transportStarters())
const named = (values: readonly string[]) => Object.fromEntries(values.map(value => [value, value[0].toUpperCase() + value.slice(1)]))

/** Human-reviewed ordering examples live in the existing asset playground. */
export function OverlapExperiments({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const [suite, setSuite] = useState(initialSuite)
  const [selectedCase, setSelectedCase] = useState(suite.tests[0].id)
  const [selectedActor, setSelectedActor] = useState("actor-1")
  const [loaded, setLoaded] = useState(false), [controlsOpen, setControlsOpen] = useState(false)
  const [status, setStatus] = useState("Loading saved experiments…")
  const [manual, setManual] = useState(true), [solid, setSolid] = useState(true), [labels, setLabels] = useState(true)
  const [scenario, setScenario] = useState<ExperimentScenario>("convoy"), [seed, setSeed] = useState("20261006")
  const [count, setCount] = useState(7), [batch, setBatch] = useState(5), [json, setJson] = useState("")
  const [history, setHistory] = useState<OverlapExperimentSuite[]>([])
  const [readyScene, setReadyScene] = useState("")
  const file = useRef<HTMLInputElement>(null)
  const scene = suite.tests.find(test => test.id === selectedCase) ?? suite.tests[0]
  const sceneKey = scene.id + scene.actors.map(a => a.sprite.url).join("|")
  const actor = scene.actors.find(item => item.id === selectedActor) ?? scene.actors[0]
  const connected = (scene.connections ?? []).some(c => c.source === actor.id || c.animal === actor.id || c.driver === actor.id)
  const transportActor = (EXPERIMENT_TRANSPORT as readonly string[]).includes(actor.kind)
  const order = manual ? scene.manualOrder : scene.engineOrder
  const reviewed = suite.tests.filter(test => test.reviewed).length
  useEffect(() => {
    try {
      const saved = localStorage.getItem(EXPERIMENT_STORAGE)
      if (saved) {
        const restored = refreshExperimentBaseline(parseExperiments(saved))
        // Upgrade the first prototype's starter collection without discarding any reviews.
        const legacy = restored.tests.some(test => test.id === "procession-20260921") && !restored.tests.some(test => (TRANSPORT_SCENARIOS as readonly string[]).includes(test.scenario))
        if (legacy && restored.tests.length <= 94) restored.tests = [...transportStarters(), ...restored.tests]
        setSuite(restored); setSelectedCase(restored.tests[0].id)
      }
      setStatus(saved ? "Restored your collection, including complete transport teams." : "Six transport cases ready, with animals, drivers, handlers and leads.")
    } catch (error) { setStatus(`Could not restore draft: ${error instanceof Error ? error.message : String(error)}`) }
    setLoaded(true)
  }, [])
  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(EXPERIMENT_STORAGE, experimentJson(suite)) }
    catch { setStatus("Local saving unavailable. Copy or download JSON to keep your work.") }
  }, [loaded, suite])
  const commit = (next: OverlapExperimentSuite) => { setHistory(old => [...old.slice(-19), suite]); setSuite(next) }
  const update = (next: OverlapExperiment) => commit({ ...suite, tests: suite.tests.map(test => test.id === scene.id ? next : test) })
  const editActor = (patch: Partial<ExperimentActor>) => update(editExperimentActor(scene, actor.id, patch))
  const changeAsset = (patch: Partial<Pick<ExperimentActor, "kind" | "variant" | "clip">>) => {
    const next = { ...actor, ...patch }
    if ((EXPERIMENT_TRANSPORT as readonly string[]).includes(next.kind) && next.clip !== "idle" && next.clip !== "walk") next.clip = "walk"
    editActor({ ...patch, clip: next.clip, frame: 0, sprite: experimentSprite(next.kind, next.variant, next.clip) })
  }
  const move = (delta: number) => {
    setManual(true)
    update({ ...scene, reviewed: false, manualOrder: moveExperimentActor(scene.manualOrder, actor.id, delta) })
  }
  const add = (amount: number, random = false) => {
    const start = random ? randomSeed() : parseSeed(seed)
    if (start === null || suite.tests.length + amount > 100) return
    const tests = Array.from({ length: amount }, (_, i) => {
      const test = createExperiment((start + i) >>> 0, scenario, count, experimentSprite)
      // Repeating a seed intentionally creates another independently reviewable copy.
      return { ...test, id: `${test.id}-${suite.tests.length + i + 1}` }
    })
    const ids = new Set(suite.tests.map(test => test.id))
    tests.forEach(test => { while (ids.has(test.id)) test.id += "-copy"; ids.add(test.id) })
    commit({ ...suite, tests: [...suite.tests, ...tests] }); setSelectedCase(tests[0].id); setSeed(String((start + amount) >>> 0))
    setStatus(`Added ${amount} experiment${amount === 1 ? "" : "s"}.`)
  }
  const loadJson = (text: string) => {
    try {
      const next = refreshExperimentBaseline(parseExperiments(text))
      commit(next); setSelectedCase(next.tests[0].id); setSelectedActor(next.tests[0].actors[0].id); setJson("")
      setStatus(`Loaded ${next.tests.length} experiments. Undo restores the previous collection.`)
    } catch (error) { setStatus(`Import failed: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const copy = async () => {
    const text = experimentJson(suite)
    try { await navigator.clipboard.writeText(text); setStatus(`Copied all ${suite.tests.length} experiments (${reviewed} reviewed).`) }
    catch { setJson(text); setStatus("Clipboard unavailable. JSON is in the field below; select and copy it.") }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([experimentJson(suite)], { type: "application/json" }))
    const link = document.createElement("a"); link.href = url; link.download = "overlap-experiments.json"; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus(`Downloaded ${suite.tests.length} experiments.`)
  }
  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} label="Overlap experiments" version="Overlap experiments"
    controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(value => !value)} status={status}
    detail={`${reviewed} / ${suite.tests.length} reviewed · drafts save locally`}>
    <AssetEditorWorkspace title="Overlap experiments" controlsOpen={controlsOpen} onControlsClose={() => setControlsOpen(false)}
      toolbar={<><ChromeSelect aria-label="Ordering preview" value={manual ? "manual" : "game"} onChange={event => setManual(event.target.value === "manual")}
        options={[{ value: "manual", label: "Manual order" }, { value: "game", label: "Game order" }]} />
        <ChromeSelect aria-label="Camera view" value={String(scene.view)} onChange={event => update(reviseExperiment(scene, { view: Number(event.target.value) }))}
          options={["North-east", "North-west", "South-west", "South-east"].map((label, i) => ({ value: String(i), label }))} />
        <label className="person-check"><ChromeCheckbox aria-label="Solid colors" checked={solid} onChange={event => setSolid(event.target.checked)} />Solid colors</label>
        <label className="person-check"><ChromeCheckbox aria-label="Labels" checked={labels} onChange={event => setLabels(event.target.checked)} />Labels</label></>}
      controls={<>
        <EntitySelect autoSelect value={scene.id} options={suite.tests.map((test, i) => ({ value: test.id, label: `${i + 1}. ${test.name}${test.reviewed ? " ✓" : ""}`,
          group: (test.connections ?? []).length ? "Transport teams" : "Individual studies" }))}
          onChange={event => { setSelectedCase(event.target.value); setStatus("Experiment selected. Poses are frozen for comparison.") }} />
        <AssetEditorSection title="Order">
          <p className="person-hint">Read the list from back to front. Select any row, including fully hidden characters, then move it backward or forward. The canvas switches to your manual order. Mark reviewed only after checking the result. Game order always shows the unmodified rules.</p>
          <div className="flex items-center justify-between text-xs"><span>Back → front</span><span>{scene.reviewed ? "Reviewed" : "Needs review"}</span></div>
          <ol aria-label="Back-to-front character order" className="flex flex-col gap-1">{order.map((id, i) => {
            const item = scene.actors.find(a => a.id === id)!
            return <li key={id}><ChromeButton className="chrome-nav-row" aria-pressed={actor.id === id} onClick={() => setSelectedActor(id)}>
              <span aria-hidden="true" style={{ color: item.color }}>●</span><span>{i + 1}. {item.label}</span></ChromeButton></li>
          })}</ol>
          <div className="flex flex-wrap gap-2"><ChromeButton className="hud-action" disabled={scene.manualOrder[0] === actor.id} onClick={() => move(-1)}>← Backward</ChromeButton>
            <ChromeButton className="hud-action" disabled={scene.manualOrder.at(-1) === actor.id} onClick={() => move(1)}>Forward →</ChromeButton></div>
          <div className="flex flex-wrap gap-2"><ChromeButton className="hud-action" onClick={() => { setManual(true); update({ ...scene, manualOrder: [...scene.engineOrder], reviewed: false }) }}>Reset to game order</ChromeButton>
            <ChromeButton className="hud-action" disabled={scene.reviewed || !loaded || !manual || readyScene !== sceneKey} onClick={() => { update({ ...scene, reviewed: true }); setStatus("Manual order marked reviewed and saved.") }}>Mark reviewed</ChromeButton></div>
          <label className="person-choice">Notes<textarea className={labInput} rows={3} maxLength={4000} value={scene.notes}
            placeholder="Which overlap looks wrong, and why?" onChange={event => update({ ...scene, notes: event.target.value })} /></label>
        </AssetEditorSection>
        <AssetEditorSection title="Character">
          <label className="person-choice">Label<input className={labInput} value={actor.label} maxLength={100} onChange={event => { if (event.target.value.trim()) editActor({ label: event.target.value }) }} /></label>
          {connected ? <div className="person-choice">Transport part<span>{EXPERIMENT_KIND_LABELS[actor.kind]}</span></div> :
            <LabSelect label="Character" value={actor.kind} options={{ ...named(EXPERIMENT_PEOPLE), [actor.kind]: EXPERIMENT_KIND_LABELS[actor.kind] }} onChange={kind => changeAsset({ kind: kind as ExperimentActor["kind"] })} />}
          <LabSlider label="Variant" value={actor.variant} min={0} max={5} step={1} onChange={variant => changeAsset({ variant })} />
          <LabSelect label="Pose" value={actor.clip} options={named(transportActor ? ["idle", "walk"] : EXPERIMENT_CLIPS)} onChange={clip => changeAsset({ clip: clip as ExperimentActor["clip"] })} />
          <LabSlider label="Pose frame" value={actor.frame} min={0} max={Math.max(1, actor.sprite.frames - 1)} step={1} onChange={frame => editActor({ frame: Math.min(actor.sprite.frames - 1, frame) })} />
          <LabSlider label={connected ? "Team X" : "World X"} value={actor.x} min={-4} max={4} step={.01} onChange={x => editActor({ x })} />
          <LabSlider label={connected ? "Team Z" : "World Z"} value={actor.z} min={-4} max={4} step={.01} onChange={z => editActor({ z })} />
          <LabSlider label={connected ? "Team facing" : "Facing"} value={actor.heading} min={0} max={360} step={22.5} suffix="°" onChange={heading => editActor({ heading })} />
          <LabSlider label={connected ? "Team scale" : "Scale"} value={actor.scale} min={.5} max={2} step={.05} onChange={scale => editActor({ scale })} />
          <p className="person-hint">Transport placement, facing and scale move the whole connected team, preserving the hitch and lead spacing. Each cart, driver, animal and handler still has its own manual draw order. Poses are frozen snapshots; geometry or camera edits clear the reviewed flag.</p>
        </AssetEditorSection>
        <AssetEditorSection title="Generate tests">
          <LabSelect label="Situation" value={scenario} options={EXPERIMENT_SCENARIOS} onChange={value => setScenario(value as ExperimentScenario)} />
          <label className="person-choice">Seed<input className={labInput} inputMode="numeric" value={seed} aria-invalid={parseSeed(seed) === null} onChange={event => setSeed(event.target.value)} /></label>
          <LabSlider label="Figures per test" value={count} min={6} max={12} step={1} onChange={setCount} />
          <LabSlider label="Tests in batch" value={batch} min={1} max={10} step={1} onChange={setBatch} />
          <div className="flex flex-wrap gap-2"><ChromeButton className="hud-action" disabled={!loaded || parseSeed(seed) === null || suite.tests.length >= 100} onClick={() => add(1)}>Add test</ChromeButton>
            <ChromeButton className="hud-action" disabled={!loaded || parseSeed(seed) === null || suite.tests.length + batch > 100} onClick={() => add(batch)}>Add batch</ChromeButton>
            <ChromeButton className="hud-action" disabled={!loaded || suite.tests.length + batch > 100} onClick={() => add(batch, true)}>Random batch</ChromeButton></div>
          <p className="person-hint">Transport scenarios create complete cart teams or led pack animals, using the game's hitch length, handler spacing, shafts and reins. Figures counts include drivers and handlers. New tests append to the collection; the seed reproduces the full arrangement. Up to 100 tests can be saved together.</p>
        </AssetEditorSection>
        <AssetEditorSection title="Files">
          <div className="flex flex-wrap gap-2"><ChromeButton className="hud-action" onClick={() => void copy()}>Copy all JSON</ChromeButton>
            <ChromeButton className="hud-action" onClick={download}>Download JSON</ChromeButton>
            <ChromeButton className="hud-action" onClick={() => file.current?.click()}>Open JSON file</ChromeButton></div>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={async event => {
            const selected = event.target.files?.[0]; event.target.value = ""
            if (!selected) return
            if (selected.size > 2_000_000) { setStatus("Import failed: JSON exceeds 2 MB."); return }
            try { loadJson(await selected.text()) } catch { setStatus("Could not read that file.") }
          }} />
          <label className="person-choice">Collection JSON<textarea className={labInput} rows={6} spellCheck={false} value={json} onChange={event => setJson(event.target.value)} placeholder="Paste experiment JSON here…" /></label>
          <ChromeButton className="hud-action" disabled={!json.trim()} onClick={() => loadJson(json)}>Load collection JSON</ChromeButton>
          <ChromeButton className="hud-action" disabled={suite.tests.length < 2} onClick={() => {
            const tests = suite.tests.filter(test => test.id !== scene.id); commit({ ...suite, tests }); setSelectedCase(tests[0].id); setStatus("Test removed. Undo restores it.")
          }}>Remove current test</ChromeButton>
          <p className="person-hint">Copy all JSON includes every scene, immutable sprite URLs, both orders, review flags and notes. Loading JSON replaces this collection; Undo restores the previous one. Invalid imports leave your work intact.</p>
        </AssetEditorSection>
      </>}
      dock={<div className="person-animation-dock hud-well flex flex-wrap items-center gap-2"><span className="person-hint">{reviewed}/{suite.tests.length} reviewed · {manual ? "Manual order" : "Game order"} · frozen pose</span>
        <ChromeButton className="hud-action" disabled={!history.length} onClick={() => {
          const previous = history.at(-1)!; setSuite(previous); setHistory(old => old.slice(0, -1)); setStatus("Previous edit restored.")
        }}>Undo</ChromeButton>
        <ChromeButton className="hud-action" onClick={() => { const index = suite.tests.indexOf(scene); const next = [...suite.tests.slice(index + 1), ...suite.tests.slice(0, index + 1)].find(test => !test.reviewed); if (next) setSelectedCase(next.id) }} disabled={reviewed === suite.tests.length}>Next unreviewed</ChromeButton>
        <AssetEditorHelp label="Overlap experiments">Select a numbered character on the map or in the Order list. Use Backward and Forward to correct obscuring, then Mark reviewed. Scroll to zoom and drag to pan. Copy all JSON exports the complete collection for improving the rules.</AssetEditorHelp>
      </div>}>
      <div className="person-stage asset-building-stage"><OverlapScene scene={scene} manual={manual} solid={solid} selected={actor.id} showLabels={labels} active={active}
        onSelect={setSelectedActor} onReady={() => { setReadyScene(sceneKey); setStatus("Scene ready. Select a character and adjust its order.") }} /></div>
    </AssetEditorWorkspace>
  </AssetEditorFrame>
}
