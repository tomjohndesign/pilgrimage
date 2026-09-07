"use client"

import type { ComponentProps } from "react"
import { JointOverlay, CharacterRigInspector } from "./character-rig-editor"
import { RIG_BONES, RIG_CARRIED_BONES, RIG_LABELS, type RigJoint } from "@/lib/game/base-person/rig-joints"
import { type RigInspection } from "@/lib/game/base-person/rig-inspection"
import { type EditableJoint } from "@/lib/game/base-person/pose-edits"
import type { Point3 } from "@/lib/game/base-person/pose"

/** Direct manipulation of the same joints used by the sprite renderer.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0
 */
export function RigOverlay({ joints, selected, row, offset, onSelect, onChange, onDrag }: {
  joints: RigInspection; selected: RigJoint; row: number; offset: (joint: EditableJoint) => Point3
  onSelect: (joint: RigJoint) => void; onChange: (changes: [EditableJoint, Point3][]) => void; onDrag: (active: boolean) => void
}) {
  return <JointOverlay joints={joints} selected={selected} row={row} bones={RIG_BONES} carried={RIG_CARRIED_BONES} labels={RIG_LABELS}
    offset={joint => offset(joint as EditableJoint)} onSelect={onSelect} onChange={changes => onChange(changes as [EditableJoint, Point3][])} onDrag={onDrag} />
}

export function RigInspector(props: Omit<ComponentProps<typeof CharacterRigInspector<RigJoint>>, "labels" | "axisLocked" | "footer">) {
  return <CharacterRigInspector {...props} labels={RIG_LABELS}
    axisLocked={axis => props.selected === "staffTip" && axis === 1 && (props.joints[props.selected]?.position[1] ?? 0) <= 0.025001}
    footer={<p className="person-hint">Saved in this browser per character. Use Copy edits as JSON above to paste all your poses into the chat. Files also has Copy / paste JSON for restoring edits.</p>} />
}
