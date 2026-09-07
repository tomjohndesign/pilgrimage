"use client"

import { useRef, type ReactNode } from "react"
import { rigDragDelta } from "@/lib/game/base-person/rig-inspection"
import { MAX_POSE_OFFSET } from "@/lib/game/base-person/pose-edits"
import type { Point3 } from "@/lib/game/base-person/pose"

/** Shared rig controls for every character family.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0
 */
export function JointOverlay<J extends string>({ joints, selected, row, offset, onSelect, onChange, onDrag, bones, labels, label = "Character rig" }: {
  bones: readonly [J, J][]; labels: Record<J, string>; label?: string
  joints: Partial<Record<J, import("@/lib/game/base-person/rig-inspection").InspectedJoint>>; selected: J; row: number; offset: (joint: J) => Point3
  onSelect: (joint: J) => void; onChange: (joint: J, offset: Point3) => void; onDrag: (active: boolean) => void
}) {
  const drag = useRef<{ joint: J; x: number; y: number; offset: Point3; scale: number } | null>(null)
  return <svg className="person-rig-overlay" viewBox="0 0 64 64" aria-label={label}>
    <g pointerEvents="none">{bones.map(([a, b]) => joints[a] && joints[b] && <line key={`${a}-${b}`} x1={joints[a]!.screen[0]} y1={joints[a]!.screen[1]} x2={joints[b]!.screen[0]} y2={joints[b]!.screen[1]} stroke={a.startsWith("left") ? "#73d9fa" : "#ffe293"} strokeWidth=".32" />)}</g>
    {(Object.entries(joints) as [J, import("@/lib/game/base-person/rig-inspection").InspectedJoint][]).map(([name, joint]) => <circle key={name} role="button" tabIndex={0} aria-label={labels[name]} aria-pressed={selected === name}
      cx={joint.screen[0]} cy={joint.screen[1]} r={selected === name ? 1 : .7} stroke="#191d19" strokeWidth=".25" fill={selected === name ? "#fff" : joint.editable ? name.startsWith("left") ? "#73d9fa" : "#ffe293" : "#a3ac99"}
      style={{ cursor: joint.editable ? "grab" : "pointer", touchAction: "none" }}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(name) } }}
      onPointerDown={event => {
        onSelect(name)
        if (!joint.editable) return
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { joint: name as J, x: event.clientX, y: event.clientY, offset: offset(name as J), scale: event.currentTarget.ownerSVGElement!.getBoundingClientRect().width / 64 }
        onDrag(true)
      }}
      onPointerMove={event => {
        const start = drag.current
        if (!start) return
        const delta = rigDragDelta((event.clientX - start.x) / start.scale, (event.clientY - start.y) / start.scale, row)
        onChange(start.joint, start.offset.map((v, i) => Math.max(-MAX_POSE_OFFSET, Math.min(MAX_POSE_OFFSET, v + delta[i]))) as Point3)
      }}
      onLostPointerCapture={() => { if (drag.current) { drag.current = null; onDrag(false) } }}>
      <title>{labels[name]}{joint.reason ? ` · ${joint.reason}` : " · drag to pose"}</title>
    </circle>)}
  </svg>
}

export function CharacterRigInspector<J extends string>({ joints, selected, offset, frame, radius, maxRadius, keyed, onSelect, onChange, onRadius, onReset, onResetClip, onUndo, onRedo, canUndo, canRedo, labels, children, footer, axisLocked }: {
  joints: Partial<Record<J, import("@/lib/game/base-person/rig-inspection").InspectedJoint>>; selected: J; offset: Point3; frame: number; radius: number; maxRadius: number; keyed: boolean
  onSelect: (joint: J) => void; onChange: (offset: Point3) => void; onRadius: (radius: number) => void
  onReset: () => void; onResetClip: () => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean
  labels: Record<J, string>; children?: ReactNode; footer?: ReactNode; axisLocked?: (axis: number) => boolean
}) {
  const joint = joints[selected]
  return <aside className="person-rig-inspector hud-well" aria-label="Pose inspector">
    <div className="person-panel-heading">Frame {frame + 1} · {keyed ? "Key pose" : "Blended pose"}</div>
    <div className="person-rig-fields">
      <label className="person-choice">Joint<select aria-label="Selected rig joint" value={selected} onChange={e => onSelect(e.target.value as J)}>{Object.keys(joints).map(name => <option key={name} value={name}>{labels[name as J]}</option>)}</select></label>
      <p className="person-hint">Drag a gold or blue node. Rotate the view to adjust depth. Grey nodes follow the skeleton.</p>
      <div className="person-rig-axes">{["X", "Y", "Z"].map((axis, i) => <label key={axis}>{axis} offset<input aria-label={`${axis} joint offset`} type="number" step="0.01" min={-MAX_POSE_OFFSET} max={MAX_POSE_OFFSET} disabled={!joint?.editable || (axisLocked?.(i) ?? false)} value={Number(offset[i].toFixed(3))} onChange={event => {
        const value = event.currentTarget.valueAsNumber
        if (!Number.isFinite(value)) return
        const next = [...offset] as Point3; next[i] = Math.max(-MAX_POSE_OFFSET, Math.min(MAX_POSE_OFFSET, value)); onChange(next)
      }} /></label>)}</div>
      <p className="person-hint">Position: {joint?.position.map(v => v.toFixed(3)).join(" / ") ?? "—"}<br />X sideways · Y up · Z forward</p>
      <label className="person-choice">Blend frames<input aria-label="Blend frames" type="number" min={1} max={maxRadius} value={radius} disabled={!joint?.editable} onChange={e => { const value = e.currentTarget.valueAsNumber; if (Number.isInteger(value)) onRadius(Math.max(1, Math.min(maxRadius, value))) }} /></label>
      <p className="person-hint">Keys blend into nearby frames and across the loop seam. Arm and leg lengths stay fixed.{selected === "staffTip" ? " A planted staff shares its ground position across contact frames." : ""}</p>
      {joint?.reason && <p className="person-hint">{joint.reason}</p>}
      {children}
      <div className="person-presets"><button className="hud-action" disabled={!canUndo} onClick={onUndo}>Undo pose</button><button className="hud-action" disabled={!canRedo} onClick={onRedo}>Redo pose</button><button className="hud-action" disabled={!keyed} onClick={onReset}>Clear key</button><button className="hud-action" onClick={onResetClip}>Reset clip</button></div>
      {footer}
    </div>
  </aside>
}

/** One direction strip and keyed frame timeline for people, animals and future rigs. */
export function CharacterAnimationDock({ directions, row, onDirection, renderDirection, frameCount, frame, clipLabel, onFrame, keyed, showFrames = true, maxFrames = frameCount }: {
  directions: readonly string[]; row: number; onDirection: (row: number) => void; renderDirection: (row: number) => ReactNode
  frameCount: number; frame: number; clipLabel: string; onFrame: (frame: number) => void; keyed: (frame: number) => boolean; showFrames?: boolean; maxFrames?: number
}) {
  const count = Math.min(frameCount, maxFrames)
  return <div className="person-animation-dock hud-well" aria-label="Character animation timeline">
    <div className="person-direction-strip" aria-label="Character directions">{directions.map((direction, index) => <button key={direction} aria-label={`Face ${direction}`} aria-pressed={row === index} onClick={() => onDirection(index)} className="hud-building-tile person-direction">
      {renderDirection(index)}<span>{direction}</span>
    </button>)}</div>
    {showFrames && <div className="person-steps"><span>{clipLabel}</span><div>{Array.from({ length: count }, (_, index) => Math.floor(index * frameCount / count)).map(step => <button key={step} className="hud-pause" data-keyed={keyed(step)} aria-label={`Inspect step ${step + 1}`} aria-pressed={frame === step} onClick={() => onFrame(step)}>{step + 1}</button>)}</div><span className="person-step-count">{frameCount === 1 ? "Still" : `${frame + 1} / ${frameCount}`}</span></div>}
  </div>
}
