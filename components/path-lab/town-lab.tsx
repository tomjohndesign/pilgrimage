"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import { LabSelect, LabSlider, labButton as button } from "@/components/lab-controls"
import { advanceTown, createTown, residentTask, setWorkplaceOpen, TOWN_DAY, TOWN_JOBS, TOWN_SETTINGS, TOWN_SITES } from "@/lib/path-lab/town"
import { worldStats } from "@/lib/path-lab/simulation"
import type { TownPlayback } from "./town-scene"

const TownScene = dynamic(() => import("./town-scene").then(module => module.TownScene), { ssr: false, loading: () => <p className="p-8 text-parchment">Loading the village…</p> })

/**
 * A staged village using the shared path policy, game buildings and distance-driven people.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/6LV-0
 */
export function TownLab() {
  const [ready, setReady] = useState(false), onReady = useCallback(() => setReady(true), [])
  const [town, setTown] = useState(createTown), [settings, setSettings] = useState(TOWN_SETTINGS)
  const [playing, setPlaying] = useState(true), [speed, setSpeed] = useState(4), [view, setView] = useState(0)
  const [selected, setSelected] = useState<number | null>(0), [focus, setFocus] = useState<number | null>(null)
  const [showLabels, setShowLabels] = useState(true), [site, setSite] = useState<string | null>(null), [reset, setReset] = useState(0)
  const [, refresh] = useState(0), labels = useRef(new Map<string, HTMLButtonElement>())
  const live = useRef<TownPlayback>({ playing, speed, settings }); live.current = { playing, speed, settings }
  useEffect(() => { const timer = setInterval(() => refresh(value => value + 1), 250); return () => clearInterval(timer) }, [])
  const stats = worldStats(town.world), resident = selected === null ? null : town.people[selected]
  const selectedSite = TOWN_SITES.find(item => item.id === site)
  const restart = () => { setReady(false); setTown(createTown()); setReset(value => value + 1); setFocus(null) }
  const stepDay = () => { setPlaying(false); advanceTown(town, TOWN_DAY, settings); town.revision++; refresh(value => value + 1) }
  return <main className="min-h-screen bg-bg px-4 py-6 text-parchment sm:px-8">
    <div className="mx-auto flex max-w-[1700px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><Link href="/assets/paths" className="font-display text-xs uppercase tracking-[2px] text-gold">← Path playgrounds</Link>
          <h1 className="mt-3 font-display text-3xl tracking-[3px]">A village finds its paths</h1>
          <p className="mt-2 text-parchment-dark">Twelve residents. Four homes. Work, deliveries and provisions make the roads.</p></div>
        <span className="font-display text-xs uppercase tracking-[1px] text-gold">Follow one another’s paths</span>
      </header>
      <section aria-label="Village controls" className="border border-rule bg-parchment p-4 text-ink">
        <div className="flex flex-wrap items-center gap-2">
          <button className={button} onClick={() => setPlaying(value => !value)}>{playing ? "Pause" : "Play"}</button>
          <button className={button} onClick={stepDay}>Advance one day</button>
          <button className={button} onClick={restart}>Restart village</button>
          <LabSelect label="Village speed" value={String(speed)} options={{ 1: "1×", 4: "4×", 8: "8×" }} onChange={value => setSpeed(Number(value))} />
          <span className="flex-1" />
          <span data-testid="village-clock" className="text-sm tabular-nums">Day {(town.world.time / TOWN_DAY).toFixed(2)} · {town.people.filter(person => person.trip).length} walking · {town.people.reduce((sum, person) => sum + person.completed, 0)} arrivals</span>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 border border-rule" aria-label="Village map">
          <div className="flex flex-wrap items-center gap-3 bg-[#251c12] p-3 text-xs">
            <button className={button} onClick={() => setView(value => value + 1)}>Rotate view</button>
            <button className={button} onClick={() => { setFocus(null); setView(value => value + 4) }}>Whole village</button>
            <label className="flex items-center gap-2"><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} />Building names</label>
            <span className="ml-auto text-parchment-dark">Drag to pan · scroll or pinch to zoom</span>
          </div>
          <div className="relative h-[65vh] min-h-[420px] overflow-hidden" data-testid="village-scene">
            <TownScene key={reset} town={town} live={live} view={view} focus={focus} selected={selected} labels={labels} onSelect={setSelected} onReady={onReady} />
            {!ready && <p role="status" className="absolute bottom-4 left-4 bg-bg/90 p-3 text-sm">Loading the residents’ artwork…</p>}
            <div className={`pointer-events-none absolute inset-0 overflow-hidden ${showLabels ? "" : "hidden"}`}>
              {resident && <button ref={element => { if (element) labels.current.set("resident", element); else labels.current.delete("resident") }} className="absolute -translate-x-1/2 -translate-y-full border border-gold bg-[#251c12]/95 px-2 py-1 text-xs text-gold">{resident.name}</button>}
              {TOWN_SITES.map(item => <button key={item.id} ref={element => { if (element) labels.current.set(item.id, element); else labels.current.delete(item.id) }}
                className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full whitespace-nowrap border border-rule/60 bg-[#251c12]/90 px-2 py-1 text-[10px] text-parchment hover:border-gold"
                onClick={() => setSite(item.id)}>{item.label}{town.closed.has(item.id) ? " · closed" : ""}</button>)}
            </div>
          </div>
          <p className="flex flex-wrap justify-between gap-2 bg-[#251c12] px-4 py-3 text-xs text-parchment-dark" data-testid="village-path-stats">
            <span>{Math.round(stats.sharedTravel * 100)}% shared travel · {stats.permanent} permanent segments</span>
            <span>Only footsteps deepen the ground. Permanent paths retain a 45% floor.</span>
          </p>
        </section>
        <aside className="flex flex-col gap-4">
          <section className="border border-rule bg-parchment p-4 text-ink">
            <h2 className="mb-3 font-display text-sm uppercase tracking-[1px]">People & daily work</h2>
            <LabSelect label="Resident" value={String(selected ?? 0)} options={Object.fromEntries(town.people.map(person => [person.id, `${person.name} · ${TOWN_JOBS[person.job].label}`]))} onChange={value => setSelected(Number(value))} />
            {resident && <div className="mt-4 text-sm" data-testid="resident-task">
              <p className="font-semibold">{resident.name} · {TOWN_JOBS[resident.job].label}</p>
              <p className="mt-2">{residentTask(town, resident)}</p>
              <p className="mt-2 text-xs text-ink-light">{TOWN_SITES.find(item => item.id === resident.home)?.label} · {resident.completed} arrivals</p>
              <button className={`${button} mt-3`} onClick={() => { setFocus(resident.id); setView(value => value + 4) }}>Find {resident.name}</button>
            </div>}
          </section>
          <section className="border border-rule bg-parchment p-4 text-ink">
            <h2 className="font-display text-sm uppercase tracking-[1px]">Workplaces</h2>
            <p className="mt-2 text-xs text-ink-light">Close a workplace to remove it from future trips. People finish their current journey.</p>
            <div className="mt-3 flex flex-col gap-2">{TOWN_SITES.filter(item => item.workplace).map(item => <button key={item.id} className={button} aria-pressed={!town.closed.has(item.id)} onClick={() => { setWorkplaceOpen(town, item.id, town.closed.has(item.id)); refresh(value => value + 1) }}>{item.label} · {town.closed.has(item.id) ? "closed" : "open"}</button>)}</div>
          </section>
          {selectedSite && <section className="border border-rule bg-parchment p-4 text-sm text-ink"><h2 className="font-display">{selectedSite.label}</h2><p className="mt-2">{selectedSite.purpose}.</p></section>}
        </aside>
      </div>
      <details className="border border-rule bg-parchment p-4 text-ink">
        <summary className="cursor-pointer font-display text-sm uppercase tracking-[1px]">Path rules</summary>
        <div className="mt-4 grid grid-cols-2 gap-5 lg:grid-cols-4">
          <LabSlider label="Follow shared paths" value={settings.preference} min={0} max={.9} step={.05} onChange={preference => setSettings(old => ({ ...old, preference }))} />
          <LabSlider label="New path penalty" value={settings.newPathCost * 100} min={0} max={400} step={25} suffix="%" onChange={value => setSettings(old => ({ ...old, newPathCost: value / 100 }))} />
          <LabSlider label="Turn penalty" value={settings.turnPenalty} min={0} max={2} step={.1} onChange={turnPenalty => setSettings(old => ({ ...old, turnPenalty }))} />
          <LabSlider label="Wear / passage" value={settings.wear} min={.005} max={.15} step={.005} onChange={wear => setSettings(old => ({ ...old, wear }))} />
          <LabSlider label="Regrowth half-life" value={settings.halfLife} min={.25} max={10} step={.25} suffix=" days" onChange={halfLife => setSettings(old => ({ ...old, halfLife }))} />
          <LabSelect label="Permanent at" value={String(settings.permanentAt)} options={{ 0: "Never", .6: "60% wear", .75: "75% wear", .9: "90% wear", 1: "100% wear" }} onChange={value => setSettings(old => ({ ...old, permanentAt: Number(value) }))} />
        </div>
        <p className="mt-4 text-xs text-ink-light">Settings affect future trips and footsteps. Restart to erase earned permanence. One village day is three simulation minutes.</p>
      </details>
      <p className="text-sm text-parchment-dark">Watch a few days, then close the wood yard or bakehouse. Shared stretches should remain busy while temporary branches fade. Homes, baking and delivery jobs are staged placeholders using the game’s existing building kit; this village is independent of your saved game.</p>
      <a href="https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/6LV-0" className="self-start text-xs text-gold underline underline-offset-4">Paper design ↗</a>
    </div>
  </main>
}
