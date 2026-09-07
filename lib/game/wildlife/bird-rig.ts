import * as THREE from "three"
import { model, loft, type Point, type CrossSection } from "../transport/geometry"
import { mergeJoint } from "./mesh"
import { animalOffset, type AnimalRigEdits, type AnimalClip, type AnimalJoint } from "./rig-edits"
import type { WildlifeGait } from "./gait"
import { wingBeat } from "./motion"

/** Articulated flight feathers follow a shoulder and a separate wrist. */
export function createBirdRig(kind: "hawk" | "sparrow") {
  const m = model(), hawk = kind === "hawk", coat = hawk ? "#735638" : "#897355", dark = "#534534", cream = "#e4d5b2"
  const body = new THREE.Group(), neck = new THREE.Group(), tail = new THREE.Group(), chest = new THREE.Group(), pelvis = new THREE.Group()
  chest.name = "chest"; pelvis.name = "pelvis"; body.name = "body"; neck.name = "neck"; tail.name = "tail"
  m.root.add(body); body.add(chest, pelvis, neck, tail)
  const shape = (sections: CrossSection[], color = coat, parent = body) => m.mesh(loft(sections, 8), color, [0,0,0], parent)
  const wings: THREE.Group[] = [], wrists: THREE.Group[] = [], wingSize = hawk ? 1 : .34
    shape([
      { at: [0, 0.1, -0.4], width: 0.04, top: 0.05 },
      { at: [0, 0.15, -0.18], width: 0.17, top: 0.16 },
      { at: [0, 0.17, 0.14], width: 0.19, top: 0.21 },
      { at: [0, 0.18, 0.3], width: 0.09, top: 0.11 },
    ])
    shape([{ at: [0, 0.08, -0.1], width: 0.15, top: 0.07 }, { at: [0, 0.09, 0.24], width: 0.12, top: 0.1 }], cream)
    neck.position.set(0, 0.31, 0.22)
    shape([{ at: [0, 0, -0.06], width: 0.105, top: 0.12 }, { at: [0, 0.015, 0.1], width: 0.12, top: 0.105 }, { at: [0, -0.02, 0.16], width: 0.07, top: 0.05 }], coat, neck)
    shape([{ at: [0, -0.015, 0.13], width: 0.065, top: 0.05 }, { at: [0, -0.025, 0.28], width: 0.009, top: 0.015 }], hawk ? "#c7a05b" : dark, neck)
    if (hawk) m.bar([0, -0.025, 0.27], [0, -0.085, 0.245], 0.018, "#42382b", neck)
    for (const sign of [-1, 1]) {
      m.box([sign * 0.113, 0.035, 0.08], [0.02, 0.025, 0.03], "#231f19", neck)
      m.bar([sign * 0.08, 0.10, 0.08], [sign * 0.08, -0.03, 0.13], 0.018, "#a38b4d", body)
      m.bar([sign * 0.08, -0.025, 0.13], [sign * 0.08, -0.025, 0.24], 0.013, "#a38b4d", body)
      const wing = new THREE.Group(); wing.position.set(sign * 0.14, 0.23, 0); wing.name = "wing"; body.add(wing); wings.push(wing)
      const wrist=new THREE.Group();wrist.name=sign<0?"left-wing-wrist":"right-wing-wrist"
      wrist.position.set(sign*.36,0,-.04);wing.add(wrist);wrists.push(wrist)
      const panel=(points:[number,number][],parent:THREE.Group) => {
        const outline=new THREE.Shape();points.forEach(([x,z],index)=>{if(index)outline.lineTo(sign*x,-z);else outline.moveTo(sign*x,-z)})
        outline.closePath();const vane=new THREE.ExtrudeGeometry(outline,{depth:.025,bevelEnabled:false});vane.rotateX(-Math.PI/2)
        m.mesh(vane,coat,[0,0,0],parent)
      }
      panel([[0,.14],[.38,.17],[.40,-.31],[.18,-.33],[0,-.22]],wing)
      panel([[-.035,.19],[.22,.12],[.48,-.21],[.44,-.45],[.08,-.35],[-.035,-.27]],wrist)
      // Outer primaries follow the wrist; inner secondaries stay with the arm.
      for(let i=0;i<6;i++)m.bar([sign*.13,0,.07-i*.053],[sign*(.36+i*.048),-.01,-.14-i*.062],.049-i*.003,i>3?dark:coat,wrist)
      for(let i=0;i<3;i++)m.bar([sign*(.08+i*.095),0,-.12],[sign*(.13+i*.1),-.01,-.34],.045,coat,wing)

    }
    tail.position.set(0, 0.13, -0.25)
    for (let i = -2; i <= 2; i++) m.bar([i * 0.025, 0, 0], [i * 0.07, -0.03, -0.49], 0.045, i % 2 ? dark : coat, tail)
    body.scale.setScalar(wingSize)

  for (const joint of [body, chest, pelvis, neck, tail, ...wings, ...wrists]) mergeJoint(joint)
  const parts: THREE.Mesh[] = []
  m.root.traverse(object => { if (object instanceof THREE.Mesh) parts.push(object) })
  const joints: Partial<Record<AnimalJoint, { position: Point; editable: boolean; reason?: string }>> = {}, point = new THREE.Vector3()
  return { root: m.root, parts, joints: () => joints,
    pose(phase: number, moving: boolean, age: number, grazing: number, flying: boolean | number = false, gait: WildlifeGait = "walk", posture: { drive?: number; lying?: number; edits?: AnimalRigEdits; clip?: AnimalClip; glide?: number } = {}) {
      const clip = posture.clip ?? (flying ? "fly" : moving ? gait : grazing > .5 ? "graze" : "idle")
        const flightBlend = Number(flying), glide = THREE.MathUtils.clamp(posture.glide ?? (clip === "glide" ? 1 : 0),0,1)
        body.position.y = (1 - flightBlend) * 0.03 * wingSize
        body.rotation.x = THREE.MathUtils.lerp(-0.12, 0.08, flightBlend)
        wings.forEach((wing, i) => {
          const side = i ? 1 : -1
          const beat = wingBeat(phase)
          wing.rotation.z = side * THREE.MathUtils.lerp(0.15, THREE.MathUtils.lerp(beat.lift, 0.10, glide), flightBlend)
          wing.rotation.y = side * THREE.MathUtils.lerp(1.25, THREE.MathUtils.lerp(beat.sweep, 0.06, glide), flightBlend)
          wing.rotation.x = 0
          const wrist=wrists[i]
          wrist.rotation.z=side*THREE.MathUtils.lerp(.32,beat.wrist*(hawk?1.45:1),flightBlend)*(1-glide)
          wrist.rotation.y=side*THREE.MathUtils.lerp(.72,.10+Math.max(0,beat.lift)*.32,flightBlend)*(1-glide)
          wrist.rotation.x=beat.wrist*.35*flightBlend*(1-glide)
          const edit=animalOffset(posture.edits,clip,i?"rightWingWrist":"leftWingWrist",phase)
          wrist.rotation.z+=side*edit[1];wrist.rotation.y+=edit[2]
        })
        neck.position.set(0, 0.31, 0.22)
        neck.position.add(new THREE.Vector3(...animalOffset(posture.edits, clip, "head", phase)))
        wings.forEach((wing, i) => {
          const edit = animalOffset(posture.edits, clip, i ? "rightWing" : "leftWing", phase)
          wing.rotation.z += edit[1] * (i ? 1 : -1); wing.rotation.y += edit[2]
        })
        neck.rotation.y = flying ? 0 : Math.sin(age * 1.2) * 0.25
        const tailEdit = animalOffset(posture.edits, clip, "tail", phase)
        tail.position.set(tailEdit[0], 0.13 + tailEdit[1], -0.25 + tailEdit[2])
        tail.rotation.x = flying ? Math.sin(phase*Math.PI*2) * 0.08 * (1-glide) : 0.2

      m.root.updateMatrixWorld(true)
      const register = (name: AnimalJoint, group: THREE.Object3D, at: Point, editable = false) => {
        point.set(...at); group.localToWorld(point); m.root.worldToLocal(point); joints[name] = {position:point.toArray() as Point, editable}
      }
      register("head",neck,[0,.04,.20],true); register("tail",tail,[0,0,-.2],true)
      register("chest",body,[0,.17,.1]); register("pelvis",body,[0,.15,-.18])
      wrists.forEach((wrist,i)=>{
        register(i?"rightWingWrist":"leftWingWrist",wrist,[0,0,0],true)
        register(i?"rightWing":"leftWing",wrist,[i?.60:-.60,0,-.44],true)
      })
    },
    dispose() { m.dispose(); parts.forEach(part=>{ if(!Array.isArray(part.material))part.material.dispose() }) },
  }
}
