"use client"

import { AssetEditorFrame, AssetEditorWorkspace, AssetEditorSection, type AssetEditorNavigation } from "@/components/asset-editor-frame"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import { LabPlayback, LabSelect, LabSlider, labButton as button } from "@/components/lab-controls"
import { advanceTown, createTown, residentTask, setWorkplaceOpen, TOWN_DAY, TOWN_JOBS, TOWN_SETTINGS, TOWN_SITES } from "@/lib/path-lab/town"
import { worldStats } from "@/lib/path-lab/simulation"
import type { TownPlayback } from "./town-scene"

const TownScene = dynamic(() => import("./town-scene").then(module => module.TownScene), { ssr: false, loading: () => <p className="p-8 text-parchment">Loading the village…</p> })

/**
 * A staged village using the shared path policy, game buildings and distance-driven people.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/6LV-0
 */
export function TownLab({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const [controlsOpen, setControlsOpen] = useState(false)
  const [ready, setReady] = useState(false), onReady = useCallback(() => setReady(true), [])
  const [town, setTown] = useState(createTown), [settings, setSettings] = useState(TOWN_SETTINGS)
  const [playing, setPlaying] = useState(true), [speed, setSpeed] = useState(4), [view, setView] = useState(0)
  const [selected, setSelected] = useState<number | null>(0), [focus, setFocus] = useState<number | null>(null)
  const [showLabels, setShowLabels] = useState(true), [site, setSite] = useState<string | null>(null), [reset, setReset] = useState(0)
  const [, refresh] = useState(0), labels = useRef(new Map<string, HTMLButtonElement>())
  const live = useRef<TownPlayback>({ playing, speed, settings }); live.current = { playing: active && playing, speed, settings }
  useEffect(() => { if (!active) return; const timer = setInterval(() => refresh(value => value + 1), 250); return () => clearInterval(timer) }, [active])
  const stats = worldStats(town.world), resident = selected === null ? null : town.people[selected]
  const selectedSite = TOWN_SITES.find(item => item.id === site)
  const restart = () => { setReady(false); setTown(createTown()); setReset(value => value + 1); setFocus(null) }
  const stepDay = () => { setPlaying(false); advanceTown(town, TOWN_DAY, settings); town.revision++; refresh(value => value + 1) }
  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} label="Village journeys editor" version="Village journeys" controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(value => !value)} status={`${Math.round(stats.sharedTravel * 100)}% shared travel · ${stats.permanent} permanent segments`} detail={"Drag to pan · scroll to zoom"}>
    <AssetEditorWorkspace title="Village journeys" controlsOpen={controlsOpen} onControlsClose={() => setControlsOpen(false)}
      controls={<><AssetEditorSection title="People & daily work"><h2 className="mb-3 font-display text-sm uppercase tracking-[1px]">People & daily work</h2>
<LabSelect label="Resident" value={String(selected ?? 0)} options={Object.fromEntries(town.people.map(person => [person.id, `${person.name} · ${TOWN_JOBS[person.job].label}`]))} onChange={value => setSelected(Number(value))} />
{resident && <div className="mt-4 text-sm" data-testid="resident-task">
              <p className="font-semibold">{resident.name} · {TOWN_JOBS[resident.job].label}</p>
              <p className="mt-2">{residentTask(town, resident)}</p>
              <p className="mt-2 text-xs text-ink-light">{TOWN_SITES.find(item => item.id === resident.home)?.label} · {resident.completed} arrivals</p>
              <button className={`${button} mt-3`} onClick={() => { setFocus(resident.id); setView(value => value + 4) }}>Find {resident.name}</button>
            </div>}</AssetEditorSection>
        <AssetEditorSection title="Workplaces"><h2 className="font-display text-sm uppercase tracking-[1px]">Workplaces</h2>
<p className="mt-2 text-xs text-ink-light">Close a workplace to remove it from future trips. People finish their current journey.</p>
<div className="mt-3 flex flex-col gap-2">{TOWN_SITES.filter(item => item.workplace).map(item => <button key={item.id} className={button} aria-pressed={!town.closed.has(item.id)} onClick={() => { setWorkplaceOpen(town, item.id, town.closed.has(item.id)); refresh(value => value + 1) }}>{item.label} · {town.closed.has(item.id) ? "closed" : "open"}</button>)}</div></AssetEditorSection>
        <AssetEditorSection title="Selected building">{selectedSite && <section className="border border-rule bg-parchment p-4 text-sm text-ink"><h2 className="font-display">{selectedSite.label}</h2><p className="mt-2">{selectedSite.purpose}.</p></section>}</AssetEditorSection>
        <AssetEditorSection title="Path rules"><div className="person-file-actions">
          <LabSlider label="Follow shared paths" value={settings.preference} min={0} max={.9} step={.05} onChange={preference => setSettings(old => ({ ...old, preference }))} />
          <LabSlider label="New path penalty" value={settings.newPathCost * 100} min={0} max={400} step={25} suffix="%" onChange={value => setSettings(old => ({ ...old, newPathCost: value / 100 }))} />
          <LabSlider label="Turn penalty" value={settings.turnPenalty} min={0} max={2} step={.1} onChange={turnPenalty => setSettings(old => ({ ...old, turnPenalty }))} />
          <LabSlider label="Wear / passage" value={settings.wear} min={.005} max={.15} step={.005} onChange={wear => setSettings(old => ({ ...old, wear }))} />
          <LabSlider label="Regrowth half-life" value={settings.halfLife} min={.25} max={10} step={.25} suffix=" days" onChange={halfLife => setSettings(old => ({ ...old, halfLife }))} />
          <LabSelect label="Permanent at" value={String(settings.permanentAt)} options={{ 0: "Never", .6: "60% wear", .75: "75% wear", .9: "90% wear", 1: "100% wear" }} onChange={value => setSettings(old => ({ ...old, permanentAt: Number(value) }))} />
        </div>
<p className="mt-4 text-xs text-ink-light">Settings affect future trips and footsteps. Restart to erase earned permanence. One village day is three simulation minutes.</p></AssetEditorSection>
        </>}
      toolbar={<><LabPlayback playing={playing} onPlayingChange={setPlaying} onStep={stepDay} stepLabel="Advance one day" onRestart={restart} />
<LabSelect label="Village speed" value={String(speed)} options={{ 1: "1×", 4: "4×", 8: "8×" }} onChange={value => setSpeed(Number(value))} />
<span className="flex-1" />
<span data-testid="village-clock" className="text-sm tabular-nums">Day {(town.world.time / TOWN_DAY).toFixed(2)} · {town.people.filter(person => person.trip).length} walking · {town.people.reduce((sum, person) => sum + person.completed, 0)} arrivals</span></>}
      dock={<div className="person-animation-dock hud-well"><><button className={button} onClick={() => setView(value => value + 1)}>Rotate view</button>
<button className={button} onClick={() => { setFocus(null); setView(value => value + 4) }}>Whole village</button>
<label className="flex items-center gap-2"><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} />Building names</label>
<span className="ml-auto text-ink-light">Drag to pan · scroll or pinch to zoom</span></></div>}>
      <div className="person-stage asset-building-stage">{active && <><div className="asset-building-viewport" data-testid="village-scene">
            <TownScene key={reset} town={town} live={live} view={view} focus={focus} selected={selected} labels={labels} onSelect={setSelected} onReady={onReady} />
            {!ready && <p role="status" className="absolute bottom-4 left-4 bg-bg/90 p-3 text-sm">Loading the residents’ artwork…</p>}
            <div className={`pointer-events-none absolute inset-0 overflow-hidden ${showLabels ? "" : "hidden"}`}>
              {resident && <button ref={element => { if (element) labels.current.set("resident", element); else labels.current.delete("resident") }} className="absolute -translate-x-1/2 -translate-y-full border border-gold bg-[#251c12]/95 px-2 py-1 text-xs text-gold">{resident.name}</button>}
              {TOWN_SITES.map(item => <button key={item.id} ref={element => { if (element) labels.current.set(item.id, element); else labels.current.delete(item.id) }}
                className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full whitespace-nowrap border border-rule/60 bg-[#251c12]/90 px-2 py-1 text-[10px] text-ink hover:border-gold"
                onClick={() => setSite(item.id)}>{item.label}{town.closed.has(item.id) ? " · closed" : ""}</button>)}
            </div>
          </div></>}</div>
    </AssetEditorWorkspace>
  </AssetEditorFrame>
}
