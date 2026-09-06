"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, Check, Pause, Play, RotateCcw, SlidersHorizontal, X } from "lucide-react"
import { Section, Tuner } from "@/components/game/property-controls"
import "./game/game-hud.css"
import "./base-person-lab.css"
import { BASE_PERSON, SOCKET_NAMES, type BaseClip } from "@/lib/game/base-person/pose"
import { cachedPersonBake, renderPersonPreview, type BasePersonBake, type PersonPreview } from "@/lib/game/base-person/bake"

import { DEFAULT_DESIGN, DESIGN_CONTROLS, HAIR_STYLES, PERSON_PRESETS, personRecipe, withBodyType, validatePersonDesign, type DesignKey, type PersonDesign } from "@/lib/game/base-person/design"
import { usePopulationStore } from "@/lib/game/base-person/population-store"
import { usePersonDesignStore } from "@/lib/game/base-person/design-store"

const button = "hud-action"

function Tile({ url, shadowUrl, row, frame, columns, zoom = 1, name }: {
  url: string; shadowUrl?: string; row: number; frame: number; columns: number; zoom?: number; name: string
}) {
  const size = BASE_PERSON.cellSize * zoom
  return <span role="img" aria-label={name} className="block shrink-0" style={{ width: size, height: size,
    imageRendering: "pixelated", backgroundImage: `url("${url}")${shadowUrl ? `, url("${shadowUrl}")` : ""}`,
    backgroundSize: `${columns * size}px ${8 * size}px`, backgroundPosition: `${-frame * size}px ${-row * size}px`,
  }} />
}

function download(url: string, name: string) {
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click()
}

export function BasePersonLab() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    const target = window as unknown as { __bakePersonPopulation?: () => Promise<unknown> }
    target.__bakePersonPopulation = async () => (await import("@/lib/game/base-person/bake-population")).bakePopulation()
    return () => { delete target.__bakePersonPopulation }
  }, [])
  const [bake, setBake] = useState<BasePersonBake | null>(null)
  const [error, setError] = useState("")
  const [row, setRow] = useState(1)
  const [frame, setFrame] = useState(0)
  const [clip, setClip] = useState<BaseClip>("walk")
  const [playing, setPlaying] = useState(true)
  const [fps, setFps] = useState(8)
  const [zoom, setZoom] = useState(6)
  const [guides, setGuides] = useState(false)
  const [onion, setOnion] = useState(false)
  const [sides, setSides] = useState(false)
  const [design, setDesign] = useState<PersonDesign>(DEFAULT_DESIGN)
  const [busy, setBusy] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<PersonPreview | null>(null)
  const sheetMatchesDesign = !!bake && JSON.stringify(bake.metadata.design) === JSON.stringify(design)
  const [message, setMessage] = useState("")
  const applyDesign = usePersonDesignStore((s) => s.apply)
  const populationBuilding = usePopulationStore(s => s.building)
  const populationProgress = usePopulationStore(s => s.progress)
  const populationError = usePopulationStore(s => s.error)
  const storeError = usePersonDesignStore((s) => s.error)
  useEffect(() => {
    void usePersonDesignStore.getState().hydrate().then(() => {
      setDesign(usePersonDesignStore.getState().design ?? DEFAULT_DESIGN)
    })
  }, [])
  useEffect(() => {
    setBusy(true)
    const target = window as unknown as { __basePersonBake?: BasePersonBake }
    delete target.__basePersonBake
    if (dragging) return
    const timer = setTimeout(() => {
      try {
        const result = cachedPersonBake(design)
        setBake(result); setError("")
        target.__basePersonBake = result
      } catch (e) { setError(e instanceof Error ? e.message : "The base sprite could not render.") }
      setBusy(false)
    }, 180)
    return () => { clearTimeout(timer); delete target.__basePersonBake }
  }, [design, dragging])
  useEffect(() => {
    if (sheetMatchesDesign) return
    // Coalesce inputs into a paint, without waiting for the user to stop dragging.
    const request = requestAnimationFrame(() => {
      try {
        setPreview(renderPersonPreview(design, clip, clip === "walk" ? frame : 0, sides))
        setError("")
      } catch (e) { setError(e instanceof Error ? e.message : "The preview could not render.") }
    })
    return () => cancelAnimationFrame(request)
  }, [design, clip, frame, sides, sheetMatchesDesign])
  useEffect(() => {
    if (!playing || clip === "idle") return
    const timer = setInterval(() => setFrame((f) => (f + 1) % BASE_PERSON.framesPerCycle), 1000 / fps)
    return () => clearInterval(timer)
  }, [playing, clip, fps])

  const live = !sheetMatchesDesign && preview?.clip === clip && preview.sides === sides ? preview : null
  const columns = live ? 1 : clip === "walk" ? 8 : 1
  const visibleFrame = live ? 0 : clip === "walk" ? frame : 0
  const url = live?.url ?? (bake ? sides ? clip === "walk" ? bake.debugWalk : bake.debugIdle : bake[clip] : "")
  const shadowUrl = sides ? undefined : live?.shadowUrl ?? (clip === "walk" ? bake?.shadowWalk : bake?.shadowIdle)
  const renderPalette = personRecipe(design).renderPalette
  const sockets = live?.sockets[row] ?? bake?.metadata.clips[clip][row * columns + visibleFrame]?.sockets
  const pixels = BASE_PERSON.cellSize
  const direction = BASE_PERSON.directions[row]
  const jsonDownload = () => {
    if (!bake) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(bake.metadata, null, 2) + "\n"], { type: "application/json" }))
    download(url, `base-person-v${BASE_PERSON.version}.json`); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [controlsOpen, setControlsOpen] = useState(false)
  const [view, setView] = useState<"character" | "native" | "sheet">("character")
  const [stageSize, setStageSize] = useState({ width: 640, height: 640 })
  const stageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])
  const fittedZoom = Math.min(zoom, Math.max(1, Math.floor(Math.min(stageSize.width - 32, stageSize.height - 32) / pixels)))
  const section = (title: string, defaultOpen = true) => ({ title, open: openSections[title] ?? defaultOpen,
    onToggle: () => setOpenSections(s => ({ ...s, [title]: !(s[title] ?? defaultOpen) })) })
  const controls = (keys: DesignKey[]) => keys.map(key => {
    const control = DESIGN_CONTROLS[key]
    return <Tuner key={key} label={control.label} labelClassName="w-28" value={design[key]}
      display={key === "armAngle" || key === "elbowBend" ? `${design[key]}°` : `${Math.round(design[key] * 100)}%`} min={control.min} max={control.max} step={control.step}
      onDragChange={setDragging} onChange={value => { setDesign(d => ({ ...d, [key]: value })); setMessage("") }} />
  })
  const ready = !busy && !error && !!bake && sheetMatchesDesign

  return <section className="game-hud person-editor" aria-label="Base person template">
    <div className="hud-frame" aria-hidden="true" />
    <header className="person-header">
      <div className="person-title"><Link href="/assets" className="hud-action" aria-label="Back to assets"><ArrowLeft size={14} />Assets</Link><h1>Character editor</h1><span className="person-version">Base person · v{BASE_PERSON.version}</span></div>
      <nav aria-label="Editor navigation"><button className="hud-action person-controls-toggle" aria-expanded={controlsOpen} onClick={() => setControlsOpen(!controlsOpen)}><SlidersHorizontal size={14} />Controls</button><Link className="hud-action" aria-label="On the road" href={`/play?characters=base&baseSize=1.5&speed=0.5&fps=${fps}`}><span className="person-road-label">On the road</span><ArrowUpRight size={14} /></Link></nav>
    </header>
    <div className="person-workspace">
      <aside className={`person-controls hud-well ${controlsOpen ? "is-open" : ""}`} aria-label="Character controls">
        <div className="person-panel-heading"><span>Person</span><button className="hud-close person-controls-toggle" aria-label="Close character controls" onClick={() => setControlsOpen(false)}><X size={14} /></button></div>
        <div className="person-controls-scroll">
          <Section {...section("Presets")}><div className="person-presets">{Object.entries(PERSON_PRESETS).map(([name, preset]) => <button key={name} className={button} onClick={() => { setDesign({ ...preset }); setMessage("") }}>{name}</button>)}</div></Section>
          <Section {...section("Body")}>
            <label className="person-choice">Body type<select aria-label="Body type" value={design.bodyType} onChange={event => { const bodyType = event.currentTarget.value as PersonDesign["bodyType"]; setDesign(d => withBodyType(d, bodyType)); setMessage("") }}><option>Male</option><option>Female</option></select></label>
            {controls(["head", "build", "torsoHeight", "neckHeight", "legs", "nose"])}
          </Section>
          <Section {...section("Arms")}>
            {controls(["shoulderHeight", "armSpacing", "upperArm", "forearm", "armAngle", "elbowBend", "armSwing", "hands", "sleeves"])}
          </Section>
          <Section {...section("Clothing")}>
            <label className="person-choice">Garment<select aria-label="Garment" value={design.garment} onChange={event => { const garment = event.currentTarget.value as PersonDesign["garment"]; setDesign(d => ({ ...d, garment })); setMessage("") }}><option>Everyday</option><option>Robe</option></select></label>
            <label className="person-choice">Belt<select aria-label="Belt" value={design.beltStyle} onChange={event => { const beltStyle = event.currentTarget.value as PersonDesign["beltStyle"]; setDesign(d => ({ ...d, beltStyle })); setMessage("") }}><option>Leather</option><option>Rope</option></select></label>
            {controls(["tunicLength", "hem"])}
            <p className="person-hint">{design.garment === "Robe" ? "Ankle-length robe with full sleeves." : design.bodyType === "Female" ? "Sleeveless ankle-length dress over a long-sleeved shirt." : "Hip-length shirt with loose sleeves and trousers."}</p>
            <label className="person-choice">Clothing color<input type="color" aria-label="Clothing color" value={design.tunicColor} onChange={event => { const tunicColor = event.currentTarget.value; setDesign(d => ({ ...d, tunicColor })); setMessage("") }} /></label>
            {(design.bodyType === "Female" ? [["shirtColor", "Undershirt color"], ["coveringColor", "Head covering color"]] as const : [["trouserColor", "Trouser color"]] as const).map(([key, label]) => <label key={key} className="person-choice">{label}<input type="color" aria-label={label} value={design[key]} onChange={event => { const value = event.currentTarget.value; setDesign(d => ({ ...d, [key]: value })); setMessage("") }} /></label>)}
          </Section>
          <Section {...section("Feet")}>
            {controls(["feet", "footWidth", "footHeight"])}
          </Section>
          <Section {...section("Appearance")}>
            {([["skinColor", "Skin color"], ["hairColor", "Hair color"]] as const).map(([key, label]) => <label key={key} className="person-choice">{label}<input type="color" aria-label={label} value={design[key]} onChange={event => { const value = event.currentTarget.value; setDesign(d => ({ ...d, [key]: value })); setMessage("") }} /></label>)}
            <label className="person-choice">Hair style<select aria-label="Hair style" value={design.hairStyle} onChange={event => { const hairStyle = event.currentTarget.value as PersonDesign["hairStyle"]; setDesign(d => ({ ...d, hairStyle })); setMessage("") }}>{HAIR_STYLES.map(style => <option key={style}>{style}</option>)}</select></label>
            <label className="person-check"><input aria-label="Short beard" disabled={design.bodyType === "Female"} type="checkbox" checked={design.beard} onChange={event => { const beard = event.currentTarget.checked; setDesign(d => ({ ...d, beard })); setMessage("") }} />Short beard</label>
            {controls(["shadow", "ink"])}
          </Section>
          <Section {...section("Walking")}>
            {controls(["stride"])}
            <Tuner label="Walk timing" labelClassName="w-28" value={fps} min={1} max={24} display={`${fps} fps`} onChange={setFps} />
          </Section>
          <Section {...section("Inspection")}>
            <label className="person-check"><input type="checkbox" checked={onion} onChange={e => setOnion(e.target.checked)} />Previous frame ghost</label>
            <label className="person-check"><input type="checkbox" checked={sides} onChange={e => setSides(e.target.checked)} />Track left / right</label>
            <label className="person-check"><input type="checkbox" checked={guides} onChange={e => setGuides(e.target.checked)} />Attachment guides</label>
            <div className="person-palette">{renderPalette.map(color => <span key={color} title={color} style={{ background: color }} />)}</div>
            <p className="person-hint">{pixels} × {pixels} px cell · {renderPalette.length} colours<br />{sheetMatchesDesign ? `${bake.metadata.safePadding} px safe margin` : "Checking margins…"}</p>
          </Section>
          <Section {...section("Files", false)}>
            <div className="person-file-actions">
              <button className={button} onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(design, null, 2) + "\n"], { type: "application/json" })); download(url, `person-design-v${BASE_PERSON.version}.json`); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>Download parameters</button>
              <label className={`${button} person-file-input`}>Load parameters<input aria-label="Load person parameters" type="file" accept="application/json,.json" onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = ""
                if (!file) return
                try {
                  if (file.size > 16384) throw new Error("Parameter files must be under 16 KB.")
                  setDesign(validatePersonDesign(JSON.parse(await file.text()))); setMessage("Parameters loaded. Preview them, then apply to road.")
                } catch (e) { setMessage(e instanceof Error ? e.message : "Invalid parameter file.") }
              }} /></label>
              <button className={button} disabled={!ready} onClick={() => bake && download(bake.walk, `base-person-v${BASE_PERSON.version}-walk.png`)}>Download walk sheet</button>
              <button className={button} disabled={!ready} onClick={() => bake && download(bake.idle, `base-person-v${BASE_PERSON.version}-idle.png`)}>Download idle sheet</button>
              <button className={button} disabled={!ready} onClick={() => bake && download(bake.shadowWalk, `base-person-v${BASE_PERSON.version}-shadow-walk.png`)}>Download walk shadows</button>
              <button className={button} disabled={!ready} onClick={jsonDownload}>Download attachment data</button>
              <Link className={button} href="/assets/characters/callings">Earlier character drafts <ArrowUpRight size={12} /></Link>
            </div>
          </Section>
        </div>
        <footer className="person-panel-footer">
          <p className="person-hint">Apply these proportions to the mixed crowd. Clothing keeps each calling’s color.</p>
          <button className={`${button} person-apply`} disabled={!ready} onClick={() => { if (bake) { applyDesign(design, bake); void usePopulationStore.getState().prepare(design); setMessage("Foundation saved. Road characters keep their calling colors and varied bodies.") } }}><Check size={14} />Apply to road</button>
          <button className={button} onClick={() => { usePersonDesignStore.getState().reset(); void usePopulationStore.getState().prepare(null); setDesign({ ...DEFAULT_DESIGN }); setMessage("Project default restored on the road.") }}><RotateCcw size={12} />Restore project default</button>
        </footer>
      </aside>
      <div className="person-preview" aria-label="Character preview">
        <div className="person-preview-toolbar hud-well">
          <div className="person-playback"><button className="hud-pause" aria-label={playing ? "Pause" : "Play"} disabled={clip === "idle" || view === "sheet"} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
            <label>Clip<select aria-label="Animation clip" value={clip} onChange={e => setClip(e.target.value as BaseClip)}><option value="walk">Walk</option><option value="idle">Idle</option></select></label>
            <label>Zoom<select aria-label="Pixel inspection zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[1, 2, 4, 6, 8].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
          </div>
          <div className="person-view-buttons" aria-label="Preview modes">{([['character', 'Character'], ['native', 'Native size'], ['sheet', 'Sprite sheet']] as const).map(([mode, label]) => <button key={mode} className={button} aria-pressed={view === mode} onClick={() => setView(mode)}>{label}</button>)}</div>
        </div>
        <div ref={stageRef} className={`person-stage person-stage-${view}`}>
          {error || storeError ? <p role="alert" className="person-stage-message">{error || storeError} Try another preset or smaller proportions.</p> : !bake ? <p className="person-stage-message">Rendering the base person…</p> : view === "sheet" ? <div className="person-sheet">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sides ? bake.debugWalk : bake.walk} width={pixels * 8} height={pixels * 8} alt="Base person: eight directions and eight walk frames" />
          </div> : view === "native" ? <div className="person-native" aria-label="Native size lineup">
            {BASE_PERSON.directions.map((d, i) => <div key={d}><Tile url={url} shadowUrl={shadowUrl} row={i} frame={visibleFrame} columns={columns} name={`${d}, native ${BASE_PERSON.nominalHeightPixels}px person`} /><span>{d}</span></div>)}
          </div> : <div className="person-sprite" style={{ width: pixels * fittedZoom, height: pixels * fittedZoom }}>
            {onion && !live && clip === "walk" && <div className="absolute inset-0 opacity-25"><Tile url={url} row={row} frame={(frame + 7) % 8} columns={columns} zoom={fittedZoom} name="Previous frame ghost" /></div>}
            <Tile url={url} shadowUrl={shadowUrl} row={row} frame={visibleFrame} columns={columns} zoom={fittedZoom} name={`Base person ${direction}, frame ${visibleFrame + 1}`} />
            {guides && <svg aria-label="Origin and attachment guides" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${pixels} ${pixels}`}>
              <path d={`M${BASE_PERSON.anchor[0]} 0V${pixels} M0 ${BASE_PERSON.anchor[1]}H${pixels}`} stroke="#d9d5a7" strokeWidth="0.15" strokeDasharray="1 1" />
              {SOCKET_NAMES.map(name => {
                const point = sockets?.[name]
                return point ? <circle key={name} cx={point.x} cy={point.y} r="0.55" stroke="#1e2620" strokeWidth="0.15" fill={name.startsWith("left") ? "#329bc2" : name.startsWith("right") ? "#db7540" : "#eed66b"}><title>{name}</title></circle> : null
              })}
            </svg>}
          </div>}
          <div className="person-stage-caption">{view === "native" ? "Actual pixels · 1×" : view === "sheet" ? "Walk atlas · 64 poses" : `${direction} · ${fittedZoom}×${fittedZoom < zoom ? " · fitted to view" : ""}`}</div>
        </div>
        <div className="person-animation-dock hud-well">
          <div className="person-direction-strip" aria-label="Character directions">{BASE_PERSON.directions.map((d, i) => <button key={d} aria-label={`Face ${d}`} aria-pressed={row === i} onClick={() => { setRow(i); setView("character") }} className="hud-building-tile person-direction">
            {bake && <Tile url={url} shadowUrl={shadowUrl} row={i} frame={visibleFrame} columns={columns} name={`${d} direction`} />}<span>{d}</span>
          </button>)}</div>
          <div className="person-steps"><span>Walk cycle</span><div>{Array.from({ length: 8 }, (_, f) => <button key={f} className="hud-pause" disabled={!sheetMatchesDesign} aria-label={`Inspect step ${f + 1}`} aria-pressed={clip === "walk" && frame === f} onClick={() => { setFrame(f); setClip("walk"); setPlaying(false); setView("character") }}>{f + 1}</button>)}</div><span className="person-step-count">{clip === "idle" ? "Idle" : `${frame + 1} / 8`}</span></div>
        </div>
      </div>
    </div>
    <footer className="person-status"><span role="status">{dragging ? "Live preview · release to finish sprite sheets." : busy ? "Updating sprite sheets…" : populationBuilding ? `Updating road characters · ${Math.round(populationProgress * 100)}%` : populationError || message || "Ready · changes preview instantly"}</span><span className="person-status-detail">8 directions · {fps} fps</span></footer>
  </section>
}
