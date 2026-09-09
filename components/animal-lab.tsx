"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Pause, Play, RotateCcw, X } from "lucide-react"
import { AssetEditorFrame, type AssetEditorNavigation } from "./asset-editor-frame"
import { Section } from "./game/property-controls"
import { AnimalPreview, animalActions, ACTION_LABELS, type AnimalSubject, type AnimalMotion } from "./animal-preview"
import { WILDLIFE_PROFILES, isBird } from "@/lib/game/wildlife/species"
import { previewRandomSeed } from "@/lib/game/preview-random"
import { WILDLIFE_COATS, wildlifeAppearance } from "@/lib/game/wildlife/appearance"
import { COATS, animalCoat } from "@/lib/game/transport/coats"
import { animalUrl, PARTY_TRANSPORT_VERSION, PACK_ANIMAL_VERSION, type HorseVariant } from "@/lib/game/transport/assets"

export const ANIMAL_SUBJECTS: Record<AnimalSubject, string> = {
  deer: "Deer · doe", buck: "Deer · buck", sheep: "Sheep", goat: "Goat", rabbit: "Rabbit",
  hawk: "Hawk", sparrow: "Sparrow", boar: "Boar", fox: "Fox", donkey: "Donkey / mule", horse: "Horse", ox: "Ox",
}
const HABITATS: Record<AnimalSubject, string> = {
  deer: "Does wander open ground in small groups, away from paths and settlements.",
  buck: "Bucks wander alone through quiet open ground.",
  sheep: "Sheep take slow, four-beat steps between grazing spots and stay with the flock.",
  goat: "Goats spend most of their time grazing, taking short walks with the herd.",
  rabbit: "Rabbits hop between feeding spots and return to their burrows for shelter.",
  hawk: "Hawks circle above the canopy and periodically land in trees.",
  sparrow: "Sparrows fly between trees. Chopping can send a flock out of the crown.",
  boar: "Boars walk, root and rest near the forest.",
  fox: "Foxes trot or lope along the forest margin, then lie down to rest.",
  donkey: "Donkeys accompany merchants and graze beside their parked carts.",
  ox: "Oxen keep an even four-beat walk with broad, split hooves and a steady head.",
  horse: "Horses accompany merchants and graze beside their parked carts.",
}
import { CharacterAnimationDock } from "./character-rig-editor"
import { AnimalRigInspector, type AnimalInspection } from "./animal-rig-editor"
import { useAnimalRigStore } from "@/lib/game/wildlife/rig-store"
import { ANIMAL_FRAMES, EMPTY_ANIMAL_EDITS, animalClearFrame, animalPoseKey, type AnimalJoint, type AnimalRigEdits } from "@/lib/game/wildlife/rig-edits"
import { BASE_PERSON } from "@/lib/game/base-person/pose"
import { ASSET_ZOOMS, useAssetPreviewStore, usePreviewWheel } from "./asset-preview-controls"
const DIRECTIONS = BASE_PERSON.directions

/** Animals use the shared playground frame, controls and direction dock.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0 — Shared asset editor
 */
export function AnimalLab({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const search = useSearchParams(), router = useRouter()
  const requested = search.get("animal") ?? search.get("asset")
  const [subject, setSubject] = useState<AnimalSubject>(requested && Object.hasOwn(ANIMAL_SUBJECTS, requested) ? requested as AnimalSubject : "deer")
  const [motion, setMotion] = useState<AnimalMotion>(["hawk", "sparrow", "horse", "donkey", "ox"].includes(subject) ? "graze" : "idle")
  const [playing, setPlaying] = useState(["hawk", "sparrow", "horse", "donkey", "ox"].includes(subject)), [lineup, setLineup] = useState(false)
  const [row, setRow] = useState(1), [rate, setRate] = useState(1)
  const { zoom, setZoom } = useAssetPreviewStore()
  const stage = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; y: number; row: number; pan: boolean; offset: [number, number] } | null>(null)
  const [offset, setOffset] = useState<[number, number]>([0, 0])
  usePreviewWheel(stage)
  const [construction, setConstruction] = useState(false)
  const [pack, setPack] = useState(false)
  const [coat, setCoat] = useState(""), [horseVariant, setHorseVariant] = useState<HorseVariant>("common")
  const [wildlifeCoat, setWildlifeCoat] = useState<string>("natural")
  const [controlsOpen, setControlsOpen] = useState(false)
  const [sections, setSections] = useState<Record<string, boolean>>({})
  const packed = pack && (subject === "horse" || subject === "donkey" || subject === "ox")
  const equine = subject === "donkey" || subject === "horse" || subject === "ox", bird = !equine && isBird(subject)
  const section = (title: string) => ({ title, open: sections[title] ?? true, onToggle: () => setSections(old => ({ ...old, [title]: !(old[title] ?? true) })) })
  useEffect(() => {
    if (active && requested && Object.hasOwn(ANIMAL_SUBJECTS, requested)) setSubject(requested as AnimalSubject)
  }, [active, requested])
  const choose = (animal: AnimalSubject) => {
    setConstruction(false)
    if (!["hawk", "sparrow", "horse", "donkey", "ox"].includes(animal)) { setMotion("idle"); setPlaying(false) }
    setSubject(animal); setCoat(""); setWildlifeCoat("natural"); setLineup(false); setOffset([0, 0])
    const params = new URLSearchParams(search.toString()); params.set("asset", "animals"); params.set("animal", animal)
    router.replace(`/assets/characters?${params}`, { scroll: false })
  }
  const directionCanvases = useRef<(HTMLCanvasElement | null)[]>([])
  const [showRig, setShowRig] = useState(false), [frame, setFrame] = useState(0)
  const [joints, setJoints] = useState<AnimalInspection>({}), [selectedJoint, setSelectedJoint] = useState<AnimalJoint>("head")
  const [history, setHistory] = useState<AnimalRigEdits[]>([]), [future, setFuture] = useState<AnimalRigEdits[]>([])
  const dragEdit = useRef<AnimalRigEdits | null>(null)
  // A drag poses a local draft; the persisted store (and its localStorage write) only sees the release.
  const [draft, setDraft] = useState<AnimalRigEdits | null>(null)
  const stored = useAnimalRigStore(state => state.designs[subject]) ?? EMPTY_ANIMAL_EDITS
  const edits = draft ?? stored
  const save = useAnimalRigStore(state => state.save)
  useEffect(() => { setHistory([]); setFuture([]); setFrame(0); setSelectedJoint("head"); setDraft(null) }, [subject])
  const commit = (next: AnimalRigEdits) => {
    if (dragEdit.current) { setDraft(next); return }
    setHistory(h => [...h.slice(-49), edits]); setFuture([]); save(subject, next)
  }
  const endDrag = () => {
    const before = dragEdit.current
    if (!before) return
    dragEdit.current = null
    setDraft(current => {
      if (current && JSON.stringify(current) !== JSON.stringify(before)) { setHistory(h => [...h.slice(-49), before]); setFuture([]); save(subject, current) }
      return null
    })
  }
  const actions = animalActions(subject), action = actions.includes(motion) ? motion : actions.includes("graze") ? "graze" : bird ? "fly" : "idle"
  const actionLabel = ACTION_LABELS[action]
  const frameKeyed = (step: number) => Object.values(edits.clips[action]?.keys ?? {}).some(keys => keys?.some(key => key.frame === step))
  return <AssetEditorFrame mode={mode} onModeChange={onModeChange} version={`${Object.keys(ANIMAL_SUBJECTS).length} animals`} label="Animal asset playground"
    onRandomize={() => {
      const seed = previewRandomSeed(); setConstruction(false); setLineup(false)
      if (equine) setCoat(COATS[subject][seed % COATS[subject].length].id)
      else setWildlifeCoat(wildlifeAppearance(seed, 0).id)
    }}
    controlsOpen={controlsOpen} onControlsToggle={() => setControlsOpen(v => !v)}
    status={`${lineup ? "All animals" : ANIMAL_SUBJECTS[subject]} · ${actionLabel}${playing ? "" : " · Paused"}`}
    detail="Game models · shared pixel scale">
    <div className="person-workspace">
      <aside className={`person-controls hud-well${controlsOpen ? " is-open" : ""}`} aria-label="Animal controls">
        <div className="person-panel-heading"><span>Animals</span><button className="hud-close person-controls-toggle" aria-label="Close controls" onClick={() => setControlsOpen(false)}><X size={14} /></button></div>
        <div className="person-controls-scroll">
          <Section {...section("Animal")}>
            <label className="person-choice">Species<select aria-label="Animal species" value={subject} onChange={e => choose(e.target.value as AnimalSubject)}>{Object.entries(ANIMAL_SUBJECTS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <div className="person-presets">{Object.entries(ANIMAL_SUBJECTS).map(([id, label]) => <button key={id} className="hud-action" aria-pressed={subject === id && !lineup} onClick={() => choose(id as AnimalSubject)}>{label}</button>)}</div>
          </Section>
          {equine && <Section {...section("Appearance")}>
            {equine && <label className="person-choice">Equipment<select aria-label="Animal equipment" value={pack ? "pack" : "none"} onChange={e => setPack(e.target.value === "pack")}><option value="none">None</option><option value="pack">Tied bundles</option></select></label>}
            {subject === "horse" && !pack && <label className="person-choice">Build<select aria-label="Horse build" value={horseVariant} onChange={e => setHorseVariant(e.target.value as HorseVariant)}><option value="common">Common</option><option value="noble">Noble</option></select></label>}
            <label className="person-choice">Coat<select aria-label="Animal coat" value={coat || COATS[subject][0].id} onChange={e => setCoat(e.target.value)}>{COATS[subject].map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
          </Section>}
          {!equine && <Section {...section("Appearance")}><label className="person-choice">Coat<select aria-label="Animal coat" value={wildlifeCoat} onChange={e => setWildlifeCoat(e.target.value)}>{WILDLIFE_COATS.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label></Section>}
          {equine && <Section {...section("Files")}><div className="person-file-actions">
            <a className="hud-action" href={animalUrl(subject, animalCoat(subject, packed ? undefined : coat).id, false, packed)} download>Download sprite sheet</a>
            <a className="hud-action" href={`/textures/transport/${packed ? PACK_ANIMAL_VERSION : PARTY_TRANSPORT_VERSION}/manifest.json`} download>Download sheet metadata</a>
          </div></Section>}
          <Section {...section("In the world")}><p className="person-hint">{HABITATS[subject]}</p></Section>
          <Section {...section("Inspection")}>
            {construction && <p className="person-hint">Blue: rib cage · purple: pelvis · green: shoulders · amber: neck · pink: skull.</p>}
            {!bird && !equine && <p className="person-hint">Standing pose for reviewing proportions. Construction shows the pelvis, rib cage, shoulders, neck, skull and limb chains through the shared rig controls.</p>}
            <p className="person-hint">Drag sideways to turn. Shift-drag to pan. Scroll or pinch to zoom. All animals use the same pixel scale as characters.</p>
          </Section>
        </div>
        <footer className="person-panel-footer"><button className="hud-action" onClick={() => { setRow(1); setZoom(6); setOffset([0, 0]); setRate(1); setConstruction(false); setPlaying(bird || equine); setMotion(bird || equine ? "graze" : "idle") }}><RotateCcw size={12} />Reset preview</button></footer>
      </aside>
      <div className="person-preview" aria-label="Animal preview">
        <div className="person-preview-toolbar hud-well">
          <div className="person-playback flex-wrap">
            <button className="hud-pause" aria-label={playing ? "Pause animal animation" : "Play animal animation"} onClick={() => setPlaying(v => !v)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
            <label>Action<select aria-label="Animal action" value={action} onChange={e => { setMotion(e.target.value as AnimalMotion); setFrame(0) }}>{actions.map(clip => <option key={clip} value={clip}>{clip === "idle" && bird ? "Perched" : ACTION_LABELS[clip]}</option>)}</select></label>
            <label>Speed<select aria-label="Animal animation speed" value={rate} onChange={e => setRate(Number(e.target.value))}>{[0.5, 1, 2].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
            <label>Zoom<select aria-label="Animal preview zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{ASSET_ZOOMS.map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
          </div>
          <div className="person-view-buttons"><button className="hud-action" aria-pressed={showRig} onClick={() => { setShowRig(v => !v); setLineup(false); setPlaying(false) }}>Show rig</button>{!bird && !equine && <button className="hud-action" aria-pressed={construction} onClick={() => { setConstruction(v => !v); setShowRig(true); setLineup(false); setPlaying(false); setMotion("idle"); setFrame(0) }}>Construction</button>}<button className="hud-action" aria-pressed={!lineup} onClick={() => setLineup(false)}>Animal</button><button className="hud-action" aria-pressed={lineup} onClick={() => setLineup(true)}>All animals</button></div>
        </div>
        <div className="person-stage-layout"><div ref={stage} className="person-stage person-stage-character"
          onPointerDown={event => { if ((event.target as Element).closest("button, [role=button]") || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, row, pan: event.shiftKey, offset } }}
          onPointerMove={event => { const start = drag.current; if (!start) return; if (start.pan) setOffset([start.offset[0] + event.clientX - start.x, start.offset[1] + event.clientY - start.y]); else setRow(((start.row + Math.trunc((event.clientX - start.x) / 48)) % 8 + 8) % 8) }}
          onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }} onLostPointerCapture={() => { drag.current = null }}>
          <div style={{ transform: `translate(${offset[0]}px, ${offset[1]}px)` }}>
          {active && <AnimalPreview pack={packed} subject={subject} lineup={lineup} motion={action} playing={playing} row={row} zoom={zoom} rate={rate} coat={coat} wildlifeCoat={wildlifeCoat} horseVariant={horseVariant} onSelect={choose} directionCanvases={directionCanvases} showRig={showRig} construction={construction && !bird && !equine} frame={frame} edits={edits} joints={joints} selected={selectedJoint}
            onInspect={(next, inspection) => { setFrame(next); setJoints(inspection) }} onJoint={joint => { setSelectedJoint(joint); setPlaying(false) }}
            onPose={changes => commit(changes.reduce((next, [joint, value]) => animalPoseKey(next, action, joint, { frame, offset: value, radius: 4 }, frame), edits))}
            onDrag={active => { if (active) { dragEdit.current = edits; setPlaying(false) } else endDrag() }} />}
          </div>
          <span className="person-stage-caption">{lineup ? "Deer · sheep · goats · rabbits · birds · boars · foxes · donkey / mule · horse · ox" : `${equine ? ANIMAL_SUBJECTS[subject] : WILDLIFE_PROFILES[subject].label} · ${actionLabel}`}</span>
        </div>
        {showRig && !lineup && <AnimalRigInspector joints={joints} selected={selectedJoint} onSelect={joint => { setSelectedJoint(joint); setPlaying(false) }} edits={edits} clip={action} frame={frame}
          onChange={commit} frameKeyed={frameKeyed(frame)} onResetFrame={() => commit(animalClearFrame(edits, action, frame))} bird={bird} equine={equine}
          canUndo={history.length > 0} canRedo={future.length > 0}
          onUndo={() => { const previous = history.at(-1); if (previous) { setFuture(f => [...f, edits]); setHistory(h => h.slice(0, -1)); save(subject, previous) } }}
          onRedo={() => { const next = future.at(-1); if (next) { setHistory(h => [...h, edits]); setFuture(f => f.slice(0, -1)); save(subject, next) } }} />}
        </div>
        <CharacterAnimationDock directions={DIRECTIONS} row={row} onDirection={next => { setRow(next); setLineup(false) }}
          renderDirection={index => <span role="img" aria-label={`${DIRECTIONS[index]} direction`} className="block shrink-0" style={{ width: 64, height: 64 }}><canvas ref={canvas => { directionCanvases.current[index] = canvas }} width={64} height={64} style={{ imageRendering: "pixelated" }} /></span>}
          frameCount={ANIMAL_FRAMES} frame={frame} clipLabel={actionLabel}
          keyed={step => frameKeyed(step)}
          onFrame={next => { setFrame(next); setPlaying(false); setLineup(false) }} />
      </div>
    </div>
  </AssetEditorFrame>
}
