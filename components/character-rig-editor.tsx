"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { orderJoints, pickBone, pickJoint, rigDragDelta, type InspectedJoint } from "@/lib/game/base-person/rig-inspection"
import { MAX_POSE_OFFSET } from "@/lib/game/base-person/pose-edits"
import type { Point3 } from "@/lib/game/base-person/pose"

/** Sprite pixels around a handle that still grab it; at 6× zoom that is a 30 px target. */
const PICK_RADIUS = 2.5
/** A handle this close (its drawn size) wins outright; beyond that a bone under the pointer is preferred. */
const HANDLE_RADIUS = 1.25
/** Sprite pixels either side of a bone line that grab the bone, moving both of its joints together. */
const BONE_RADIUS = 1.2

/** Shared rig controls for every character family.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0
 */
export function JointOverlay<J extends string>({ joints, selected, row, offset, onSelect, onChange, onDrag, bones, carried = [], labels, label = "Character rig", dragScale = 1 }: {
  /** Camera extent relative to the shared person's view, for larger character families. */
  dragScale?: number
  bones: readonly [J, J][]; labels: Record<J, string>; label?: string
  /** Bones whose first joint carries the second: dragging the bone moves the first joint only, and the second follows. */
  carried?: readonly [J, J][]
  joints: Partial<Record<J, InspectedJoint>>; selected: J; row: number; offset: (joint: J) => Point3
  onSelect: (joint: J) => void; onChange: (changes: [J, Point3][]) => void; onDrag: (active: boolean) => void
}) {
  const drag = useRef<{ joints: [J, Point3][]; pointer: number; x: number; y: number; scale: number; pending: [number, number] | null; frame: number } | null>(null)
  const live = useRef({ joints, row, onChange, onDrag, dragScale }); live.current = { joints, row, onChange, onDrag, dragScale }
  const local = (svg: SVGSVGElement, clientX: number, clientY: number): [number, number, number] => {
    const box = svg.getBoundingClientRect(), scale = box.width / 64
    return [(clientX - box.left) / scale, (clientY - box.top) / scale, scale]
  }
  // One pose update per animation frame keeps a fast pointer from queueing rig rebuilds.
  const flush = () => {
    const start = drag.current
    if (!start) return
    start.frame = 0
    if (!start.pending) return
    const [x, y] = start.pending; start.pending = null
    const delta = rigDragDelta((x - start.x) / start.scale, (y - start.y) / start.scale, live.current.row)
    live.current.onChange(start.joints.map(([joint, offset]) => [joint, offset.map((v, i) => Math.max(-MAX_POSE_OFFSET, Math.min(MAX_POSE_OFFSET, v + delta[i] * live.current.dragScale))) as Point3]))
  }
  const finish = () => { if (drag.current) { cancelAnimationFrame(drag.current.frame); drag.current = null; live.current.onDrag(false) } }
  useEffect(() => finish, []) // Unmounting mid-drag still tells the owner the drag ended.
  return <svg className="person-rig-overlay" viewBox="0 0 64 64" aria-label={label} style={{ touchAction: "none" }}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary || drag.current) return
      const [x, y, scale] = local(event.currentTarget, event.clientX, event.clientY)
      // A bone drag carries both of its joints; whichever of them can be posed moves.
      const joint = pickJoint(joints, x, y, HANDLE_RADIUS) ?? (pickBone(joints, bones, x, y, BONE_RADIUS) ? null : pickJoint(joints, x, y, PICK_RADIUS))
      const bone = joint ? null : pickBone(joints, bones, x, y, BONE_RADIUS)
      const grabbed: J[] = joint ? [joint] : bone ?? []
      if (!grabbed.length) return // Empty sprite area still turns or pans the stage.
      event.stopPropagation(); event.preventDefault()
      const carries = !!bone && carried.some(([a, b]) => a === bone[0] && b === bone[1]) && joints[bone[0]]?.editable
      const movable = (carries ? [bone[0]] : grabbed).filter(name => joints[name]?.editable)
      onSelect(movable[0] ?? grabbed[0])
      if (!movable.length) return
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { joints: movable.map(name => [name, offset(name)]), pointer: event.pointerId, x: event.clientX, y: event.clientY, scale, pending: null, frame: 0 }
      onDrag(true)
    }}
    onPointerMove={event => {
      const start = drag.current
      if (!start || start.pointer !== event.pointerId) return
      start.pending = [event.clientX, event.clientY]
      if (!start.frame) start.frame = requestAnimationFrame(flush)
    }}
    onPointerUp={event => { if (drag.current?.pointer === event.pointerId) { cancelAnimationFrame(drag.current.frame); flush(); finish() } }}
    onPointerCancel={finish} onLostPointerCapture={finish}>
    <g pointerEvents="none">{bones.map(([a, b]) => joints[a] && joints[b] && <line key={`${a}-${b}`} x1={joints[a]!.screen[0]} y1={joints[a]!.screen[1]} x2={joints[b]!.screen[0]} y2={joints[b]!.screen[1]} stroke={a.startsWith("left") ? "#73d9fa" : "#ffe293"} strokeWidth=".32" strokeLinecap="round" />)}</g>
    {orderJoints(joints).map(([name, joint]) => <circle key={name} role="button" tabIndex={0} aria-label={labels[name]} aria-pressed={selected === name}
      cx={joint.screen[0]} cy={joint.screen[1]} r={selected === name ? 1 : .7} stroke="#191d19" strokeWidth=".25" fill={selected === name ? "#fff" : joint.editable ? name.startsWith("left") ? "#73d9fa" : "#ffe293" : "#a3ac99"}
      style={{ cursor: joint.editable ? "grab" : "pointer" }}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(name) } }}>
      <title>{labels[name]}{joint.reason ? ` · ${joint.reason}` : " · drag to pose"}</title>
    </circle>)}
  </svg>
}

export function CharacterRigInspector<J extends string>({ joints, selected, offset, frame, radius, maxRadius, keyed, frameKeyed, onSelect, onChange, onRadius, onReset, onResetKey, onResetFrame, onResetClip, onUndo, onRedo, canUndo, canRedo, labels, children, footer, axisLocked }: {
  joints: Partial<Record<J, InspectedJoint>>; selected: J; offset: Point3; frame: number; radius: number; maxRadius: number; keyed: boolean; frameKeyed: boolean
  onSelect: (joint: J) => void; onChange: (offset: Point3) => void; onRadius: (radius: number) => void
  onReset: () => void; onResetKey: () => void; onResetFrame: () => void; onResetClip: () => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean
  labels: Record<J, string>; children?: ReactNode; footer?: ReactNode; axisLocked?: (axis: number) => boolean
}) {
  const joint = joints[selected]
  return <aside className="person-rig-inspector hud-well" aria-label="Pose inspector">
    <div className="person-panel-heading">Frame {frame + 1} · {keyed ? "Key pose" : "Blended pose"}</div>
    <div className="person-rig-fields">
      <label className="person-choice">Joint<select aria-label="Selected rig joint" value={selected} onChange={e => onSelect(e.target.value as J)}>{Object.keys(joints).map(name => <option key={name} value={name}>{labels[name as J]}</option>)}</select></label>
      <p className="person-hint">Drag a gold or blue node, or a bone to move both its joints. Rotate the view to adjust depth. Grey nodes follow the joints around them.</p>
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
      <div className="person-presets"><button className="hud-action" disabled={!canUndo} onClick={onUndo}>Undo pose</button><button className="hud-action" disabled={!canRedo} onClick={onRedo}>Redo pose</button>
        <button className="hud-action" disabled={!joint?.editable || offset.every(v => v === 0)} onClick={onResetKey}>Reset key</button><button className="hud-action" disabled={!keyed} onClick={onReset}>Clear key</button>
        <button className="hud-action" disabled={!frameKeyed} onClick={onResetFrame}>Reset frame</button><button className="hud-action" onClick={onResetClip}>Reset clip</button></div>
      <p className="person-hint">Reset key returns this joint to its original pose here and keeps the key. Clear key removes it so neighbours blend through. Reset frame returns every joint on this frame.</p>
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
