"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Check, Pause, Play, RotateCcw, X } from "lucide-react"
import { AssetEditorFrame, type AssetEditorNavigation } from "./asset-editor-frame"
import { Section, Tuner } from "@/components/game/property-controls"
import "./game/game-hud.css"
import "./base-person-lab.css"
import { actionPlaybackRate } from "@/lib/game/base-person/activity"
import { BASE_PERSON, PERSON_CLIPS, SOCKET_NAMES, type BaseClip } from "@/lib/game/base-person/pose"
import { cachedPersonBake, renderPersonPreview, type BasePersonBake, type PersonPreview } from "@/lib/game/base-person/bake"

import { DEFAULT_DESIGN, DESIGN_CONTROLS, HAIR_STYLES, HAT_STYLES, TUNIC_STYLES, PERSON_PRESETS, personRecipe, withBodyType, validatePersonDesign, type DesignKey, type PersonDesign } from "@/lib/game/base-person/design"
import { usePopulationStore } from "@/lib/game/base-person/population-store"
import { usePersonDesignStore } from "@/lib/game/base-person/design-store"

import { characterEditsJson, parseCharacterEdits, restoreCharacterDesign } from "@/lib/game/base-person/share-edits"
import { RigOverlay, RigInspector } from "./person-rig-editor"
import { inspectRig } from "@/lib/game/base-person/rig-inspection"
import { poseOffset, setPoseKey, type EditableJoint, type PoseEdits } from "@/lib/game/base-person/pose-edits"
import type { RigJoint } from "@/lib/game/base-person/rig-joints"
import { staffMotion } from "@/lib/game/base-person/staff-motion"
import type { Point3 } from "@/lib/game/base-person/pose"
import { populationDesign, POPULATION_PROFILES } from "@/lib/game/base-person/population"
import { TRAVELER_TYPES } from "@/lib/game/travelers"

const ROAD_DESIGNS = Object.values(TRAVELER_TYPES).flatMap(type => POPULATION_PROFILES.map((profile, variant) => ({ id: `${type.id}/${profile.id}`, label: `${type.label} · ${profile.id.replaceAll("-", " ")}`, design: populationDesign(type, variant) })))
const DRAFT_KEY = "pilgrimage-rig-editor-v1"
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

/** Character proportions and editable animation poses.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0
 */
export function BasePersonLab({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    const target = window as unknown as { __bakePersonPopulation?: (progress?: (done: number) => void) => Promise<unknown> }
    target.__bakePersonPopulation = async progress => (await import("@/lib/game/base-person/bake-population")).bakePopulation(undefined, progress)
    return () => { delete target.__bakePersonPopulation }
  }, [])
  const [bake, setBake] = useState<BasePersonBake | null>(null)
  const [error, setError] = useState("")
  const [row, setRow] = useState(1)
  const [frame, setFrame] = useState(0)
  const [clip, setClip] = useState<BaseClip>("walk")
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("clip")
    if (requested && Object.keys(PERSON_CLIPS).includes(requested)) setClip(requested as BaseClip)
  }, [])
  const [playing, setPlaying] = useState(true)
  const [fps, setFps] = useState(BASE_PERSON.defaultFps)
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
  const [showRig, setShowRig] = useState(false)
  const [selectedJoint, setSelectedJoint] = useState<RigJoint>("rightHand")
  const [character, setCharacter] = useState("preset/Storybook")
  const drafts = useRef<Record<string, PersonDesign>>({})
  const [draftsReady, setDraftsReady] = useState(false)
  const [history, setHistory] = useState<PoseEdits[]>([])
  const [future, setFuture] = useState<PoseEdits[]>([])
  const dragSnapshot = useRef<PoseEdits | null>(null)
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null")
      if (stored?.drafts) {
        for (const [id, value] of Object.entries(stored.drafts)) drafts.current[id] = restoreCharacterDesign(value, stored.templateVersion ?? 20)
        if (drafts.current[stored.character]) { setCharacter(stored.character); setDesign(drafts.current[stored.character]) }
      } else {
        void usePersonDesignStore.getState().hydrate()
        setDesign(usePersonDesignStore.getState().design ?? DEFAULT_DESIGN)
      }
    } catch { setMessage("Saved editor draft could not load. Project defaults are available.") }
    setDraftsReady(true)
  }, [])
  useEffect(() => {
    if (!draftsReady) return
    drafts.current[character] = design
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ templateVersion: BASE_PERSON.version, character, drafts: drafts.current })) }
    catch { setMessage("Browser storage is unavailable. Copy edits as JSON to keep a backup.") }
  }, [design, character, draftsReady])
  const jsonDialog = useRef<HTMLDialogElement>(null)
  const jsonArea = useRef<HTMLTextAreaElement>(null)
  const [jsonText, setJsonText] = useState("")
  const [jsonMessage, setJsonMessage] = useState("")
  const editsJson = () => characterEditsJson(character, drafts.current, design)
  const openJson = (text = editsJson(), note = "") => {
    setPlaying(false); setJsonText(text); setJsonMessage(note); jsonDialog.current?.showModal()
    requestAnimationFrame(() => { jsonArea.current?.focus(); jsonArea.current?.select() })
  }
  const copyJson = async (text = editsJson()) => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage("All character drafts copied as JSON. Paste into the chat with ⌘V.")
      setJsonMessage("Copied. Paste into the chat with ⌘V.")
    } catch { openJson(text, "Clipboard access is unavailable. Press ⌘C to copy the selected JSON, then paste it into the chat.") }
  }
  const loadJson = () => {
    try {
      const imported = parseCharacterEdits(jsonText, character)
      const available = new Set([...Object.keys(PERSON_PRESETS).map(name => `preset/${name}`), ...ROAD_DESIGNS.map(entry => entry.id)])
      if (Object.keys(imported.drafts).some(id => !available.has(id))) throw new Error("These edits include an unknown character.")
      const merged = { ...drafts.current, [character]: design, ...imported.drafts }
      // Keep a recoverable copy of the pre-import drafts before replacing keys.
      localStorage.setItem(`${DRAFT_KEY}-before-import`, JSON.stringify({ templateVersion: BASE_PERSON.version, character, drafts: { ...drafts.current, [character]: design } }))
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ templateVersion: BASE_PERSON.version, character: imported.character, drafts: merged }))
      drafts.current = merged
      setCharacter(imported.character); setDesign(merged[imported.character]); setHistory([]); setFuture([]); setPlaying(false)
      setMessage("JSON loaded. Other character drafts kept; previous edits backed up in this browser.")
      jsonDialog.current?.close()
    } catch (error) { setJsonMessage(error instanceof Error ? error.message : "Could not load JSON. Your edits have not changed.") }
  }
  const chooseCharacter = (id: string, initial: PersonDesign) => {
    drafts.current[character] = design
    setCharacter(id); setDesign(drafts.current[id] ?? { ...initial }); setHistory([]); setFuture([]); setMessage("")
  }
  const inspected = useMemo(() => showRig ? inspectRig(design, clip, frame % PERSON_CLIPS[clip].frames, row) : {}, [showRig, design, clip, frame, row])
  const editFrame = (joint: EditableJoint) => joint === "staffTip" && clip === "walk" && staffMotion(frame / PERSON_CLIPS.walk.frames, personRecipe(design).body).planted ? 0 : frame % PERSON_CLIPS[clip].frames
  const currentOffset = (joint: EditableJoint) => poseOffset(design.poseEdits, clip, joint, editFrame(joint) / PERSON_CLIPS[clip].frames)
  const selectedKey = design.poseEdits?.[clip]?.[selectedJoint as EditableJoint]?.find(k => k.frame === editFrame(selectedJoint as EditableJoint))
  const radius = selectedKey?.radius ?? Math.min(3, Math.max(1, Math.floor(PERSON_CLIPS[clip].frames / 2)))
  const commitPose = (edits: PoseEdits) => {
    if (JSON.stringify(edits) === JSON.stringify(design.poseEdits ?? {})) return
    if (!dragSnapshot.current) { setHistory(h => [...h.slice(-49), design.poseEdits ?? {}]); setFuture([]) }
    setDesign(d => ({ ...d, poseEdits: edits })); setMessage("")
  }
  const changeJoint = (joint: EditableJoint, offset: Point3, blend = radius) => {
    setPlaying(false)
    const at = editFrame(joint)
    if (joint === "staffTip" && (clip === "idle" || (clip === "walk" && staffMotion(frame / PERSON_CLIPS.walk.frames, personRecipe(design).body).planted))) offset = [offset[0], 0, offset[2]]
    commitPose(setPoseKey(design.poseEdits, clip, joint, { frame: at, offset, radius: blend }, at))
  }
  const rigDragging = (active: boolean) => {
    setDragging(active); setPlaying(false)
    if (active) dragSnapshot.current = structuredClone(design.poseEdits ?? {})
    else if (dragSnapshot.current) {
      const before = dragSnapshot.current; dragSnapshot.current = null
      if (JSON.stringify(before) !== JSON.stringify(design.poseEdits ?? {})) { setHistory(h => [...h.slice(-49), before]); setFuture([]) }
    }
  }
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
        setPreview(renderPersonPreview(design, clip, frame % PERSON_CLIPS[clip].frames, sides))
        setError("")
      } catch (e) { setError(e instanceof Error ? e.message : "The preview could not render.") }
    })
    return () => cancelAnimationFrame(request)
  }, [design, clip, frame, sides, sheetMatchesDesign])
  useEffect(() => {
    if (!active || !playing || clip === "idle") return
    const timer = setInterval(() => setFrame((f) => (f + 1) % PERSON_CLIPS[clip].frames), 1000 / (fps * actionPlaybackRate(clip, design)))
    return () => clearInterval(timer)
  }, [active, playing, clip, fps, design.bodyType, design.walkStyle])

  const live = !sheetMatchesDesign && preview?.clip === clip && preview.sides === sides ? preview : null
  const columns = live ? 1 : PERSON_CLIPS[clip].frames
  const visibleFrame = live ? 0 : frame % PERSON_CLIPS[clip].frames
  const url = live?.url ?? (bake ? clip === "walk" || clip === "idle" ? sides ? clip === "walk" ? bake.debugWalk : bake.debugIdle : bake[clip] : sides ? bake.actions[clip].debug : bake.actions[clip].url : "")
  const shadowUrl = sides ? undefined : live?.shadowUrl ?? (clip === "walk" ? bake?.shadowWalk : clip === "idle" ? bake?.shadowIdle : bake?.actions[clip].shadow)
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
  const viewDrag = useRef<{ pointer: number; x: number; row: number } | null>(null)
  const [scrubbingViews, setScrubbingViews] = useState(false)
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

  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} label="Base person template"
    version={`Base person · v${BASE_PERSON.version}`} controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(!controlsOpen)}
    roadHref={`/play?characters=base&baseSize=1.5&fps=${fps}`}
    status={dragging ? "Live preview · release to finish sprite sheets." : busy ? "Updating sprite sheets…" : populationBuilding ? `Updating road characters · ${Math.round(populationProgress * 100)}%` : populationError || message || "Ready · changes preview instantly"}
    detail={`8 directions · ${fps} fps`}>
    <div className="person-workspace">
      <aside className={`person-controls hud-well ${controlsOpen ? "is-open" : ""}`} aria-label="Character controls">
        <div className="person-panel-heading"><span>Person</span><button className="hud-close person-controls-toggle" aria-label="Close character controls" onClick={() => setControlsOpen(false)}><X size={14} /></button></div>
        <div className="person-controls-scroll">
          <Section {...section("Presets")}><div className="person-presets">{Object.entries(PERSON_PRESETS).map(([name, preset]) => <button key={name} className={button} onClick={() => chooseCharacter(`preset/${name}`, preset)}>{name}</button>)}</div></Section>
          <Section {...section("Road characters")}><label className="person-choice">Character<select aria-label="Road character" value={character.startsWith("preset/") ? "" : character} onChange={e => { const entry = ROAD_DESIGNS.find(d => d.id === e.target.value); if (entry) chooseCharacter(entry.id, entry.design) }}><option value="" disabled>Choose calling / body</option>{ROAD_DESIGNS.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label></Section>
          <Section {...section("Body")}>
            <label className="person-choice">Body type<select aria-label="Body type" value={design.bodyType} onChange={event => { const bodyType = event.currentTarget.value as PersonDesign["bodyType"]; setDesign(d => withBodyType(d, bodyType)); setMessage("") }}><option>Male</option><option>Female</option></select></label>
            {controls(["head", "build", "torsoHeight", "neckHeight", "legs"])}
          </Section>
          <Section {...section("Arms")}>
            {controls(["shoulderHeight", "armSpacing", "upperArm", "forearm", "armAngle", "elbowBend", "armSwing", "hands", "sleeves"])}
          </Section>
          <Section {...section("Clothing")}>
            <label className="person-choice">Garment<select aria-label="Garment" value={design.garment} onChange={event => { const garment = event.currentTarget.value as PersonDesign["garment"]; setDesign(d => ({ ...d, garment })); setMessage("") }}><option>Everyday</option><option>Robe</option></select></label>
            <label className="person-choice">Belt<select aria-label="Belt" value={design.beltStyle} onChange={event => { const beltStyle = event.currentTarget.value as PersonDesign["beltStyle"]; setDesign(d => ({ ...d, beltStyle })); setMessage("") }}><option>Leather</option><option>Rope</option></select></label>
            <label className="person-choice">Tunic style<select aria-label="Tunic style" value={design.tunicStyle} onChange={event => { const tunicStyle = event.currentTarget.value as PersonDesign["tunicStyle"]; setDesign(d => ({ ...d, tunicStyle })); setMessage("") }}>{TUNIC_STYLES.map(style => <option key={style}>{style}</option>)}</select></label>
            <label className="person-choice">Accent color<input type="color" aria-label="Accent color" value={design.accentColor} onChange={event => { const accentColor = event.currentTarget.value; setDesign(d => ({ ...d, accentColor })); setMessage("") }} /></label>
            {controls(["tunicLength", "hem"])}
            <p className="person-hint">{design.garment === "Robe" ? "Ankle-length robe with full sleeves." : design.bodyType === "Female" ? "Sleeveless ankle-length dress over a long-sleeved shirt." : "Hip-length shirt with loose sleeves and trousers."}</p>
            <label className="person-choice">Clothing color<input type="color" aria-label="Clothing color" value={design.tunicColor} onChange={event => { const tunicColor = event.currentTarget.value; setDesign(d => ({ ...d, tunicColor })); setMessage("") }} /></label>
            {(design.bodyType === "Female" ? [["shirtColor", "Undershirt color"], ["coveringColor", "Head covering color"]] as const : [["trouserColor", "Trouser color"]] as const).map(([key, label]) => <label key={key} className="person-choice">{label}<input type="color" aria-label={label} value={design[key]} onChange={event => { const value = event.currentTarget.value; setDesign(d => ({ ...d, [key]: value })); setMessage("") }} /></label>)}
          </Section>
          <Section {...section("Road accessories")}>
            <label className="person-choice">Hat<select aria-label="Hat" value={design.hat} onChange={event => { const hat = event.currentTarget.value as PersonDesign["hat"]; setDesign(d => ({ ...d, hat })); setMessage("") }}>{HAT_STYLES.map(style => <option key={style}>{style}</option>)}</select></label>
            {([["satchel", "Satchel"], ["walkingStick", "Walking staff"], ["guitar", "Guitar"]] as const).map(([key, label]) => <label key={key} className="person-check"><input aria-label={label} type="checkbox" checked={design[key]} onChange={event => { const value = event.currentTarget.checked; setDesign(d => ({ ...d, [key]: value })); setMessage("") }} />{label}</label>)}
            <p className="person-hint">Road equipment is worn while walking or idle. Other activities free the hands and set bags and instruments aside.</p>
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
            <label className="person-choice">Walk style<select aria-label="Walk style" value={design.walkStyle} onChange={event => { const walkStyle = event.currentTarget.value as PersonDesign["walkStyle"]; setDesign(d => ({ ...d, walkStyle })); setMessage("") }}><option>Natural</option><option>Devotional</option></select></label>
            {controls(["stride"])}
            <Tuner label="Walk timing" labelClassName="w-28" value={fps} min={1} max={24} display={`${fps} fps`} onChange={setFps} />
          </Section>
          <Section {...section("Inspection")}>
            <label className="person-check"><input type="checkbox" checked={onion} onChange={e => setOnion(e.target.checked)} />Previous frame ghost</label>
            <label className="person-check"><input type="checkbox" checked={sides} onChange={e => setSides(e.target.checked)} />Track left / right</label>
            <label className="person-check"><input type="checkbox" checked={guides} onChange={e => setGuides(e.target.checked)} />Attachment guides</label>
            <div className="person-palette">{renderPalette.map((color, index) => <span key={`${index}-${color}`} title={color} style={{ background: color }} />)}</div>
            <p className="person-hint">{pixels} × {pixels} px cell · {renderPalette.length} colours<br />{sheetMatchesDesign ? `${bake.metadata.safePadding} px safe margin` : "Checking margins…"}</p>
          </Section>
          <Section {...section("Files", false)}>
            <div className="person-file-actions">
              <button className={button} onClick={() => openJson()}>Copy / paste JSON</button>
              <button className={button} onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ ...design, templateVersion: BASE_PERSON.version }, null, 2) + "\n"], { type: "application/json" })); download(url, `person-design-v${BASE_PERSON.version}.json`); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>Download parameters</button>
              <label className={`${button} person-file-input`}>Load parameters<input aria-label="Load person parameters" type="file" accept="application/json,.json" onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = ""
                if (!file) return
                try {
                  if (file.size > 262144) throw new Error("Parameter files must be under 256 KB.")
                  const loaded = JSON.parse(await file.text()); setDesign(restoreCharacterDesign(loaded, loaded?.templateVersion ?? 20)); setMessage("Parameters loaded. Preview them, then apply to road.")
                } catch (e) { setMessage(e instanceof Error ? e.message : "Invalid parameter file.") }
              }} /></label>
              <button className={button} disabled={!ready} onClick={() => bake && download(bake.walk, `base-person-v${BASE_PERSON.version}-walk.png`)}>Download walk sheet</button>
              <button className={button} disabled={!ready} onClick={() => bake && download(bake.idle, `base-person-v${BASE_PERSON.version}-idle.png`)}>Download idle sheet</button>
              <button className={button} disabled={!ready} onClick={() => bake && download(bake.shadowWalk, `base-person-v${BASE_PERSON.version}-shadow-walk.png`)}>Download walk shadows</button>
              <button className={button} disabled={!ready} onClick={() => download(url, `base-person-v${BASE_PERSON.version}-${clip}.png`)}>Download selected pose sheet</button>
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
            <label>Clip<select aria-label="Animation clip" value={clip} onChange={e => { setClip(e.target.value as BaseClip); setFrame(0) }}>{Object.entries(PERSON_CLIPS).map(([id, entry]) => <option key={id} value={id}>{entry.label}</option>)}</select></label>
            <label>Zoom<select aria-label="Pixel inspection zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[1, 2, 4, 6, 8].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
          </div>
          <div className="person-view-buttons" aria-label="Preview modes"><button className={button} disabled={!draftsReady} onClick={() => void copyJson()}>Copy edits as JSON</button><button className={button} aria-pressed={showRig} onClick={() => { setShowRig(!showRig); setView("character"); setPlaying(false) }}>Show rig</button>{([['character', 'Character'], ['native', 'Native size'], ['sheet', 'Sprite sheet']] as const).map(([mode, label]) => <button key={mode} className={button} aria-pressed={view === mode} onClick={() => setView(mode)}>{label}</button>)}</div>
        </div>
        <div className="person-stage-layout"><div ref={stageRef} className={`person-stage person-stage-${view}${scrubbingViews ? " is-scrubbing" : ""}`}
          onPointerDown={event => {
            if (view !== "character" || event.button !== 0 || !event.isPrimary ||
              (event.target as Element).closest('[role="button"], button, input, select, a')) return
            event.preventDefault()
            viewDrag.current = { pointer: event.pointerId, x: event.clientX, row }
            event.currentTarget.setPointerCapture(event.pointerId); setScrubbingViews(true)
          }}
          onPointerMove={event => {
            const start = viewDrag.current
            if (!start || start.pointer !== event.pointerId) return
            const steps = Math.trunc((event.clientX - start.x) / 48)
            const count = BASE_PERSON.directions.length
            setRow(((start.row + steps) % count + count) % count)
          }}
          onPointerUp={event => {
            if (viewDrag.current?.pointer !== event.pointerId) return
            viewDrag.current = null; setScrubbingViews(false)
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onLostPointerCapture={event => {
            if (viewDrag.current?.pointer === event.pointerId) { viewDrag.current = null; setScrubbingViews(false) }
          }}>
          {!bake && !preview ? <p className="person-stage-message">Rendering the base person…</p> : view === "sheet" ? <div className="person-sheet">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} width={pixels * columns} height={pixels * 8} alt={`${PERSON_CLIPS[clip].label}: eight directions and ${columns} frames`} />
          </div> : view === "native" ? <div className="person-native" aria-label="Native size lineup">
            {BASE_PERSON.directions.map((d, i) => <div key={d}><Tile url={url} shadowUrl={shadowUrl} row={i} frame={visibleFrame} columns={columns} name={`${d}, native ${BASE_PERSON.nominalHeightPixels}px person`} /><span>{d}</span></div>)}
          </div> : <div className="person-sprite" style={{ width: pixels * fittedZoom, height: pixels * fittedZoom }}>
            {onion && !live && columns > 1 && <div className="absolute inset-0 opacity-25"><Tile url={url} row={row} frame={(visibleFrame + columns - 1) % columns} columns={columns} zoom={fittedZoom} name="Previous frame ghost" /></div>}
            <Tile url={url} shadowUrl={shadowUrl} row={row} frame={visibleFrame} columns={columns} zoom={fittedZoom} name={`Base person ${direction}, frame ${visibleFrame + 1}`} />
            {showRig && <RigOverlay joints={inspected} selected={selectedJoint} row={row} offset={currentOffset} onSelect={joint => { setSelectedJoint(joint); setPlaying(false) }} onChange={changeJoint} onDrag={rigDragging} />}
            {guides && <svg aria-label="Origin and attachment guides" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${pixels} ${pixels}`}>
              <path d={`M${BASE_PERSON.anchor[0]} 0V${pixels} M0 ${BASE_PERSON.anchor[1]}H${pixels}`} stroke="#d9d5a7" strokeWidth="0.15" strokeDasharray="1 1" />
              {SOCKET_NAMES.map(name => {
                const point = sockets?.[name]
                return point ? <circle key={name} cx={point.x} cy={point.y} r="0.55" stroke="#1e2620" strokeWidth="0.15" fill={name.startsWith("left") ? "#329bc2" : name.startsWith("right") ? "#db7540" : "#eed66b"}><title>{name}</title></circle> : null
              })}
            </svg>}
          </div>}
          {(error || storeError) && <p role="alert" className="person-stage-error">{error || storeError} Adjust the pose or undo to recover.</p>}
          <div className="person-stage-caption">{view === "native" ? "Actual pixels · 1×" : view === "sheet" ? `${PERSON_CLIPS[clip].label} atlas · ${columns * 8} poses` : `${direction} · ${fittedZoom}×${fittedZoom < zoom ? " · fitted to view" : ""} · Drag left / right to turn`}</div>
        </div>
        {showRig && <RigInspector joints={inspected} selected={selectedJoint} offset={currentOffset(selectedJoint as EditableJoint)} frame={frame} radius={radius} maxRadius={Math.max(1, Math.floor(PERSON_CLIPS[clip].frames / 2))} keyed={!!selectedKey}
          onSelect={joint => { setSelectedJoint(joint); setPlaying(false) }} onChange={offset => changeJoint(selectedJoint as EditableJoint, offset)} onRadius={blend => changeJoint(selectedJoint as EditableJoint, currentOffset(selectedJoint as EditableJoint), blend)}
          onReset={() => commitPose(setPoseKey(design.poseEdits, clip, selectedJoint as EditableJoint, null, editFrame(selectedJoint as EditableJoint)))}
          onResetClip={() => { const edits = { ...design.poseEdits }; delete edits[clip]; commitPose(edits) }}
          canUndo={history.length > 0} canRedo={future.length > 0}
          onUndo={() => { const previous = history.at(-1); if (previous) { setFuture(f => [...f, design.poseEdits ?? {}]); setHistory(h => h.slice(0, -1)); setDesign(d => ({ ...d, poseEdits: previous })) } }}
          onRedo={() => { const next = future.at(-1); if (next) { setHistory(h => [...h, design.poseEdits ?? {}]); setFuture(f => f.slice(0, -1)); setDesign(d => ({ ...d, poseEdits: next })) } }} />}
        </div>
        <div className="person-animation-dock hud-well">
          <div className="person-direction-strip" aria-label="Character directions">{BASE_PERSON.directions.map((d, i) => <button key={d} aria-label={`Face ${d}`} aria-pressed={row === i} onClick={() => { setRow(i); setView("character") }} className="hud-building-tile person-direction">
            {bake && <Tile url={url} shadowUrl={shadowUrl} row={i} frame={visibleFrame} columns={columns} name={`${d} direction`} />}<span>{d}</span>
          </button>)}</div>
          <div className="person-steps"><span>{PERSON_CLIPS[clip].label}</span><div>{Array.from({ length: PERSON_CLIPS[clip].frames }, (_, f) => <button key={f} className="hud-pause" data-keyed={Object.values(design.poseEdits?.[clip] ?? {}).some(keys => keys?.some(key => key.frame === f))} aria-label={`Inspect step ${f + 1}`} aria-pressed={frame === f} onClick={() => { setFrame(f); setPlaying(false); setView("character") }}>{f + 1}</button>)}</div><span className="person-step-count">{clip === "idle" ? "Idle" : `${frame + 1} / ${PERSON_CLIPS[clip].frames}`}</span></div>
        </div>
      </div>
    </div>
    <dialog ref={jsonDialog} className="person-json-dialog" aria-labelledby="person-json-title">
      <div className="person-panel-heading"><h2 id="person-json-title">Copy / paste character edits</h2><button className="hud-close" aria-label="Close JSON" onClick={() => jsonDialog.current?.close()}><X size={14} /></button></div>
      <div className="person-json-content">
        <p className="person-hint">Includes all saved characters, their proportions, and every pose key. Copy this JSON and paste it directly into the chat. To restore edits, paste JSON here and load it. Loading replaces matching characters and keeps the others.</p>
        <textarea ref={jsonArea} aria-label="Character edits JSON" spellCheck={false} value={jsonText} onChange={event => { setJsonText(event.target.value); setJsonMessage("") }} />
        <p role="status" className="person-hint">{jsonMessage}</p>
        <div className="person-json-actions"><button className={button} onClick={() => void copyJson(jsonText)}>Copy JSON</button><button className={button} onClick={() => { const url = URL.createObjectURL(new Blob([editsJson()], { type: "application/json" })); download(url, "character-edits.json"); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>Download all drafts</button><button className={button} onClick={loadJson}>Load JSON</button><button className={button} onClick={() => jsonDialog.current?.close()}>Close</button></div>
      </div>
    </dialog>
  </AssetEditorFrame>
}
