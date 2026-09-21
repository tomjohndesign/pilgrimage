"use client"

import { SpriteStageGround } from "./sprite-stage-ground"

import { EntitySelect } from "@/components/workspace-navigation"

import { ChromeSelect, ChromeButton, ChromeCheckbox } from "@/components/ui/chrome-controls"
import { CharacterAudioEditor } from "./character-audio-editor"
import { SceneAudioLifecycle } from "./scene-audio-lifecycle"
import { characterSoundsJson, useCharacterSoundStore } from "@/lib/game/character-sound-store"
import { playSourceSelection } from "@/lib/game/scene-audio"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Pause, Play, RotateCcw } from "lucide-react"
import { AssetEditorFrame, AssetEditorWorkspace, AssetEditorSection, type AssetEditorNavigation } from "./asset-editor-frame"
import { AnimalPreview, animalActions, ACTION_LABELS, type AnimalSubject, type AnimalMotion } from "./animal-preview"
import { WILDLIFE_PROFILES, isBird, isChicken } from "@/lib/game/wildlife/species"
import { previewRandomSeed } from "@/lib/game/preview-random"
import { WILDLIFE_COATS, wildlifeAppearance } from "@/lib/game/wildlife/appearance"
import { COATS, animalCoat } from "@/lib/game/transport/coats"
import { animalUrl, PARTY_TRANSPORT_VERSION, PACK_ANIMAL_VERSION, type HorseVariant } from "@/lib/game/transport/assets"

export const ANIMAL_SUBJECTS: Record<AnimalSubject, string> = {
  "russet-hen": "Chicken · russet hen", "cream-hen": "Chicken · cream hen", rooster: "Chicken · dark rooster",
  deer: "Deer · doe", buck: "Deer · buck", sheep: "Sheep", goat: "Goat", rabbit: "Rabbit",
  hawk: "Hawk", sparrow: "Sparrow", boar: "Boar", fox: "Fox", donkey: "Donkey / mule", horse: "Horse", ox: "Ox",
}
const HABITATS: Record<AnimalSubject, string> = {
  "russet-hen": "Russet hens take short steps and peck for grain inside their coop run.",
  "cream-hen": "Cream hens forage alongside the flock in the enclosed run.",
  rooster: "One dark rooster keeps company with five hens in each completed coop.",
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
import { useAssetPreviewStore, usePreviewGestures } from "./asset-preview-controls"
const DIRECTIONS = BASE_PERSON.directions

/** Animals use the shared playground frame, controls and direction dock.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/8X4-0 — Animals
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/AEA-0 — Animals · sound mix
 */
export function AnimalLab({ mode, onModeChange, active = true }: AssetEditorNavigation & { active?: boolean }) {
  const search = useSearchParams()
  const requested = search.get("animal") ?? search.get("asset")
  const [subject, setSubject] = useState<AnimalSubject>(requested && Object.hasOwn(ANIMAL_SUBJECTS, requested) ? requested as AnimalSubject : "deer")
  const [motion, setMotion] = useState<AnimalMotion>(["hawk", "sparrow", "horse", "donkey", "ox"].includes(subject) ? "graze" : "idle")
  const [playing, setPlaying] = useState(["hawk", "sparrow", "horse", "donkey", "ox"].includes(subject)), [lineup, setLineup] = useState(false)
  const [row, setRow] = useState(1), [rate, setRate] = useState(1)
  const { zoom, setZoom } = useAssetPreviewStore()
  const stage = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState<[number, number]>([0, 0])
  usePreviewGestures(stage, { zoom, offset, onZoom: setZoom, onPan: setOffset, onTap: () => { if (!lineup) void playSourceSelection(`animal/${subject}`) } })
  const [construction, setConstruction] = useState(false)
  const [pack, setPack] = useState(false)
  const [coat, setCoat] = useState(""), [horseVariant, setHorseVariant] = useState<HorseVariant>("common")
  const [wildlifeCoat, setWildlifeCoat] = useState<string>("natural")
  const [soundJson,setSoundJson]=useState(''),[soundMessage,setSoundMessage]=useState('')
  const [controlsOpen, setControlsOpen] = useState(search.has('sounds'))
  const packed = pack && (subject === "horse" || subject === "donkey" || subject === "ox")
  const equine = subject === "donkey" || subject === "horse" || subject === "ox", bird = !equine && (isBird(subject) || isChicken(subject))
  useEffect(() => {
    if (active && requested && Object.hasOwn(ANIMAL_SUBJECTS, requested)) setSubject(requested as AnimalSubject)
  }, [active, requested])
  const choose = (animal: AnimalSubject) => {
    setConstruction(false)
    if (!["hawk", "sparrow", "horse", "donkey", "ox"].includes(animal)) { setMotion("idle"); setPlaying(false) }
    setSubject(animal); setCoat(""); setWildlifeCoat("natural"); setLineup(false); setOffset([0, 0])
    const params = new URLSearchParams(search.toString()); params.set("asset", "animals"); params.set("animal", animal)
    window.history.replaceState(null, "", `/assets?${params}`)
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
  const actionLabel = isChicken(subject) && action === "graze" ? "Peck" : ACTION_LABELS[action]
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
    <SceneAudioLifecycle active={active}/>
    <AssetEditorWorkspace title="Animal" controlsOpen={controlsOpen} onControlsClose={() => setControlsOpen(false)}
      controlsHeading={<span>Animals</span>}
      controlsHeader={<><div className="person-panel-heading">
            <label className="person-choice">Species<EntitySelect aria-label="Animal species" value={subject} onChange={e => choose(e.target.value as AnimalSubject)}>{Object.entries(ANIMAL_SUBJECTS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</EntitySelect></label>
          </div></>}
      controls={<>
<AssetEditorSection title="Sounds"><CharacterAudioEditor flat profile={`animal/${subject}`} bodyType="Male" voiceVariant={0} previewZoom={zoom} clip={action} frame={frame} frames={24} playing={playing} active={active} selected={false} onSelect={()=>{}} onDeselect={()=>{}} onPreviewClip={()=>{}} files={<>
            <ChromeButton className="hud-action" onClick={async()=>{const text=characterSoundsJson();setSoundJson(text);try{await navigator.clipboard.writeText(text);setSoundMessage('Sound settings copied.')}catch{setSoundMessage('Select the text below to copy.')}}}>Copy sound JSON</ChromeButton>
            <textarea aria-label="Animal sound JSON" value={soundJson} onChange={e=>setSoundJson(e.target.value)} className="w-full" rows={5}/>
            <ChromeButton className="hud-action" onClick={()=>{try{useCharacterSoundStore.getState().replace(JSON.parse(soundJson));setSoundMessage('Sound settings loaded.')}catch(error){setSoundMessage(error instanceof Error?error.message:'Invalid JSON')}}}>Load sound JSON</ChromeButton>
            <p className="person-hint" role="status">{soundMessage}</p>
          </>}/></AssetEditorSection>
<>
          {equine && <AssetEditorSection title="Appearance">
            {equine && <label className="person-choice">Equipment<ChromeSelect aria-label="Animal equipment" value={pack ? "pack" : "none"} onChange={e => setPack(e.target.value === "pack")}><option value="none">None</option><option value="pack">Tied bundles</option></ChromeSelect></label>}
            {subject === "horse" && !pack && <label className="person-choice">Build<ChromeSelect aria-label="Horse build" value={horseVariant} onChange={e => setHorseVariant(e.target.value as HorseVariant)}><option value="common">Common</option><option value="noble">Noble</option></ChromeSelect></label>}
            <label className="person-choice">Coat<ChromeSelect aria-label="Animal coat" value={coat || COATS[subject][0].id} onChange={e => setCoat(e.target.value)}>{COATS[subject].map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</ChromeSelect></label>
          </AssetEditorSection>}
          {!equine && <AssetEditorSection title="Appearance"><label className="person-choice">Coat<ChromeSelect aria-label="Animal coat" value={wildlifeCoat} onChange={e => setWildlifeCoat(e.target.value)}>{WILDLIFE_COATS.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</ChromeSelect></label></AssetEditorSection>}
          {equine && <AssetEditorSection title="Files"><div className="person-file-actions">
            <a className="hud-action" href={animalUrl(subject, animalCoat(subject, packed ? undefined : coat).id, false, packed)} download>Download sprite sheet</a>
            <a className="hud-action" href={`/textures/transport/${packed ? PACK_ANIMAL_VERSION : PARTY_TRANSPORT_VERSION}/manifest.json`} download>Download sheet metadata</a>
          </div></AssetEditorSection>}

          <AssetEditorSection title="Inspect">
            {construction && <p className="person-hint">Blue: rib cage · purple: pelvis · green: shoulders · amber: neck · pink: skull.</p>}
            {!bird && !equine && <p className="person-hint">Standing pose for reviewing proportions. Construction shows the pelvis, rib cage, shoulders, neck, skull and limb chains through the shared rig controls.</p>}
            <p className="person-hint">Drag to pan. Scroll or pinch to zoom. All animals use the same pixel scale as characters.</p>
          </AssetEditorSection>
          </>
</>}
      controlsFooter={<><footer className="person-panel-footer"><ChromeButton className="hud-action" onClick={() => { setRow(1); setZoom(6); setOffset([0, 0]); setRate(1); setConstruction(false); setPlaying(bird || equine); setMotion(bird || equine ? "graze" : "idle") }}><RotateCcw size={12} />Reset preview</ChromeButton></footer></>}
      toolbar={<><ChromeSelect aria-label="Animal view" value={lineup ? "all" : "animal"} onChange={e => setLineup(e.target.value === "all")}><option value="animal">Animal</option><option value="all">All animals</option></ChromeSelect>
<label className="person-check"><ChromeCheckbox type="checkbox" checked={showRig} onChange={event => { setShowRig(event.target.checked); setLineup(false); setPlaying(false) }} />Show rig</label>{!bird && !equine && <label className="person-check"><ChromeCheckbox type="checkbox" checked={construction} onChange={event => { setConstruction(event.target.checked); setShowRig(true); setLineup(false); setPlaying(false); setMotion("idle"); setFrame(0) }} />Construction</label>}</>}
      dock={<CharacterAnimationDock playback={<div className="person-playback">            <ChromeButton className="hud-pause" aria-label={playing ? "Pause animal animation" : "Play animal animation"} onClick={() => setPlaying(v => !v)}>{playing ? <Pause size={14} /> : <Play size={14} />}</ChromeButton>
            <label>Action<ChromeSelect aria-label="Animal action" value={action} onChange={e => { setMotion(e.target.value as AnimalMotion); setFrame(0) }}>{actions.map(clip => <option key={clip} value={clip}>{isChicken(subject) && clip === "graze" ? "Peck" : clip === "idle" && bird && !isChicken(subject) ? "Perched" : ACTION_LABELS[clip]}</option>)}</ChromeSelect></label>
            <label>Speed<ChromeSelect aria-label="Animal animation speed" value={rate} onChange={e => setRate(Number(e.target.value))}>{[0.5, 1, 2].map(value => <option key={value} value={value}>{value}×</option>)}</ChromeSelect></label>
</div>} directions={DIRECTIONS} row={row} onDirection={next => { setRow(next); setLineup(false) }}
          renderDirection={index => <span role="img" aria-label={`${DIRECTIONS[index]} direction`} className="block shrink-0" style={{ width: 64, height: 64 }}><canvas ref={canvas => { directionCanvases.current[index] = canvas }} width={64} height={64} style={{ imageRendering: "pixelated" }} /></span>}
          frameCount={ANIMAL_FRAMES} frame={frame} clipLabel={actionLabel}
          keyed={step => frameKeyed(step)}
          onFrame={next => { setFrame(next); setPlaying(false); setLineup(false) }} />}>
      <div className="person-stage-layout"><div ref={stage} className="person-stage person-stage-character">
          {active && <SpriteStageGround zoom={zoom} offset={offset} />}
          <div style={{ transform: `translate(${offset[0]}px, ${offset[1]}px)`, position: "relative" }}>
          {active && <AnimalPreview pack={packed} subject={subject} lineup={lineup} motion={action} playing={playing} row={row} zoom={zoom} rate={rate} coat={coat} wildlifeCoat={wildlifeCoat} horseVariant={horseVariant} onSelect={choose} directionCanvases={directionCanvases} showRig={showRig} construction={construction && !bird && !equine} frame={frame} edits={edits} joints={joints} selected={selectedJoint}
            onInspect={(next, inspection) => { setFrame(next); setJoints(inspection) }} onJoint={joint => { setSelectedJoint(joint); setPlaying(false) }}
            onPose={changes => commit(changes.reduce((next, [joint, value]) => animalPoseKey(next, action, joint, { frame, offset: value, radius: 4 }, frame), edits))}
            onDrag={active => { if (active) { dragEdit.current = edits; setPlaying(false) } else endDrag() }} />}
          </div>
          <span className="person-stage-caption">{lineup ? "Chickens · deer · sheep · goats · rabbits · birds · boars · foxes · donkey / mule · horse · ox" : `${equine ? ANIMAL_SUBJECTS[subject] : WILDLIFE_PROFILES[subject].label} · ${actionLabel}`}</span>
        </div>
        {showRig && !lineup && <AnimalRigInspector joints={joints} selected={selectedJoint} onSelect={joint => { setSelectedJoint(joint); setPlaying(false) }} edits={edits} clip={action} frame={frame}
          onChange={commit} frameKeyed={frameKeyed(frame)} onResetFrame={() => commit(animalClearFrame(edits, action, frame))} bird={bird} equine={equine} biped={isChicken(subject)}
          canUndo={history.length > 0} canRedo={future.length > 0}
          onUndo={() => { const previous = history.at(-1); if (previous) { setFuture(f => [...f, edits]); setHistory(h => h.slice(0, -1)); save(subject, previous) } }}
          onRedo={() => { const next = future.at(-1); if (next) { setHistory(h => [...h, edits]); setFuture(f => f.slice(0, -1)); save(subject, next) } }} />}
        </div>
    </AssetEditorWorkspace>
  </AssetEditorFrame>
}
