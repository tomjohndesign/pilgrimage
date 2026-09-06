"use client"

import { useRef } from "react"
import { RIG_BONES, RIG_LABELS, type RigJoint } from "@/lib/game/base-person/rig-joints"
import { rigDragDelta, type RigInspection } from "@/lib/game/base-person/rig-inspection"
import { MAX_POSE_OFFSET, type EditableJoint } from "@/lib/game/base-person/pose-edits"
import type { Point3 } from "@/lib/game/base-person/pose"

/** Direct manipulation of the same joints used by the sprite renderer.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0
 */
export function RigOverlay({ joints, selected, row, offset, onSelect, onChange, onDrag }: {
  joints: RigInspection; selected: RigJoint; row: number; offset: (joint: EditableJoint) => Point3
  onSelect: (joint: RigJoint) => void; onChange: (joint: EditableJoint, offset: Point3) => void; onDrag: (active: boolean) => void
}) {
  const drag = useRef<{ joint: EditableJoint; x: number; y: number; offset: Point3; scale: number } | null>(null)
  return <svg className="person-rig-overlay" viewBox="0 0 64 64" aria-label="Character rig">
    <g pointerEvents="none">{RIG_BONES.map(([a, b]) => joints[a] && joints[b] && <line key={`${a}-${b}`} x1={joints[a]!.screen[0]} y1={joints[a]!.screen[1]} x2={joints[b]!.screen[0]} y2={joints[b]!.screen[1]} stroke={a.startsWith("left") ? "#73d9fa" : "#ffe293"} strokeWidth=".32" />)}</g>
    {(Object.entries(joints) as [RigJoint, NonNullable<RigInspection[RigJoint]>][]).map(([name, joint]) => <circle key={name} role="button" tabIndex={0} aria-label={RIG_LABELS[name]} aria-pressed={selected === name}
      cx={joint.screen[0]} cy={joint.screen[1]} r={selected === name ? 1 : .7} stroke="#191d19" strokeWidth=".25" fill={selected === name ? "#fff" : joint.editable ? name.startsWith("left") ? "#73d9fa" : "#ffe293" : "#a3ac99"}
      style={{ cursor: joint.editable ? "grab" : "pointer", touchAction: "none" }}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(name) } }}
      onPointerDown={event => {
        onSelect(name)
        if (!joint.editable) return
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { joint: name as EditableJoint, x: event.clientX, y: event.clientY, offset: offset(name as EditableJoint), scale: event.currentTarget.ownerSVGElement!.getBoundingClientRect().width / 64 }
        onDrag(true)
      }}
      onPointerMove={event => {
        const start = drag.current
        if (!start) return
        const delta = rigDragDelta((event.clientX - start.x) / start.scale, (event.clientY - start.y) / start.scale, row)
        onChange(start.joint, start.offset.map((v, i) => Math.max(-MAX_POSE_OFFSET, Math.min(MAX_POSE_OFFSET, v + delta[i]))) as Point3)
      }}
      onLostPointerCapture={() => { if (drag.current) { drag.current = null; onDrag(false) } }}>
      <title>{RIG_LABELS[name]}{joint.reason ? ` · ${joint.reason}` : " · drag to pose"}</title>
    </circle>)}
  </svg>
}

export function RigInspector({ joints, selected, offset, frame, radius, maxRadius, keyed, onSelect, onChange, onRadius, onReset, onResetClip, onUndo, onRedo, canUndo, canRedo }: {
  joints: RigInspection; selected: RigJoint; offset: Point3; frame: number; radius: number; maxRadius: number; keyed: boolean
  onSelect: (joint: RigJoint) => void; onChange: (offset: Point3) => void; onRadius: (radius: number) => void
  onReset: () => void; onResetClip: () => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean
}) {
  const joint = joints[selected]
  return <aside className="person-rig-inspector hud-well" aria-label="Pose inspector">
    <div className="person-panel-heading">Frame {frame + 1} · {keyed ? "Key pose" : "Blended pose"}</div>
    <div className="person-rig-fields">
      <label className="person-choice">Joint<select aria-label="Selected rig joint" value={selected} onChange={e => onSelect(e.target.value as RigJoint)}>{Object.keys(joints).map(name => <option key={name} value={name}>{RIG_LABELS[name as RigJoint]}</option>)}</select></label>
      <p className="person-hint">Drag a gold or blue node. Rotate the view to adjust depth. Grey nodes follow the skeleton.</p>
      <div className="person-rig-axes">{["X", "Y", "Z"].map((axis, i) => <label key={axis}>{axis} offset<input aria-label={`${axis} joint offset`} type="number" step="0.01" min={-MAX_POSE_OFFSET} max={MAX_POSE_OFFSET} disabled={!joint?.editable || (selected === "staffTip" && i === 1 && (joint?.position[1] ?? 0) <= 0.025001)} value={Number(offset[i].toFixed(3))} onChange={event => {
        const value = event.currentTarget.valueAsNumber
        if (!Number.isFinite(value)) return
        const next = [...offset] as Point3; next[i] = Math.max(-MAX_POSE_OFFSET, Math.min(MAX_POSE_OFFSET, value)); onChange(next)
      }} /></label>)}</div>
      <p className="person-hint">Position: {joint?.position.map(v => v.toFixed(3)).join(" / ") ?? "—"}<br />X sideways · Y up · Z forward</p>
      <label className="person-choice">Blend frames<input aria-label="Blend frames" type="number" min={1} max={maxRadius} value={radius} disabled={!joint?.editable} onChange={e => { const value = e.currentTarget.valueAsNumber; if (Number.isInteger(value)) onRadius(Math.max(1, Math.min(maxRadius, value))) }} /></label>
      <p className="person-hint">Keys blend into nearby frames and across the loop seam. Arm and leg lengths stay fixed.{selected === "staffTip" ? " A planted staff shares its ground position across contact frames." : ""}</p>
      {joint?.reason && <p className="person-hint">{joint.reason}</p>}
      <div className="person-presets"><button className="hud-action" disabled={!canUndo} onClick={onUndo}>Undo pose</button><button className="hud-action" disabled={!canRedo} onClick={onRedo}>Redo pose</button><button className="hud-action" disabled={!keyed} onClick={onReset}>Clear key</button><button className="hud-action" onClick={onResetClip}>Reset clip</button></div>
      <p className="person-hint">Saved in this browser per character. Use Copy edits as JSON above to paste all your poses into the chat. Files also has Copy / paste JSON for restoring edits.</p>
    </div>
  </aside>
}
