"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type MutableRefObject } from "react"
import { CAMERAS, CHARACTERS, comparisonQuery, DEFAULT_METHODS, DEFAULT_SETTINGS, METHODS, MOTIONS, readMethods, readSettings, type LabSettings, type Method } from "@/lib/render-lab/settings"
import { LabRenderer } from "./renderer"

type Draw = (settings: LabSettings, time: number) => void
const button = "border border-rule bg-parchment-dark px-3 py-2 font-display text-[10px] uppercase tracking-[1.5px] text-ink hover:border-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-40"
const input = "w-full border border-rule bg-parchment px-2 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-gold"
const SAVE_KEY = "pilgrimage-rendering-choice-v1"

function Select({ label, value, options, onChange }: { label: string; value: string; options: Record<string, string>; onChange: (value: string) => void }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-light">
    {label}<select aria-label={label} className={input} value={value} onChange={event => onChange(event.target.value)}>
      {Object.entries(options).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select>
  </label>
}

function Slider({ label, value, min, max, step, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="flex flex-col gap-2 text-xs text-ink-light">
    <span className="flex justify-between gap-3">{label}<span className="tabular-nums text-ink">{Number(value.toFixed(2))}{suffix}</span></span>
    <input aria-label={label} type="range" className="w-full accent-gold" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>
}

function RenderPane({ index, method, character, frames, focus }: { index: number; method: Method; character: LabSettings["character"]; frames: MutableRefObject<Map<number, Draw>>; focus: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const currentMethod = useRef(method)
  currentMethod.current = method
  const [status, setStatus] = useState("Loading artwork…")
  useEffect(() => {
    const element = canvas.current!
    let renderer: LabRenderer | undefined
    let active = true
    setStatus("Loading artwork…")
    const fail = (message: string) => { frames.current.delete(index); if (active) setStatus(message) }
    const lost = (event: Event) => { event.preventDefault(); fail("Graphics context lost. Reload this page to continue.") }
    element.addEventListener("webglcontextlost", lost)
    const observer = new ResizeObserver(([entry]) => renderer?.resize(entry.contentRect.width, entry.contentRect.height))
    try {
      renderer = new LabRenderer(element, character)
      observer.observe(element)
      renderer.resize(element.clientWidth, element.clientHeight)
      renderer.load().then(() => {
        if (!active) return
        setStatus("")
        frames.current.set(index, (settings, seconds) => {
          try { renderer!.render(settings, currentMethod.current, seconds) }
          catch { fail("This view could not render. Reload this page to try again.") }
        })
      }).catch(error => fail(error instanceof Error ? error.message : "Artwork could not load."))
    } catch { fail("WebGL is unavailable. Open this page in a browser with hardware acceleration.") }
    return () => {
      active = false
      frames.current.delete(index)
      observer.disconnect()
      element.removeEventListener("webglcontextlost", lost)
      renderer?.dispose()
    }
  }, [character, frames, index])
  return <div className={`relative bg-[#14100a] ${focus ? "h-[60vh] min-h-[360px]" : "h-[300px] sm:h-[340px]"}`}>
    <canvas ref={canvas} className="block h-full w-full" role="img" aria-label={`${METHODS[method].label}: three characters walking through the same road, trees, cottage, and fence`} />
    {status && <div role="status" className="absolute inset-0 flex items-center justify-center bg-[#14100a]/90 px-8 text-center text-sm text-parchment">{status}</div>}
  </div>
}

/**
 * Synchronized rendering experiments. Choices are recorded locally for review;
 * they do not change /play's renderer.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0 — Pixel workshop, frame 1YV-0.
 */
export function RenderLab() {
  const [settings, setSettings] = useState<LabSettings>(DEFAULT_SETTINGS)
  const [methods, setMethods] = useState<Method[]>(DEFAULT_METHODS)
  const [playing, setPlaying] = useState(true)
  const [focus, setFocus] = useState<number | null>(null)
  const [time, setTime] = useState(0)
  const [choice, setChoice] = useState<Method | null>(null)
  const [notes, setNotes] = useState("")
  const [message, setMessage] = useState("")
  const [shareUrl, setShareUrl] = useState("")
  const [hydrated, setHydrated] = useState(false)
  const frames = useRef(new Map<number, Draw>())
  const elapsed = useRef(0)
  const latest = useRef({ settings, playing, focus })
  latest.current = { settings, playing, focus }
  const patch = (change: Partial<LabSettings>) => setSettings(current => ({ ...current, ...change }))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSettings(readSettings(params)); setMethods(readMethods(params))
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null")
      if (saved && typeof saved.method === "string" && Object.hasOwn(METHODS, saved.method)) {
        setChoice(saved.method); setNotes(typeof saved.notes === "string" ? saved.notes : "")
      }
    } catch { /* Storage may be disabled; comparisons still work. */ }
    setHydrated(true)
  }, [])

  useEffect(() => {
    let id = 0, previous = performance.now(), lastLabel = 0
    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.1)
      previous = now
      const { settings, playing, focus } = latest.current
      // Start together after every visible pane has its artwork. One time value
      // and one RAF drive all views, including pause, stepping, and scrubbing.
      if (playing && !document.hidden && frames.current.size === (focus === null ? 4 : 1)) elapsed.current += dt * settings.speed
      if (!document.hidden) frames.current.forEach(draw => draw(settings, elapsed.current))
      if (now - lastLabel > 150) { setTime(elapsed.current); lastLabel = now }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])

  const seek = (seconds: number) => { elapsed.current = seconds; setTime(seconds) }
  const selectChoice = (method: Method) => {
    setChoice(method)
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ method, settings, methods, notes, time: elapsed.current, savedAt: new Date().toISOString() }))
      setMessage(`Saved “${METHODS[method].label}” with these settings and notes on this browser.`)
    } catch { setMessage(`Selected “${METHODS[method].label}”. Browser storage is unavailable; copy the comparison link to keep the settings.`) }
  }
  const share = async () => {
    const url = `${window.location.origin}/assets/rendering?${comparisonQuery(settings, methods)}`
    setShareUrl(url)
    window.history.replaceState(null, "", url)
    try { await navigator.clipboard.writeText(url); setMessage("Comparison link copied. It restores the four methods and shared controls.") }
    catch { setMessage("Select and copy the comparison link below.") }
  }
  const reset = () => {
    setSettings(DEFAULT_SETTINGS); setMethods(DEFAULT_METHODS); setFocus(null); seek(0); setPlaying(true)
    setMessage(""); setShareUrl(""); window.history.replaceState(null, "", "/assets/rendering")
  }

  return <main className="min-h-screen bg-[#14100a] px-4 py-8 text-parchment sm:px-8">
    <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Link href="/assets" className="font-display text-[10px] uppercase tracking-[3px] text-gold hover:text-gold-light">← Assets</Link>
          <h1 className="mt-4 font-display text-2xl font-semibold uppercase tracking-[4px] sm:text-3xl">Pixel workshop</h1>
          <p className="mt-2 text-base text-parchment-dark">One scene. Different ways to draw it. Follow the feet, watch the face, and move past the trees.</p>
        </div>
        <a href="https://app.conductor.build/workspace/8ffb9739-5c1f-478d-871c-26deb51f420e" className="text-xs text-gold underline underline-offset-4">Artwork from the character workspace ↗</a>
      </header>

      <section aria-label="Shared comparison controls" className="border border-rule bg-parchment p-4 text-ink sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} onClick={() => setPlaying(value => !value)}>{playing ? "Pause" : "Play"}</button>
          <button type="button" className={button} onClick={() => { setPlaying(false); seek(elapsed.current + 1 / settings.fps) }}>Step one frame</button>
          <button type="button" className={button} onClick={() => seek(0)}>Restart walk</button>
          <span className="px-2 text-xs tabular-nums text-ink-light">{time.toFixed(2)} s · synchronized</span>
          <span className="flex-1" />
          <button type="button" className={button} onClick={share}>Copy comparison link</button>
          <button type="button" className={button} onClick={reset}>Reset controls</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Select label="Character" value={settings.character} options={Object.fromEntries(CHARACTERS.map(id => [id, id === "base" ? "Base person · v8" : id[0].toUpperCase() + id.slice(1)]))} onChange={character => patch({ character: character as LabSettings["character"] })} />
          <Select label="Movement test" value={settings.motion} options={MOTIONS} onChange={motion => { patch({ motion: motion as LabSettings["motion"] }); seek(0) }} />
          <Select label="Camera test" value={settings.camera} options={CAMERAS} onChange={camera => patch({ camera: camera as LabSettings["camera"] })} />
          <Select label="View" value={String(settings.view)} options={{ 0: "View 1", 1: "View 2", 2: "View 3", 3: "View 4" }} onChange={view => patch({ view: Number(view) })} />
          <Select label="Display resolution" value={String(settings.dpr)} options={{ "0.5": "Half resolution", "1": "1× · game default", "1.5": "1.5×", "2": "2× · Retina" }} onChange={dpr => patch({ dpr: Number(dpr) })} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-5">
          <Slider label="Zoom" value={settings.zoom} min={0.5} max={4} step={0.05} suffix="×" onChange={zoom => patch({ zoom })} />
          <Slider label="World detail" value={settings.density} min={8} max={64} step={1} suffix=" px/unit" onChange={density => patch({ density })} />
          <Slider label="Character size" value={settings.scale} min={0.5} max={3} step={0.05} suffix="×" onChange={scale => patch({ scale })} />
          <Slider label="Playback speed" value={settings.speed} min={0.1} max={2} step={0.1} suffix="×" onChange={speed => patch({ speed })} />
          <Slider label="Walk animation" value={settings.fps} min={1} max={16} step={1} suffix=" fps" onChange={fps => patch({ fps })} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-rule pt-3 text-xs text-ink-light">
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-gold" checked={settings.scenery} onChange={event => patch({ scenery: event.target.checked })} />Scenery and overlap test</label>
          <label className="flex min-w-52 flex-1 items-center gap-3">Scrub walk<input aria-label="Scrub walk" type="range" min={0} max={17.142857} step={0.01} value={time % 17.142857} onChange={event => { setPlaying(false); seek(Number(event.target.value)) }} className="w-full accent-gold" /></label>
          <span>Try “Slide a frozen pose” to isolate rendering from animation.</span>
        </div>
      </section>

      {focus !== null && <div className="flex items-center justify-between"><p className="text-sm text-parchment-dark">Focused view · shared settings are retained</p><button type="button" className={button} onClick={() => setFocus(null)}>Back to four views</button></div>}
      <section aria-label="Rendering comparisons" className={`grid gap-5 ${focus === null ? "xl:grid-cols-2" : "grid-cols-1"}`}>
        {methods.map((method, index) => (focus === null || focus === index) && <article key={index} className={`overflow-hidden border bg-parchment text-ink ${choice === method ? "border-gold ring-2 ring-gold" : "border-rule"}`}>
          <div className="flex items-start gap-4 p-4">
            <span className="pt-6 font-display text-2xl text-gold">{String.fromCharCode(65 + index)}</span>
            <div className="min-w-0 flex-1"><Select label={`View ${String.fromCharCode(65 + index)} rendering method`} value={method} options={Object.fromEntries(Object.entries(METHODS).map(([key, item]) => [key, item.label]))} onChange={value => setMethods(current => current.map((item, i) => i === index ? value as Method : item))} />
              <p className="mt-2 min-h-10 text-sm text-ink-light">{METHODS[method].description}</p>
            </div>
          </div>
          {hydrated && <RenderPane index={index} method={method} character={settings.character} frames={frames} focus={focus !== null} />}
          <div className="flex min-h-24 flex-wrap items-center justify-between gap-3 p-4">
            <p className="max-w-sm flex-1 text-sm italic text-ink-light">{METHODS[method].watch}</p>
            <div className="flex gap-2">
              <button type="button" className={button} onClick={() => setFocus(focus === index ? null : index)}>{focus === index ? "Compare all" : "Focus"}</button>
              <button type="button" className={button} aria-pressed={choice === method} onClick={() => selectChoice(method)}>{choice === method ? "Chosen · save again" : "Choose this look"}</button>
            </div>
          </div>
        </article>)}
      </section>

      <section aria-label="Comparison notes" className="grid gap-5 border border-rule bg-parchment p-5 text-ink md:grid-cols-2">
        <div>
          <h2 className="font-display text-sm uppercase tracking-[2px]">What to compare</h2>
          <p className="mt-2 text-sm text-ink-light">First watch a frozen pose slide, then turn walking back on. Pan with a standing character to check camera shimmer. Finally watch the fence cross the body and the tree hide the walker.</p>
          <p className="mt-2 text-sm text-ink-light">Each menu also offers global pixels with snapped movement. Smooth zoom can still make pixel widths uneven. “Pixels per asset” rebuilds scenery images during camera turns; this is a visual experiment, not a performance benchmark.</p>
          <p className="mt-2 text-sm text-ink-light">These views use copied sprite artwork and fixed sample scenery, with the game’s tree shapes, lighting, and camera angle. Selection outlines and character shadows are omitted in every view to isolate pixel rendering. The game now uses Separate characters; the alternatives stay here for comparison.</p>
        </div>
        <div>
          <label className="flex flex-col gap-2 text-sm" htmlFor="render-notes">Notes for the chosen look<textarea id="render-notes" className={`${input} min-h-24 resize-y`} placeholder="What feels right? What still jitters?" value={notes} onChange={event => setNotes(event.target.value)} /></label>
          <p className="mt-2 text-xs text-ink-light">Use “Choose this look” to save the current settings and these notes. {choice && `Saved preference: ${METHODS[choice].label}.`}</p>
          <p role="status" className="mt-2 min-h-5 text-sm text-ink">{message}</p>
          {shareUrl && <label className="mt-2 flex flex-col gap-1 text-xs">Comparison link<input readOnly className={input} value={shareUrl} onFocus={event => event.target.select()} /></label>}
        </div>
      </section>
    </div>
  </main>
}
