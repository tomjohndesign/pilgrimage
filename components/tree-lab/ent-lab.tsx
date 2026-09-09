"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Pause, Play, X } from "lucide-react"
import { AssetEditorFrame, type AssetEditorNavigation } from "../asset-editor-frame"
import { CharacterAnimationDock, CharacterRigInspector } from "../character-rig-editor"
import { Section } from "../game/property-controls"
import { EntPreview, type EntInspection } from "./ent-preview"
import { useEntAtlas } from "./use-ent-atlas"
import { DEFAULT_ENT_DESIGN, ENT_FRAMES, ENT_JOINT_LABELS, entStride, validateEntDesign, type EntDesign, type EntJoint } from "@/lib/game/trees/ent-rig"
import { useEntStore } from "@/lib/game/trees/ent-store"
import { FOLIAGE_SPECIES, isFoliageSpecies, type FoliageSpecies } from "@/lib/game/trees/foliage/design"
import { TREE_SPECIES } from "@/lib/game/trees/species"
import { BASE_PERSON, type Point3 } from "@/lib/game/base-person/pose"
import { clearFrameKeys, poseOffset, setPoseKey } from "@/lib/game/base-person/pose-edits"

/** Ents use the existing shared playground, inspector, handles and animation dock.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0 — Shared asset editor
 */
export function EntLab({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const search = useSearchParams(), router = useRouter(), requested = search.get("species")
  const [species, setSpecies] = useState<FoliageSpecies>(requested && isFoliageSpecies(requested) ? requested : "oak")
  const [playing, setPlaying] = useState(true), [showRig, setShowRig] = useState(false), [frame, setFrame] = useState(0), [row, setRow] = useState(1)
  const [selected, setSelected] = useState<EntJoint>("leftHand"), [joints, setJoints] = useState<EntInspection>({})
  const [controlsOpen, setControlsOpen] = useState(false), [message, setMessage] = useState("")
  const [sections, setSections] = useState<Record<string, boolean>>({})
  const [history, setHistory] = useState<EntDesign[]>([]), [future, setFuture] = useState<EntDesign[]>([])
  const [draft, setDraft] = useState<EntDesign | null>(null), drag = useRef<EntDesign | null>(null)
  const directions = useRef<(HTMLCanvasElement | null)[]>([]), input = useRef<HTMLInputElement>(null)
  const stored = useEntStore(s => s.designs[species]) ?? DEFAULT_ENT_DESIGN, save = useEntStore(s => s.save), design = draft ?? stored
  const { baking, error } = useEntAtlas(active)
  useEffect(() => {
    if (active && requested && isFoliageSpecies(requested)) setSpecies(requested)
  }, [active, requested])
  useEffect(() => { setHistory([]); setFuture([]); setDraft(null); setFrame(0); setJoints({}); drag.current = null }, [species])
  useEffect(() => {
    const target = window as unknown as { __bakeEnts?: () => Promise<unknown> }
    target.__bakeEnts = async () => (await import("@/lib/game/trees/ent-bake")).bakeEnts()
    return () => { delete target.__bakeEnts }
  }, [])
  const commit = (next: EntDesign) => {
    if (drag.current) { setDraft(next); return }
    setHistory(h => [...h.slice(-49), design]); setFuture([]); save(species, next)
  }
  const endDrag = () => {
    const before = drag.current; drag.current = null
    setDraft(current => {
      if (current && before) { setHistory(h => [...h.slice(-49), before]); setFuture([]); save(species, current) }
      return null
    })
  }
  const section = (title: string) => ({ title, open: sections[title] ?? true, onToggle: () => setSections(s => ({ ...s, [title]: !(s[title] ?? true) })) })
  const choose = (next: FoliageSpecies) => {
    setSpecies(next)
    const params = new URLSearchParams(search.toString()); params.set("asset", "ents"); params.set("species", next)
    router.replace(`/assets/characters?${params}`, { scroll: false })
  }
  const keyed = (step: number) => Object.values(design.poseEdits.walk ?? {}).some(keys => keys?.some(key => key.frame === step))
  const key = design.poseEdits.walk?.[selected]?.find(k => k.frame === frame), offset = poseOffset(design.poseEdits, "walk", selected, frame / ENT_FRAMES)
  const pose = (changes: [EntJoint, Point3][]) => commit({ ...design, poseEdits: changes.reduce((edits, [joint, value]) => setPoseKey(edits, "walk", joint, { frame, offset: value, radius: key?.radius ?? 4 }, frame), design.poseEdits) })
  const exportSettings = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ species, ...design }, null, 2)], { type: "application/json" }))
    const a = document.createElement("a"); a.href = url; a.download = `ent-${species}-rig.json`; a.click(); URL.revokeObjectURL(url)
  }
  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} version="6 Ents" label="Ent asset playground" controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(v => !v)}
    status={error ? `Sprite update failed: ${error} The game retains its last valid sprites.` : `${TREE_SPECIES[species].label} Ent · ${design.seconds}s per stride${playing ? "" : " · Paused"}${baking ? " · Updating sprites…" : ""}`} detail="Root legs · branch arms · shared pixel scale">
    <div className="person-workspace">
      <aside className={`person-controls hud-well${controlsOpen ? " is-open" : ""}`} aria-label="Ent controls">
        <div className="person-panel-heading"><span>Ents</span><button className="hud-close person-controls-toggle" aria-label="Close controls" onClick={() => setControlsOpen(false)}><X size={14} /></button></div>
        <div className="person-controls-scroll">
          <Section {...section("Tree species")}><div className="person-presets">{FOLIAGE_SPECIES.map(id => <button key={id} className="hud-action" aria-pressed={species === id} onClick={() => choose(id)}>{TREE_SPECIES[id].label}</button>)}</div></Section>
          <Section {...section("Walking")}>
            {([["seconds", "Seconds per stride", 3, 12, .5], ["reach", "Root reach", .6, 1.2, .05], ["lift", "Root lift", .5, 1.5, .05]] as const).map(([field, label, min, max, step]) => <label key={field} className="person-choice">{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={design[field]} onChange={e => { const value = e.currentTarget.valueAsNumber; if (Number.isFinite(value)) commit({ ...design, [field]: Math.max(min, Math.min(max, value)) }) }} /></label>)}
            <p className="person-hint">{entStride(species, design).toFixed(2)} tiles per stride · {(entStride(species, design) / design.seconds).toFixed(3)} tiles/second. Feet plant for 60% of each cycle; arms swing against the roots.</p>
          </Section>
          <Section {...section("In the world")}><p className="person-hint">Enter Lastmarchoftheents in the cheat console. About one in a hundred living trees wakes, takes a slow stroll, and rests for a minute. Ancient trees keep their crowns. Trees being cut stay rooted.</p></Section>
          <Section {...section("Files")}><div className="person-file-actions"><button className="hud-action" onClick={exportSettings}>Export rig settings</button><button className="hud-action" onClick={() => input.current?.click()}>Import rig settings</button></div>
            <input ref={input} type="file" accept="application/json,.json" hidden onChange={async event => {
              const file = event.target.files?.[0]; if (!file) return
              try {
                const json = JSON.parse(await file.text()), imported = validateEntDesign(json)
                if (json.species && json.species !== species) throw new Error(`Select ${json.species} before importing this rig.`)
                commit(imported); setMessage("Imported rig settings.")
              } catch (error) { setMessage((error as Error).message) }
              event.target.value = ""
            }} /><p className="person-hint" role="status">{message || "Saved per species in this browser. The game bakes these same limb poses when the cheat wakes the trees."}</p>
          </Section>
        </div>
      </aside>
      <div className="person-preview" aria-label="Ent preview">
        <div className="person-preview-toolbar hud-well"><div className="person-playback"><button className="hud-pause" aria-label={playing ? "Pause Ent animation" : "Play Ent animation"} onClick={() => setPlaying(v => !v)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button><span>Slow march</span></div><button className="hud-action" aria-pressed={showRig} onClick={() => { setShowRig(v => !v); setPlaying(false) }}>Show rig</button></div>
        <div className="person-stage-layout"><div className="person-stage person-stage-character">
          {active && <EntPreview species={species} design={design} row={row} frame={frame} playing={playing} showRig={showRig} selected={selected} joints={joints} directions={directions}
            onInspect={(next, inspection) => { setFrame(next); setJoints(inspection) }} onJoint={joint => { setSelected(joint); setPlaying(false) }} onPose={pose} onDrag={active => { if (active) { drag.current = design; setPlaying(false) } else endDrag() }} />}
          <span className="person-stage-caption">{TREE_SPECIES[species].label} · branch arms and root feet</span>
        </div>
        {showRig && <CharacterRigInspector joints={joints} selected={selected} labels={ENT_JOINT_LABELS} onSelect={joint => { setSelected(joint); setPlaying(false) }}
          offset={offset} frame={frame} radius={key?.radius ?? 4} maxRadius={10} keyed={!!key} frameKeyed={keyed(frame)} onChange={value => pose([[selected, value]])}
          onRadius={radius => commit({ ...design, poseEdits: setPoseKey(design.poseEdits, "walk", selected, { frame, offset, radius }, frame) })}
          onReset={() => commit({ ...design, poseEdits: setPoseKey(design.poseEdits, "walk", selected, null, frame) })} onResetKey={() => pose([[selected, [0, 0, 0]]])}
          onResetFrame={() => commit({ ...design, poseEdits: clearFrameKeys(design.poseEdits, "walk", frame) })} onResetClip={() => commit({ ...design, poseEdits: {} })}
          canUndo={history.length > 0} canRedo={future.length > 0}
          onUndo={() => { const prev = history.at(-1); if (prev) { setFuture(f => [...f, design]); setHistory(h => h.slice(0, -1)); save(species, prev) } }}
          onRedo={() => { const next = future.at(-1); if (next) { setHistory(h => [...h, design]); setFuture(f => f.slice(0, -1)); save(species, next) } }} />}
        </div>
        <CharacterAnimationDock directions={BASE_PERSON.directions} row={row} onDirection={setRow} renderDirection={i => <canvas ref={canvas => { directions.current[i] = canvas }} width={64} height={64} style={{ imageRendering: "pixelated" }} />}
          frameCount={ENT_FRAMES} frame={frame} clipLabel="Slow march" keyed={keyed} onFrame={next => { setFrame(next); setPlaying(false) }} />
      </div>
    </div>
  </AssetEditorFrame>
}
