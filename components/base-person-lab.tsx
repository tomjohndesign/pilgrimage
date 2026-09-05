"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BASE_PERSON, SOCKET_NAMES, type BaseClip } from "@/lib/game/base-person/pose"
import { cachedPersonBake, renderPersonPreview, type BasePersonBake, type PersonPreview } from "@/lib/game/base-person/bake"

import { DEFAULT_DESIGN, DESIGN_CONTROLS, HAIR_STYLES, PERSON_PRESETS, personRecipe, withBodyType, validatePersonDesign, type DesignKey, type PersonDesign } from "@/lib/game/base-person/design"
import { usePersonDesignStore } from "@/lib/game/base-person/design-store"

const button = "border border-rule px-3 py-2 text-xs hover:bg-parchment-dark disabled:opacity-40"
const smallLabel = "font-display text-[10px] uppercase tracking-[2px] text-ink-light"

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

  return <section className="w-full max-w-6xl border border-rule bg-parchment text-ink shadow-[0_0_0_3px_var(--parchment-dark),0_0_0_4px_var(--rule)]" aria-label="Base person template">
    <header className="flex flex-wrap justify-between gap-4 border-b border-rule px-6 py-5">
      <div><p className={smallLabel}>Shared foundation · v{BASE_PERSON.version} draft</p><h2 className="mt-1 font-display text-xl">One small person.</h2></div>
      <p className="max-w-xs text-sm leading-relaxed text-ink-light">A shared person with a shaped tunic, bare feet and a soft cast shadow. Adjust one body; every view and step stays consistent.</p>
    </header>
    <div className="border-b border-rule p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={smallLabel}>Shape the person</p>
        <div className="flex gap-2">{Object.entries(PERSON_PRESETS).map(([name, preset]) => <button key={name} className={button} onClick={() => { setDesign({ ...preset }); setMessage("") }}>{name}</button>)}</div>
      </div>
      <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">{(Object.keys(DESIGN_CONTROLS) as DesignKey[]).map((key) => {
        const control = DESIGN_CONTROLS[key]
        return <label key={key} className="text-xs">{control.label}<span className="float-right font-mono">{Math.round(design[key] * 100)}%</span>
          <input aria-label={control.label} type="range" min={control.min} max={control.max} step={control.step} value={design[key]}
            onChange={(e) => { const value = Number(e.currentTarget.value); setDesign((d) => ({ ...d, [key]: value })); setMessage("") }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true) }}
            onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onLostPointerCapture={() => setDragging(false)} className="mt-2 w-full accent-[#94742f]" /></label>
      })}</div>
      <div className="mt-5 grid gap-4 border-t border-rule/50 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {([["tunicColor", "Clothing color"], ["skinColor", "Skin color"], ["hairColor", "Hair color"]] as const).map(([key, label]) => <label key={key} className="text-xs">{label}
          <input type="color" aria-label={label} value={design[key]} onChange={(event) => { const value = event.currentTarget.value; setDesign(d => ({ ...d, [key]: value })); setMessage("") }} className="mt-2 block h-9 w-full cursor-pointer border border-rule bg-transparent" />
        </label>)}
        <label className="text-xs">Body type<select aria-label="Body type" value={design.bodyType} onChange={event => { const bodyType = event.currentTarget.value as PersonDesign["bodyType"]; setDesign(d => withBodyType(d, bodyType)); setMessage("") }} className="mt-2 block h-9 w-full border border-rule bg-parchment px-2"><option>Male</option><option>Female</option></select></label>
        <label className="text-xs">Hair style<select aria-label="Hair style" value={design.hairStyle} onChange={event => { const hairStyle = event.currentTarget.value as PersonDesign["hairStyle"]; setDesign(d => ({ ...d, hairStyle })); setMessage("") }} className="mt-2 block h-9 w-full border border-rule bg-parchment px-2">{HAIR_STYLES.map(style => <option key={style}>{style}</option>)}</select></label>
        <label className="flex items-center gap-2 text-xs"><input aria-label="Short beard" disabled={design.bodyType === "Female"} type="checkbox" checked={design.beard} onChange={event => { const beard = event.currentTarget.checked; setDesign(d => ({ ...d, beard })); setMessage("") }} />Short beard</label>
      </div>
      <p className="mt-3 text-xs text-ink-light">Torso height stretches the body above the waist. Shoulder height moves the arms relative to it. Step reach changes the pose; use Stride in Play to match travel speed.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className={button} disabled={busy || !!error || !bake || !sheetMatchesDesign} onClick={() => { if (bake) { applyDesign(design, bake); setMessage("Applied to every base person on the road. Saved in this browser.") } }}>Apply to road</button>
        <button className={button} onClick={() => { usePersonDesignStore.getState().reset(); setDesign({ ...DEFAULT_DESIGN }); setMessage("Project default restored on the road.") }}>Restore project default</button>
        <button className={button} onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(design, null, 2) + "\n"], { type: "application/json" })); download(url, `person-design-v${BASE_PERSON.version}.json`); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>Download parameters</button>
        <label className={`${button} cursor-pointer`}>Load parameters<input aria-label="Load person parameters" type="file" accept="application/json,.json" className="sr-only" onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = ""
          if (!file) return
          try {
            if (file.size > 16384) throw new Error("Parameter files must be under 16 KB.")
            setDesign(validatePersonDesign(JSON.parse(await file.text()))); setMessage("Parameters loaded. Preview them, then apply to road.")
          } catch (e) { setMessage(e instanceof Error ? e.message : "Invalid parameter file.") }
        }} /></label>
        <span role="status" className="text-xs text-ink-light">{dragging ? "Live preview · release to finish sprite sheets." : busy ? "Updating sprite sheets…" : message || "Rendered locally from the same rig. No image generation needed."}</span>
      </div>
      {storeError && <p role="alert" className="mt-3 text-xs">{storeError}</p>}
    </div>
    {error ? <p role="alert" className="p-6">{error} Try another preset or smaller proportions.</p> : !bake ? <p role="status" className="p-6">Rendering the base person…</p> : <>
      <div className="grid md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 p-5 md:p-6">
          <p className={`${smallLabel} mb-3`}>Native size · 1 screen pixel = 1 sprite pixel</p>
          <div className="flex min-h-24 flex-wrap items-center justify-center gap-2 border border-rule bg-[#62724d] px-2 py-5" aria-label="Native size lineup">
            {BASE_PERSON.directions.map((d, i) => <Tile key={d} url={url} shadowUrl={shadowUrl} row={i} frame={visibleFrame} columns={columns} name={`${d}, native ${BASE_PERSON.nominalHeightPixels}px person`} />)}
          </div>
          <div className="mt-5 flex items-center justify-between"><p className={smallLabel}>Pixel inspection · {zoom}×</p><span className="font-mono text-xs">{direction} · {clip === "idle" ? "idle" : `${frame + 1}/8`}</span></div>
          <div className="mt-3 flex min-h-64 items-center justify-center overflow-auto border border-rule bg-[#bcbcab]" style={{ backgroundImage: "conic-gradient(#b0b1a0 25%, transparent 0 50%, #b0b1a0 0 75%, transparent 0)", backgroundSize: "16px 16px" }}>
            <div className="relative" style={{ width: pixels * zoom, height: pixels * zoom }}>
              {onion && !live && clip === "walk" && <div className="absolute inset-0 opacity-25"><Tile url={url} row={row} frame={(frame + 7) % 8} columns={columns} zoom={zoom} name="Previous frame ghost" /></div>}
              <Tile url={url} shadowUrl={shadowUrl} row={row} frame={visibleFrame} columns={columns} zoom={zoom} name={`Base person ${direction}, frame ${visibleFrame + 1}`} />
              {guides && <svg aria-label="Origin and attachment guides" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${pixels} ${pixels}`}>
                <path d={`M${BASE_PERSON.anchor[0]} 0V${pixels} M0 ${BASE_PERSON.anchor[1]}H${pixels}`} stroke="#504e41" strokeWidth="0.15" strokeDasharray="1 1" />
                {SOCKET_NAMES.map((name) => {
                  const point = sockets?.[name]
                  return point ? <circle key={name} cx={point.x} cy={point.y} r="0.55" stroke="#1e2620" strokeWidth="0.15" fill={name.startsWith("left") ? "#329bc2" : name.startsWith("right") ? "#db7540" : "#eed66b"}><title>{name}</title></circle> : null
                })}
              </svg>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className={button} disabled={clip === "idle"} onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
            <label className="text-xs">Clip <select aria-label="Animation clip" className="border border-rule bg-transparent p-2" value={clip} onChange={(e) => setClip(e.target.value as BaseClip)}><option value="walk">Walk</option><option value="idle">Idle</option></select></label>
            <label className="text-xs">Zoom <select aria-label="Pixel inspection zoom" className="border border-rule bg-transparent p-2" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>{[1, 2, 4, 6, 8].map((n) => <option key={n} value={n}>{n}×</option>)}</select></label>
          </div>
          <p className={`${smallLabel} mt-6 mb-2`}>Eight directions · one body</p>
          <div className="grid grid-cols-4 gap-1 lg:grid-cols-8">{BASE_PERSON.directions.map((d, i) => <button key={d} aria-label={`Face ${d}`} aria-pressed={row === i} onClick={() => setRow(i)} className={`flex flex-col items-center border py-2 text-[10px] ${row === i ? "border-gold bg-[#dad2bb]" : "border-rule/40"}`}>
            <Tile url={url} shadowUrl={shadowUrl} row={i} frame={visibleFrame} columns={columns} name={`${d} direction`} />{d}
          </button>)}</div>
          <p className={`${smallLabel} mt-5 mb-2`}>Eight steps · click to freeze</p>
          <div className="grid grid-cols-4 gap-1 lg:grid-cols-8">{Array.from({ length: 8 }, (_, f) => <button key={f} disabled={!sheetMatchesDesign} aria-label={`Inspect step ${f + 1}`} aria-pressed={clip === "walk" && frame === f} onClick={() => { setFrame(f); setClip("walk"); setPlaying(false) }} className={`flex flex-col items-center border py-2 text-[10px] disabled:opacity-40 ${clip === "walk" && frame === f ? "border-gold bg-[#dad2bb]" : "border-rule/40"}`}>
            <Tile shadowUrl={sides ? undefined : bake.shadowWalk} url={sides ? bake.debugWalk : bake.walk} row={row} frame={f} columns={8} name={`Step ${f + 1}`} />{f + 1}
          </button>)}</div>
        </div>
        <aside className="border-t border-rule p-5 md:border-t-0 md:border-l">
          <p className={smallLabel}>Detail budget</p>
          <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><dt>Figure</dt><dd>~{BASE_PERSON.nominalHeightPixels} px tall</dd></div><div className="flex justify-between"><dt>Cell</dt><dd>{pixels} × {pixels} px</dd></div><div className="flex justify-between"><dt>Safe margin</dt><dd>{sheetMatchesDesign ? `${bake.metadata.safePadding} px minimum` : "Checking sheets…"}</dd></div><div className="flex justify-between"><dt>Palette</dt><dd>{renderPalette.length} colours</dd></div><div className="flex justify-between"><dt>Equipment</dt><dd>None</dd></div></dl>
          <div className="mt-4 flex flex-wrap gap-1">{renderPalette.map((color) => <span key={color} title={color} className="h-4 w-4 border border-black/20" style={{ background: color }} />)}</div>
          <div className="my-6 border-t border-rule" />
          <p className={smallLabel}>Check consistency</p>
          <div className="mt-4 space-y-3 text-sm">
            <label className="flex gap-2"><input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} />Previous frame ghost</label>
            <label className="flex gap-2"><input type="checkbox" checked={sides} onChange={(e) => setSides(e.target.checked)} />Track left / right</label>
            <label className="flex gap-2"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />Attachment guides</label>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-light">Blue is the person’s left; orange is their right. Those sides stay attached as the body turns.</p>
          <label className="mt-5 block text-sm">Walk timing <span className="float-right font-mono text-xs">{fps} fps</span><input aria-label="Walk timing" className="mt-2 w-full accent-[#94742f]" type="range" min="1" max="24" value={fps} onChange={(e) => setFps(Number(e.target.value))} /></label>
          <div className="my-6 border-t border-rule" />
          <p className={smallLabel}>Template rules</p>
          <p className="mt-3 text-xs leading-relaxed text-ink-light">Fixed body proportions, camera, palette and origin. No resizing individual frames. Future clothes and accessories attach to this body.</p>
          <a href="https://github.com/OpenRCT2/OpenRCT2/issues/7125" target="_blank" rel="noreferrer" className="mt-4 inline-block text-xs underline underline-offset-4">RCT2 guest reference ↗</a>
        </aside>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-rule px-6 py-4">
        <button className={button} disabled={busy} onClick={() => download(bake.walk, `base-person-v${BASE_PERSON.version}-walk.png`)}>Download walk sheet</button>
        <button className={button} disabled={busy} onClick={() => download(bake.idle, `base-person-v${BASE_PERSON.version}-idle.png`)}>Download idle sheet</button>
        <button className={button} disabled={busy} onClick={() => download(bake.shadowWalk, `base-person-v${BASE_PERSON.version}-shadow-walk.png`)}>Download walk shadows</button>
        <button className={button} disabled={busy} onClick={jsonDownload}>Download attachment data</button>
      </div>
      <details className="border-t border-rule p-6"><summary className="cursor-pointer text-sm">Full walk sheet · 64 poses</summary>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bake.walk} width={pixels * 8} height={pixels * 8} alt="Base person: eight directions and eight walk frames" className="mt-4 max-w-full bg-[#62724d]" style={{ imageRendering: "pixelated" }} />
      </details>
    </>}
    <footer className="flex flex-wrap justify-between gap-3 border-t border-rule px-6 py-4 text-xs text-ink-light">
      <span>Base template for review. Character outfits come next.</span>
      <Link href={`/play?characters=base&baseSize=1.5&speed=0.5&fps=${fps}`} className="underline underline-offset-4">Try on the road →</Link>
      <Link href="/assets/characters/callings" className="underline underline-offset-4">Earlier character drafts →</Link>
    </footer>
  </section>
}
