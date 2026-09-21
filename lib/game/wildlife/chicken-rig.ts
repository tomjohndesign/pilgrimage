import * as THREE from "three"
import { model, type Point } from "../transport/geometry"
import { chickenLegPose } from "./chicken-pose"
import { mergeJoint } from "./mesh"
import { animalOffset, type AnimalClip, type AnimalJoint, type AnimalRigEdits } from "./rig-edits"
import type { WildlifeGait } from "./gait"
import type { ChickenKind } from "./species"

/** Ground fowl use the same rig contract, pixel pass and editor as the other animals. */
export function createChickenRig(kind: ChickenKind) {
  const m = model(), rooster = kind === "rooster", cream = kind === "cream-hen"
  const coat = rooster ? "#343e36" : cream ? "#e4d4ac" : "#a45d35"
  const wingColor = rooster ? "#4e5948" : cream ? "#bfa57c" : "#7d422d"
  const hackle = rooster ? "#b38142" : cream ? "#efdfb9" : "#c48648"
  const body = new THREE.Group(), head = new THREE.Group(), tail = new THREE.Group()
  m.root.add(body); body.add(head, tail)
  m.oval([0, .065, -.025], [.17, .175, .25], coat, body)
  m.oval([0, .1, .125], [.13, .16, .135], hackle, body)
  head.position.set(0, .18, .14)
  m.oval([0, .055, .025], [.075, .12, .078], hackle, head)
  m.oval([0, .145, .067], [.075, .078, .082], coat, head)
  m.mesh(new THREE.ConeGeometry(.032, .11, 4).rotateX(Math.PI / 2), "#c49b4c", [0, .13, .172], head)
  for (const side of [-1, 1]) {
    m.box([side * .07, .16, .097], [.015, .019, .022], "#201f18", head)
    m.oval([side * .025, .076, .106], [.016, rooster ? .047 : .024, .023], "#a74231", head)
  }
  for (let i = 0; i < 3; i++) m.oval([0, .22 + (i === 1 ? .018 : 0), .035 + i * .035], [.024, rooster ? .052 : .027, .026], "#ac4432", head)
  const wings = [-1, 1].map(side => {
    const wing = new THREE.Group(); wing.position.set(side * .14, .08, .01); body.add(wing)
    m.oval([side * .02, 0, -.04], [.055, .105, .18], wingColor, wing)
    for (let i = 0; i < 3; i++) m.bar([side * .055, .04 - i * .033, -.035], [side * .055, -.015 - i * .024, -.17], .012, coat, wing)
    return wing
  })
  tail.position.set(0, .095, -.2)
  for (let i = -2; i <= 2; i++) {
    const end: Point = [i * .04, rooster ? .23 - Math.abs(i) * .035 : .115, rooster ? -.28 : -.15]
    m.bar([i * .014, 0, 0], end, .026, rooster ? "#283d37" : wingColor, tail)
    if (rooster) m.bar(end, [i * .045, end[1] - .07, -.38 + Math.abs(i) * .025], .02, "#283d37", tail)
  }
  // Segments rotate without stretching. Toes are attached to the planted ankle.
  const limbs = [0, 1].map(() => {
    const segments = [.095, .11, .14].map((length, i) => m.mesh(new THREE.CylinderGeometry(i ? .014 : .03, i ? .014 : .04, length, 6), i ? "#bc9959" : coat, [0, 0, 0]))
    const foot = new THREE.Group(); m.root.add(foot)
    for (let toe = -1; toe <= 1; toe++) m.bar([0, 0, 0], [toe * .035, -.005, .068 - Math.abs(toe) * .012], .009, "#bc9959", foot)
    m.bar([0, 0, 0], [0, -.005, -.035], .009, "#bc9959", foot)
    return { segments, foot }
  })
  for (const joint of [body, head, tail, ...wings, ...limbs.map(l => l.foot)]) mergeJoint(joint)
  // The shared batch reads vertex colour attributes from every articulated part.
  for (const { segments } of limbs) for (const segment of segments) {
    const colors = new Float32Array(segment.geometry.attributes.position.count * 3)
    for (let i = 0; i < colors.length; i += 3) (segment.material as THREE.MeshLambertMaterial).color.toArray(colors, i)
    segment.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  }
  const parts: THREE.Mesh[] = []
  m.root.traverse(object => { if (object instanceof THREE.Mesh) parts.push(object) })
  const joints: Partial<Record<AnimalJoint, { position: Point; editable: boolean; reason?: string }>> = {}
  const point = new THREE.Vector3(), start = new THREE.Vector3(), end = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0)
  return { root: m.root, parts, joints: () => joints,
    pose(phase: number, moving: boolean, age: number, grazing: number, flying: boolean | number = false, gait: WildlifeGait = "walk", posture: { edits?: AnimalRigEdits; clip?: AnimalClip; drive?: number; lying?: number; glide?: number; burrow?: unknown } = {}) {
      const clip = posture.clip ?? (moving ? "walk" : grazing > .5 ? "graze" : "idle")
      const pose = chickenLegPose(kind, phase, moving, posture.edits, posture.lying ?? 0)
      body.position.y = pose.height
      const peck = !moving && clip === "graze" ? Math.max(0, Math.sin(phase * Math.PI * 2)) ** 4 : 0
      const headEdit = animalOffset(posture.edits, clip, "head", phase)
      head.position.set(headEdit[0], .18 + headEdit[1] - peck * .27, .14 + headEdit[2] + peck * .08)
      head.rotation.set(peck * 1.75 + (moving ? .06 * Math.sin(phase * Math.PI * 4) : 0), moving ? 0 : Math.sin(phase * Math.PI * 2) * .16, 0)
      const tailEdit = animalOffset(posture.edits, clip, "tail", phase)
      tail.rotation.set(tailEdit[1], tailEdit[0], tailEdit[2])
      wings.forEach((wing, i) => {
        const edit = animalOffset(posture.edits, clip, i ? "rightWing" : "leftWing", phase)
        wing.rotation.set(edit[2], edit[0], edit[1])
      })
      pose.legs.forEach((leg, i) => {
        const points = [leg.hip, leg.upperJoint, leg.knee, leg.ankle]
        limbs[i].segments.forEach((segment, n) => {
          start.set(...points[n]); end.set(...points[n + 1])
          segment.position.copy(start).add(end).multiplyScalar(.5)
          segment.quaternion.setFromUnitVectors(axis, end.sub(start).normalize())
        })
        limbs[i].foot.position.set(...leg.ankle)
        const side = i ? "right" : "left"
        points.forEach((position, j) => { joints[`${side}${["Hip", "Thigh", "Knee", "Foot"][j]}` as AnimalJoint] = { position, editable: j === 3 && moving && !leg.planted,
          reason: j === 3 && leg.planted ? "The supporting foot stays planted." : undefined } })
      })
      m.root.updateMatrixWorld(true)
      const register = (name: AnimalJoint, group: THREE.Object3D, at: Point, editable = false) => {
        point.set(...at); group.localToWorld(point); m.root.worldToLocal(point)
        joints[name] = { position: point.toArray() as Point, editable }
      }
      register("pelvis", body, [0, 0, 0]); register("chest", body, [0, .1, .1]); register("neck", head, [0, 0, 0])
      register("head", head, [0, .145, .067], true); register("tail", tail, [0, .12, -.13], true)
      wings.forEach((wing, i) => { register(i ? "rightWingWrist" : "leftWingWrist", wing, [0, 0, 0]); register(i ? "rightWing" : "leftWing", wing, [0, -.05, -.17], true) })
    },
    dispose() { m.dispose(); parts.forEach(part => { if (!Array.isArray(part.material)) part.material.dispose() }) },
  }
}
