"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { LabSelect, LabSlider, labButton as button, labInput } from "@/components/lab-controls"
import { normalizeBuildingRotation, type BuildingRotation } from "@/lib/game/building-rotation"
import { advanceWorld, coords, createPathWorld, DEFAULT_PATH_SETTINGS, DEPTH, indexAt, LAB_DAY, labBuilding, placeLabBuilding, placementIssue, setDestinationOpen, WIDTH, worldStats, type Experiment, type PathSettings, type PathWorld } from "@/lib/path-lab/simulation"
import { DEFAULT_PERMUTATION, LAYOUTS, SOURCES, readPermutation, type Permutation } from "@/lib/path-lab/permutations"
import { parseSeed } from "@/lib/game/rng"
import { CELL, drawPathMap, type MapLayer } from "./map"

const EXPERIMENTS: Record<Experiment, { label: string; title: string; description: string; try: string }> = {
  routes: { label: "01 · Reinforcement", title: "Which paths earn their place?", description: "Both weigh distance using the same individual preferences. Left chooses independently; right favors existing trails and fewer turns, increasingly following segments used by other commuters. Neither invents a new route on every journey.", try: "Advance several days. Compare the same layout with and without reinforcement, then change the seed, origins, or woodland layout. Close a destination below to watch its temporary branches fade while the remaining routes deepen." },
  wear: { label: "02 · Wear & regrowth", title: "Keep the useful paths. Let the others fade.", description: "Start with an old network. Most journeys serve destinations; one in five passes through. Shift demand or close a destination to see which parts of the network remain useful.", try: "Focus visits on one destination for a few days, then choose another. Old routes retain their advantage while useful, and fade when abandoned unless they have become permanent. Stop all journeys to inspect the main road’s minimum." },
  town: { label: "03 · Grow a town", title: "New paths need a reason.", description: "A new hut creates a reason to travel. People reuse deep routes for as much of the journey as is worthwhile, wearing only the missing connection. Shelters require connected frontage.", try: "Try local journeys in a clustered layout. Add a hut, watch its connection emerge, then turn its visits off to compare temporary and permanent paths. Existing buildings remain valid as their frontage fades. Economy and renown are omitted." },
}

function createExperiments(settings: PathSettings, permutation: Permutation): Record<Experiment, PathWorld[]> {
  return { routes: [createPathWorld("routes", settings, false, permutation), createPathWorld("routes", settings, true, permutation)],
    wear: [createPathWorld("wear", settings, true, permutation)], town: [createPathWorld("town", settings, true, permutation)] }
}

function PathMap({ world, settings, layer, grid, routes, selected, onSelect, tool, rotation, onPlace }: {
  world: PathWorld; settings: PathSettings; layer: MapLayer; grid: boolean; routes: boolean; selected: number | null
  onSelect: (index: number) => void; tool: "inspect" | "workshop" | "shelter"; rotation: BuildingRotation; onPlace: (index: number) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const live = useRef({ world, settings, layer, grid, routes, selected, tool, rotation })
  live.current = { world, settings, layer, grid, routes, selected, tool, rotation }
  useEffect(() => {
    const context = canvas.current!.getContext("2d")
    if (!context) return
    let frame = 0
    const draw = () => {
      const { world, settings, selected, tool, rotation, ...view } = live.current
      const p = selected === null ? null : coords(selected)
      const candidate = p && tool !== "inspect" ? labBuilding(p.x, p.z, tool, rotation, world.buildings.length) : undefined
      if (!document.hidden) drawPathMap(context, world, { ...view, selected, candidate, valid: candidate ? !placementIssue(world, candidate, settings) : false })
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [])
  const pointedTile = (event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return indexAt(Math.min(WIDTH - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * WIDTH))), Math.min(DEPTH - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * DEPTH))))
  }
  return <canvas ref={canvas} width={WIDTH * CELL} height={DEPTH * CELL} tabIndex={0} role="img"
    aria-label="Path simulation map. Arrow keys select a tile. Enter inspects or places the selected building."
    className="block h-auto w-full cursor-crosshair focus-visible:outline-2 focus-visible:outline-gold"
    style={{ imageRendering: "pixelated" }}
    onPointerMove={event => { if (event.pointerType === "mouse") onSelect(pointedTile(event)) }}
    onClick={event => { const i = pointedTile(event); onSelect(i); if (tool !== "inspect") onPlace(i) }}
    onKeyDown={event => {
      const p = coords(selected ?? indexAt(20, 10)), directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (directions[event.key]) { event.preventDefault(); const [dx, dz] = directions[event.key]; onSelect(indexAt(Math.min(WIDTH - 1, Math.max(0, p.x + dx)), Math.min(DEPTH - 1, Math.max(0, p.z + dz)))) }
      if (event.key === "Enter") { event.preventDefault(); const i = selected ?? indexAt(p.x, p.z); onSelect(i); if (tool !== "inspect") onPlace(i) }
    }} />
}

/**
 * Three reversible simulations for testing traffic-driven paths before adopting game rules.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/6K6-0
 */
export function PathLab() {
  const [experiment, setExperiment] = useState<Experiment>("routes")
  const [permutation, setPermutation] = useState<Permutation>({ ...DEFAULT_PERMUTATION })
  const [seedDraft, setSeedDraft] = useState(String(DEFAULT_PERMUTATION.seed))
  const [settings, setSettings] = useState<PathSettings>({ ...DEFAULT_PATH_SETTINGS })
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(4)
  const [layer, setLayer] = useState<MapLayer>("ground")
  const [grid, setGrid] = useState(false)
  const [routes, setRoutes] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [tool, setTool] = useState<"inspect" | "workshop" | "shelter">("inspect")
  const [rotation, setRotation] = useState<BuildingRotation>(0)
  const [message, setMessage] = useState("")
  const [shareUrl, setShareUrl] = useState("")
  const [, refresh] = useState(0)
  const worlds = useRef<Record<Experiment, PathWorld[]> | null>(null)
  if (!worlds.current) worlds.current = createExperiments(settings, permutation)
  const live = useRef({ experiment, settings, playing, speed })
  live.current = { experiment, settings, playing, speed }
  const current = worlds.current[experiment], world = current[current.length - 1]
  const copy = EXPERIMENTS[experiment]
  const patch = (values: Partial<PathSettings>) => setSettings(old => ({ ...old, ...values }))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get("experiment")
    if (id && Object.hasOwn(EXPERIMENTS, id)) setExperiment(id as Experiment)
    const restored = { ...DEFAULT_PATH_SETTINGS }
    const limits: Record<keyof PathSettings, [number, number]> = { traffic: [0, 120], wear: [.005, .15], halfLife: [.25, 10], preference: [0, .9], newPathCost: [0, 4], turnPenalty: [0, 2], permanentAt: [0, 1], roadFloor: [0, .6] }
    for (const key of Object.keys(limits) as (keyof PathSettings)[]) {
      const value = params.get(key), n = Number(value)
      if (value !== null && Number.isFinite(n)) restored[key] = Math.min(limits[key][1], Math.max(limits[key][0], n))
    }
    setSettings(restored)
    const variation = readPermutation(params)
    setPermutation(variation); setSeedDraft(String(variation.seed))
    worlds.current = createExperiments(restored, variation)
    const active = id && Object.hasOwn(EXPERIMENTS, id) ? id as Experiment : "routes"
    worlds.current[active].forEach(w => {
      w.focus = w.buildings.find(b => b.id === params.get("focus"))?.id ?? null
      for (const closed of (params.get("closed") ?? "").split(",")) if (w.buildings.some(b => b.id === closed)) setDestinationOpen(w, closed, false)
    })
    refresh(n => n + 1)
  }, [])

  useEffect(() => {
    let frame = 0, previous = performance.now(), lastLabel = 0
    const tick = (now: number) => {
      const dt = Math.min(.1, (now - previous) / 1000); previous = now
      const { experiment, settings, playing, speed } = live.current
      if (playing && !document.hidden) worlds.current![experiment].forEach(w => advanceWorld(w, dt * speed, settings))
      if (now - lastLabel > 150) { refresh(n => n + 1); lastLabel = now }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const restart = () => {
    worlds.current![experiment] = experiment === "routes" ? [createPathWorld(experiment, settings, false, permutation), createPathWorld(experiment, settings, true, permutation)] : [createPathWorld(experiment, settings, true, permutation)]
    setMessage("Experiment restarted with the current controls."); setSelected(null); refresh(n => n + 1)
  }
  const changePermutation = (change: Partial<Permutation>) => {
    const next = { ...permutation, ...change }
    setPermutation(next); setSeedDraft(String(next.seed)); worlds.current = createExperiments(settings, next)
    setSelected(null); setTool("inspect"); setShareUrl(""); setMessage("New permutation. All experiments restarted on the same layout.")
    refresh(n => n + 1)
  }
  const advance = () => { setPlaying(false); current.forEach(w => advanceWorld(w, LAB_DAY, settings)); refresh(n => n + 1) }
  const place = (i: number) => {
    if (tool === "inspect") return
    const p = coords(i), building = labBuilding(p.x, p.z, tool, rotation, world.buildings.length)
    const issue = placeLabBuilding(world, building, settings)
    setMessage(issue ?? `${building.label} placed. Journeys will begin to wear a route to its entrance.`)
    refresh(n => n + 1)
  }
  const share = async () => {
    const params = new URLSearchParams({ experiment, ...Object.fromEntries(Object.entries(permutation).map(([key, value]) => [key, String(value)])), focus: world.focus ?? "", closed: [...world.closedDestinations].join(","), ...Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)])) })
    const url = `${window.location.origin}/assets/paths?${params}`
    setShareUrl(url); window.history.replaceState(null, "", url)
    try { await navigator.clipboard.writeText(url); setMessage("Settings link copied, including the permutation and demand. It starts fresh; elapsed time and manually placed buildings are not included.") }
    catch { setMessage("Copy the settings link below. It starts a fresh experiment.") }
  }
  const point = selected === null ? null : coords(selected)
  const candidate = point && tool !== "inspect" ? labBuilding(point.x, point.z, tool, rotation, world.buildings.length) : null
  const issue = candidate ? placementIssue(world, candidate, settings) : null

  return <main className="min-h-screen bg-[#14100a] px-4 py-8 text-parchment sm:px-8">
    <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
      <header>
        <Link href="/assets" className="font-display text-[10px] uppercase tracking-[3px] text-gold hover:text-gold-light">← Assets</Link>
        <h1 className="mt-4 font-display text-2xl font-semibold uppercase tracking-[4px] sm:text-3xl">Path playgrounds</h1>
        <p className="mt-2 text-base text-parchment-dark">Follow the journeys. Watch a trail take shape. Build where people already walk.</p>
      </header>
      <Link href="/assets/paths/town" className={`${button} self-start`}>See shared paths in a living village →</Link>
      <nav aria-label="Path experiments" className="flex flex-wrap gap-2">
        {(Object.keys(EXPERIMENTS) as Experiment[]).map(id => <button key={id} type="button" className={`${button} ${id === experiment ? "ring-2 ring-gold" : "opacity-70"}`} aria-pressed={id === experiment}
          onClick={() => { setExperiment(id); setTool("inspect"); setSelected(null); setMessage(""); setShareUrl("") }}>{EXPERIMENTS[id].label}</button>)}
      </nav>
      <section aria-label="Permutations" className="border border-rule bg-parchment p-4 text-ink sm:p-5">
        <div className="grid grid-cols-2 items-end gap-4 lg:grid-cols-5">
          <LabSelect label="Layout permutation" value={permutation.layout} options={LAYOUTS} onChange={layout => changePermutation({ layout: layout as Permutation["layout"] })} />
          <LabSelect label="Journey origins" value={permutation.sources} options={SOURCES} onChange={sources => changePermutation({ sources: sources as Permutation["sources"] })} />
          <label className="flex flex-col gap-1 text-xs text-ink-light">Map seed
            <input aria-label="Map seed" className={labInput} inputMode="numeric" value={seedDraft} onChange={e => setSeedDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { const seed = parseSeed(seedDraft); if (seed !== null) changePermutation({ seed }) } }} />
          </label>
          <LabSelect label="Destination count" value={String(permutation.destinations)} options={Object.fromEntries([2, 3, 4, 5, 6, 7, 8].map(n => [n, String(n)]))} onChange={n => changePermutation({ destinations: Number(n) })} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={parseSeed(seedDraft) === null} onClick={() => { const seed = parseSeed(seedDraft); if (seed !== null) changePermutation({ seed }) }}>Apply seed</button>
            <button type="button" className={button} onClick={() => changePermutation({ seed: (permutation.seed + 1) >>> 0 })}>Next permutation</button>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-light">Seed {permutation.seed} · {world.buildings.length} destinations. Layout, seed, origins and destination count restart all experiments. Tuning below changes the running simulation.{permutation.layout === "original" ? " The original fixture has fixed destinations; change the layout to vary their count and position." : ""}</p>
      </section>
      <section aria-label="Experiment controls" className="border border-rule bg-parchment p-4 text-ink sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} onClick={() => setPlaying(old => !old)}>{playing ? "Pause" : "Play"}</button>
          <button type="button" className={button} onClick={advance}>Advance one day</button>
          <button type="button" className={button} onClick={restart}>Restart experiment</button>
          <button type="button" className={button} onClick={() => { const enabled = !world.trafficOn; current.forEach(w => { w.trafficOn = enabled }); refresh(n => n + 1) }}>{world.trafficOn ? "Stop new journeys" : "Resume journeys"}</button>
          <span className="px-2 text-sm tabular-nums" data-testid="lab-clock">Day {(world.time / LAB_DAY).toFixed(2)} · {world.journeys.length} walking · {world.completed} completed</span>
          <span className="flex-1" />
          <button type="button" className={button} onClick={share}>Copy settings link</button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-5 lg:grid-cols-4">
          <LabSelect label="Playback speed" value={String(speed)} options={{ 1: "1×", 4: "4×", 12: "12×" }} onChange={n => setSpeed(Number(n))} />
          <LabSlider label="Journeys / minute" value={settings.traffic} min={0} max={120} step={1} onChange={traffic => patch({ traffic })} />
          <LabSlider label="Wear / passage" value={settings.wear} min={.005} max={.15} step={.005} onChange={wear => patch({ wear })} />
          <LabSlider label="Regrowth half-life" value={settings.halfLife} min={.25} max={10} step={.25} suffix=" days" onChange={halfLife => patch({ halfLife })} />
          <LabSlider label="Follow shared paths" value={settings.preference} min={0} max={.9} step={.05} onChange={preference => patch({ preference })} />
          <LabSlider label="New path penalty" value={settings.newPathCost * 100} min={0} max={400} step={25} suffix="%" onChange={value => patch({ newPathCost: value / 100 })} />
          <LabSlider label="Turn penalty" value={settings.turnPenalty} min={0} max={2} step={.1} onChange={turnPenalty => patch({ turnPenalty })} />
          <LabSlider label="Main road minimum" value={settings.roadFloor} min={0} max={.6} step={.05} onChange={roadFloor => patch({ roadFloor })} />
          <LabSelect label="Permanent at" value={String(settings.permanentAt)} options={{ 0: "Never", .6: "60% segment wear", .75: "75% segment wear", .9: "90% segment wear", 1: "100% segment wear", ...(settings.permanentAt > 0 ? { [settings.permanentAt]: `${Math.round(settings.permanentAt * 100)}% segment wear` } : {}) }} onChange={value => patch({ permanentAt: Number(value) })} />
        </div>
        <p className="mt-4 text-xs text-ink-light">New path penalty adds effort for each step across untracked ground: 100% doubles its route cost. Repeated passage removes this penalty as a trail forms; regrowth brings it back. Higher values favor existing trails, while needed connections can still emerge. Applies to the reinforced map.</p>
        <p className="mt-2 text-xs text-ink-light">Turn penalty favors fewer bends on the reinforced map, with extra cost for sharper turns. Permanent segments retain at least 45% wear and their frontage once connected. The threshold applies to future footsteps on both maps; changing it never erases permanence already earned. Restart with “Never” to test complete regrowth.</p>
        <p className="mt-4 text-xs text-ink-light">One experimental day = 60 simulation seconds. Shared travel measures recent walking on segments another commuter has already used. Controls apply to future movement and regrowth. Restart for a fresh comparison. Inactive experiments pause and retain their maps.</p>
      </section>
      <section aria-labelledby="experiment-title" className="flex flex-col gap-4">
        <div>
          <h2 id="experiment-title" className="font-display text-lg tracking-[1px]">{copy.title}</h2>
          <p className="mt-2 text-parchment-dark">{copy.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-5 border border-rule bg-parchment p-3 text-ink">
          <LabSelect label="Map overlay" value={layer} options={{ ground: "Ground surface", wear: "Wear intensity", frontage: "Connected frontage" }} onChange={value => setLayer(value as MapLayer)} />
          <label className="text-sm"><input className="mr-2 accent-gold" type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} />Tile grid</label>
          <label className="text-sm"><input className="mr-2 accent-gold" type="checkbox" checked={routes} onChange={event => setRoutes(event.target.checked)} />Journey routes</label>
          {experiment === "town" && <>
            <LabSelect label="Placement tool" value={tool} options={{ inspect: "Inspect ground", workshop: "Place a hut · off-road allowed", shelter: "Place a shelter · path required" }} onChange={value => { setTool(value as typeof tool); if (value === "shelter") setLayer("frontage") }} />
            <button type="button" className={button} disabled={tool === "inspect"} onClick={() => setRotation(normalizeBuildingRotation(rotation + 1))}>Rotate entrance · {["south", "west", "north", "east"][rotation]}</button>
          </>}
        </div>
        <div className={`grid gap-4 ${experiment === "routes" ? "lg:grid-cols-2" : "mx-auto w-full max-w-[1100px]"}`}>
          {current.map((w, i) => {
            const stats = worldStats(w)
            return <figure key={`${experiment}-${i}`} className="min-w-0 border border-rule">
              <figcaption className="flex flex-wrap justify-between gap-2 bg-[#251c12] px-4 py-3 text-sm">
                <strong className="font-display text-xs tracking-[1px]">{experiment === "routes" ? i === 0 ? "Distance only" : "Follow one another’s paths" : experiment === "wear" ? "Local traffic, local wear" : "A settlement taking shape"}</strong>
                <span className="text-parchment-dark tabular-nums"><span title="Recent distance walked on segments already used by another commuter">{Math.round(stats.sharedTravel * 100)}% shared travel</span> · {stats.traces} trace tiles · {stats.connected} connected · {stats.permanent} permanent segments</span>
              </figcaption>
              <PathMap world={w} settings={settings} layer={layer} grid={grid} routes={routes} selected={selected} onSelect={setSelected} tool={tool} rotation={rotation} onPlace={place} />
              <div className="min-h-12 bg-[#251c12] px-4 py-3 text-sm text-parchment-dark">
                {selected === null ? "Point at a tile to inspect it. Tab to the map and use arrow keys for keyboard control." : <span>Tile {point!.x}, {point!.z} · Wear {Math.round(w.wear[selected] * 100)}% · Minimum {Math.round(w.baseline[selected] * 100)}%{w.permanentTiles[selected] ? " · Permanent" : ""} · {w.blocked[selected] ? "Occupied" : w.connected[selected] ? "Connected path" : w.established[selected] ? "Isolated trail" : "Open ground"}</span>}
              </div>
            </figure>
          })}
        </div>
        {experiment === "town" && tool !== "inspect" && <div className="flex flex-wrap items-center gap-3 border border-rule bg-parchment p-3 text-ink">
          <p className="flex-1 text-sm">{candidate ? issue ?? "Valid site. The small square marks the entrance." : "Point at a site, or focus the map and use the arrow keys. Tap the map to place."}</p>
          <button type="button" className={button} disabled={!candidate || !!issue} onClick={() => selected !== null && place(selected)}>Place selected building</button>
        </div>}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-parchment-dark">
          <span><span className="mr-2 inline-block h-2 w-2 bg-[#fff0d1]" />Outbound journey</span>
          <span><span className="mr-2 inline-block h-2 w-2 bg-[#b5d3dd]" />Returning journey</span>
          {experiment === "wear" && <span><span className="mr-2 inline-block h-2 w-2 bg-[#e7ba64]" />Through traveler</span>}
          <span>{layer === "frontage" ? "Gold = connected path · green = adjoining entrance ground. Full footprint checks still apply." : layer === "wear" ? "Green = untouched · ochre = fully worn" : "Trails establish at 45% wear. Temporary trails become fallow below 25%; permanent paths remain."}</span>
        </div>
      </section>
      <section aria-label="Destination demand" className="border border-rule bg-parchment p-4 text-ink">
        <div className="flex flex-wrap items-end gap-4">
          <LabSelect label="Visit demand" value={world.focus ?? "balanced"} options={{ balanced: "Spread visits across open destinations", ...Object.fromEntries(world.buildings.map((b, i) => [b.id, `Focus 80% on ${b.buildType === "workshop" ? "hut" : "shelter"} ${i + 1}`])) }} onChange={value => { current.forEach(w => { w.focus = value === "balanced" ? null : value }); refresh(n => n + 1) }} />
          <p className="max-w-xl text-sm text-ink-light">Changes apply to new journeys. Walkers finish their existing trips. In local mode, closed destinations also stop sending journeys.</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {world.buildings.map((b, i) => <button key={b.id} type="button" className={button} aria-pressed={!world.closedDestinations.has(b.id)} onClick={() => {
            const open = world.closedDestinations.has(b.id); current.forEach(w => setDestinationOpen(w, b.id, open)); refresh(n => n + 1)
          }}>{b.buildType === "workshop" ? "Hut" : "Shelter"} {i + 1} · {world.closedDestinations.has(b.id) ? "visits off" : "visits on"}</button>)}
        </div>
        <p className="mt-3 text-xs text-ink-light">{permutation.sources === "local" && world.buildings.filter(b => !world.closedDestinations.has(b.id)).length < 2 ? "Local journeys need at least two open destinations." : "Turn visits off to test whether a branch still has a reason to exist. Deep paths stay attractive while they lead somewhere useful."}</p>
      </section>
      <aside className="border border-rule bg-parchment px-5 py-4 text-ink">
        <h3 className="font-display text-xs uppercase tracking-[2px]">Try this</h3>
        <p className="mt-2">{copy.try}</p>
      </aside>
      <p role="status" className="text-sm text-parchment-dark">{message}</p>
      {shareUrl && <input aria-label="Settings link" className="w-full border border-rule bg-parchment p-3 text-sm text-ink" value={shareUrl} readOnly onFocus={event => event.target.select()} />}
      <footer className="flex flex-wrap justify-between gap-3 border-t border-rule pt-4 text-sm text-parchment-dark">
        <span>Experimental rules · schematic maps · independent of your game</span>
        <a href="https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/6K6-0" className="text-gold underline underline-offset-4">Paper design ↗</a>
      </footer>
    </div>
  </main>
}
