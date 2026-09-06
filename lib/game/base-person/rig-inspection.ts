import * as THREE from "three"
import { personCamera } from "./camera"
import { personRecipe, type PersonDesign } from "./design"
import { createBasePersonRig } from "./rig"
import { BASE_PERSON, PERSON_CLIPS, WALK_CLIP_STRIDES, walkFoot, type BaseClip, type Point3 } from "./pose"
import { EDITABLE_JOINTS, type EditableJoint } from "./pose-edits"
import type { RigJoint } from "./rig-joints"

export interface InspectedJoint { position: Point3; screen: [number, number]; editable: boolean; reason?: string }
export type RigInspection = Partial<Record<RigJoint, InspectedJoint>>

export function inspectRig(design: PersonDesign, clip: BaseClip, frame: number, row: number): RigInspection {
  const recipe = personRecipe(design), rig = createBasePersonRig(recipe), camera = personCamera()
  const phase = frame / PERSON_CLIPS[clip].frames * (clip === "walk" ? WALK_CLIP_STRIDES : 1)
  try {
    rig.view(row); rig.pose(phase, clip)
    const result: RigInspection = {}
    for (const [name, position] of Object.entries(rig.joints()) as [RigJoint, Point3][]) {
      const projected = rig.root.localToWorld(new THREE.Vector3(...position)).project(camera)
      const groundLocked = (name === "leftFoot" || name === "rightFoot") && (clip === "walk" || clip === "carrying") && walkFoot(name === "leftFoot" ? "left" : "right", phase, recipe.body).planted
      const editable = EDITABLE_JOINTS.includes(name as EditableJoint) && !groundLocked
      result[name] = { position, screen: [(projected.x + 1) * BASE_PERSON.cellSize / 2, (1 - projected.y) * BASE_PERSON.cellSize / 2], editable,
        reason: groundLocked ? "Planted foot: ground contact stays locked. Select a swing frame to adjust it." : !editable ? "This joint follows the body proportions and the shared skeleton." : undefined }
    }
    return result
  } finally { rig.dispose() }
}

export function rigDragDelta(dx: number, dy: number, row: number): Point3 {
  const camera = personCamera(), size = BASE_PERSON.cellSize
  const zero = new THREE.Vector3(0, 0, 0).unproject(camera)
  return new THREE.Vector3(dx * 2 / size, -dy * 2 / size, 0).unproject(camera).sub(zero)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), row * Math.PI / 4).toArray() as Point3
}
