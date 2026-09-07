"use client"
import { useRef, useState } from "react"
import { JointOverlay, CharacterRigInspector } from "./character-rig-editor"
import { ANIMAL_BONES, ANIMAL_JOINT_LABELS, ANIMAL_FRAMES, animalOffset, animalPoseKey, validateAnimalEdits, type AnimalJoint, type AnimalClip, type AnimalRigEdits } from "@/lib/game/wildlife/rig-edits"
import type { InspectedJoint } from "@/lib/game/base-person/rig-inspection"
import type { Point3 } from "@/lib/game/base-person/pose"

export type AnimalInspection = Partial<Record<AnimalJoint, InspectedJoint>>
export function AnimalRigOverlay({ joints, selected, row, edits, clip, phase, onSelect, onChange, onDrag }: {
  joints: AnimalInspection; selected: AnimalJoint; row: number; edits: AnimalRigEdits; clip: AnimalClip; phase: number
  onSelect: (joint: AnimalJoint) => void; onChange: (joint: AnimalJoint, offset: Point3) => void; onDrag: (active: boolean) => void
}) {
  return <JointOverlay joints={joints} selected={selected} row={row} bones={joints.neck ? ANIMAL_BONES : [...ANIMAL_BONES, ["chest", "head"]]} labels={ANIMAL_JOINT_LABELS} label="Animal rig"
    offset={joint => animalOffset(edits, clip, joint, phase)} onSelect={onSelect} onChange={onChange} onDrag={onDrag} />
}
export function AnimalRigInspector({ joints, selected, onSelect, edits, clip, frame, onChange, onUndo, onRedo, canUndo, canRedo, bird, equine }: {
  joints: AnimalInspection; selected: AnimalJoint; onSelect: (joint: AnimalJoint) => void; edits: AnimalRigEdits; clip: AnimalClip; frame: number
  onChange: (edits: AnimalRigEdits) => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean; bird: boolean; equine: boolean
}) {
  const input = useRef<HTMLInputElement>(null), [message, setMessage] = useState("")
  const current = edits.clips[clip] ?? {}, offset = animalOffset(edits, clip, selected, frame / ANIMAL_FRAMES)
  const key = current.keys?.[selected]?.find(key => key.frame === frame)
  const update = (value: Point3) => onChange(animalPoseKey(edits, clip, selected, { frame, offset: value, radius: key?.radius ?? 4 }, frame))
  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(edits, null, 2)], { type: "application/json" }))
    const a = document.createElement("a"); a.href = url; a.download = "animal-rig.json"; a.click(); URL.revokeObjectURL(url)
  }
  return <CharacterRigInspector joints={joints} selected={selected} labels={ANIMAL_JOINT_LABELS} onSelect={onSelect}
    offset={offset} frame={frame} radius={key?.radius ?? 4} maxRadius={10} keyed={!!key}
    onChange={update} onRadius={radius => onChange(animalPoseKey(edits, clip, selected, { frame, offset, radius }, frame))}
    onReset={() => onChange(animalPoseKey(edits, clip, selected, null, frame))}
    onResetClip={() => { const clips = { ...edits.clips }; delete clips[clip]; onChange({ ...edits, clips }) }}
    canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo}
    footer={<>
      <div className="person-file-actions"><button className="hud-action" onClick={exportFile}>Export rig settings</button><button className="hud-action" onClick={() => input.current?.click()}>Import rig settings</button><button className="hud-action" onClick={() => { void navigator.clipboard.writeText(JSON.stringify(edits, null, 2)).then(() => setMessage("Copied rig settings."), () => setMessage("Use Export rig settings to save this draft.")) }}>Copy edits as JSON</button></div>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { onChange(validateAnimalEdits(JSON.parse(await file.text()))); setMessage("Imported rig settings.") } catch (error) { setMessage((error as Error).message) } e.target.value = "" }} />
      <p className="person-hint" role="status">{message || "Saved in this browser per animal and action. Pose keys blend across the loop seam."}</p>
    </>}>
      <label className="person-choice">Cycle speed<input aria-label="Animal gait timing" type="number" step={0.05} min={0.25} max={2} value={current.cadence ?? 1} onChange={e => { const value = e.currentTarget.valueAsNumber; if (Number.isFinite(value)) onChange({ ...edits, clips: { ...edits.clips, [clip]: { ...current, cadence: Math.max(0.25, Math.min(2, value)) } } }) }} /></label>
      {!bird && !equine && ["walk", "trot", "canter", "gallop", "hop", "leap"].includes(clip) && <>
        <p className="person-hint">Touchdown offset (% of stride). Ground contacts stay locked. Left and right are the animal’s own sides.</p>
        {["Front left", "Front right", "Hind left", "Hind right"].map((label, limb) => <label className="person-choice" key={label}>{label}<input type="number" aria-label={`${label} touchdown timing`} step={1} min={-8} max={8} value={Math.round((current.contacts?.[limb] ?? 0) * 100)} onChange={e => {
          const value = e.currentTarget.valueAsNumber; if (!Number.isFinite(value)) return
          const contacts: [number, number, number, number] = [...current.contacts ?? [0, 0, 0, 0]]; contacts[limb] = Math.max(-0.08, Math.min(0.08, value / 100))
          onChange({ ...edits, clips: { ...edits.clips, [clip]: { ...current, contacts } } })
        }} /></label>)}
      </>}
  </CharacterRigInspector>
}
