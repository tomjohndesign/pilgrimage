import * as THREE from "three"
import { personCamera } from "./camera"
import { personRecipe, type PersonDesign } from "./design"
import { createBasePersonRig } from "./rig"
import { BASE_PERSON, PERSON_CLIPS, WALK_CLIP_STRIDES, walkFoot, type BaseClip, type Point3 } from "./pose"
import { EDITABLE_JOINTS, type EditableJoint } from "./pose-edits"
import type { RigJoint } from "./rig-joints"

/** `depth` is the projected camera depth (smaller is nearer) so overlapping handles stack correctly. */
export interface InspectedJoint { position: Point3; screen: [number, number]; editable: boolean; reason?: string; depth?: number }
export type RigInspection = Partial<Record<RigJoint, InspectedJoint>>

/** Pass a `shared` rig built for the same design (pose keys aside) to skip rebuilding one per inspection; it is left intact. */
export function inspectRig(design: PersonDesign, clip: BaseClip, frame: number, row: number, shared?: ReturnType<typeof createBasePersonRig>): RigInspection {
  const recipe = personRecipe(design), rig = shared ?? createBasePersonRig(recipe), camera = personCamera()
  const phase = frame / PERSON_CLIPS[clip].frames * (clip === "walk" ? WALK_CLIP_STRIDES : 1)
  try {
    rig.view(row); rig.pose(phase, clip, design.poseEdits)
    const result: RigInspection = {}
    for (const [name, position] of Object.entries(rig.joints()) as [RigJoint, Point3][]) {
      const projected = rig.root.localToWorld(new THREE.Vector3(...position)).project(camera)
      const groundLocked = (name === "leftFoot" || name === "rightFoot") && (clip === "walk" || clip === "wearyWalk" || clip === "carrying" || clip === "procession") && walkFoot(name === "leftFoot" ? "left" : "right", phase, recipe.body).planted
      const editable = EDITABLE_JOINTS.includes(name as EditableJoint) && !groundLocked
      result[name] = { position, screen: [(projected.x + 1) * BASE_PERSON.cellSize / 2, (1 - projected.y) * BASE_PERSON.cellSize / 2], editable, depth: projected.z,
        reason: groundLocked ? "Planted foot: ground contact stays locked. Select a swing frame to adjust it." : !editable ? "This point follows the joints around it; drag those instead." : undefined }
    }
    return result
  } finally { if (!shared) rig.dispose() }
}

export function rigDragDelta(dx: number, dy: number, row: number): Point3 {
  const camera = personCamera(), size = BASE_PERSON.cellSize
  const zero = new THREE.Vector3(0, 0, 0).unproject(camera)
  return new THREE.Vector3(dx * 2 / size, -dy * 2 / size, 0).unproject(camera).sub(zero)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), row * Math.PI / 4).toArray() as Point3
}

/** Handles nearest the viewer draw last, and every editable handle sits above the grey skeleton ones. */
export function orderJoints<J extends string>(joints: Partial<Record<J, InspectedJoint>>): [J, InspectedJoint][] {
  return (Object.entries(joints) as [J, InspectedJoint][]).sort(([, a], [, b]) =>
    Number(a.editable) - Number(b.editable) || (b.depth ?? 0) - (a.depth ?? 0))
}

/** Sprite pixels of head start an editable handle gets over a grey skeleton node under the same pointer. */
const EDITABLE_PREFERENCE = 1
/** Reach for the nearest handle under the pointer; an editable one wins over a grey one that covers it. */
export function pickJoint<J extends string>(joints: Partial<Record<J, InspectedJoint>>, x: number, y: number, radius: number): J | null {
  let best: { joint: J; score: number } | null = null
  for (const [name, joint] of Object.entries(joints) as [J, InspectedJoint][]) {
    const distance = Math.hypot(joint.screen[0] - x, joint.screen[1] - y)
    if (distance > radius) continue
    const score = distance + (joint.editable ? 0 : EDITABLE_PREFERENCE) + (joint.depth ?? 0) * 1e-3
    if (!best || score < best.score) best = { joint: name, score }
  }
  return best?.joint ?? null
}

/** The bone under the pointer, when no handle is: distance from the point to the segment between two shown joints. */
export function pickBone<J extends string>(joints: Partial<Record<J, InspectedJoint>>, bones: readonly [J, J][], x: number, y: number, radius: number): [J, J] | null {
  let best: { bone: [J, J]; distance: number } | null = null
  for (const bone of bones) {
    const a = joints[bone[0]], b = joints[bone[1]]
    if (!a || !b) continue
    const dx = b.screen[0] - a.screen[0], dy = b.screen[1] - a.screen[1], length = dx * dx + dy * dy
    const t = length > 0 ? Math.max(0, Math.min(1, ((x - a.screen[0]) * dx + (y - a.screen[1]) * dy) / length)) : 0
    const distance = Math.hypot(a.screen[0] + t * dx - x, a.screen[1] + t * dy - y)
    if (distance <= radius && (!best || distance < best.distance)) best = { bone, distance }
  }
  return best?.bone ?? null
}
