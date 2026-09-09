"use client"

import { useEffect, useRef, type RefObject } from "react"
import * as THREE from "three"
import { addSurfaceLighting } from "@/lib/game/render/lighting"
import { personCamera } from "@/lib/game/base-person/camera"
import { BASE_PERSON } from "@/lib/game/base-person/pose"
import { createAnimalRig } from "@/lib/game/transport/animal-rig"
import { animalProfile, type Animal, type HorseVariant } from "@/lib/game/transport/assets"
import { WILDLIFE_COATS } from "@/lib/game/wildlife/appearance"
import { createWildlifeRig } from "@/lib/game/wildlife/rig"
import { BURROW_SECONDS, burrowPreview } from "@/lib/game/wildlife/burrow-motion"
import { createBurrowRig } from "@/lib/game/wildlife/burrow"
import { isBird, type WildlifeKind } from "@/lib/game/wildlife/species"
import { gaitRecipe, speciesGaits, type WildlifeGait } from "@/lib/game/wildlife/gait"
import { easeWing } from "@/lib/game/wildlife/motion"
import { ANIMAL_FRAMES, EMPTY_ANIMAL_EDITS, type AnimalClip, type AnimalJoint, type AnimalRigEdits } from "@/lib/game/wildlife/rig-edits"
import { AnimalRigOverlay, type AnimalInspection } from "./animal-rig-editor"
import type { Point3 } from "@/lib/game/base-person/pose"

export type AnimalSubject = WildlifeKind | Animal
export type AnimalMotion = AnimalClip
const SUBJECTS: AnimalSubject[] = ["buck", "deer", "sheep", "goat", "rabbit", "fox", "boar", "sparrow", "hawk", "donkey", "horse"]
export function animalActions(kind: AnimalSubject): AnimalClip[] {
  if (kind === "donkey" || kind === "horse") return ["idle", "walk", "graze"]
  if (isBird(kind)) return ["idle", "fly", "glide"]
  return ["idle", ...speciesGaits(kind), ...(kind === "fox" ? ["lie"] as const : ["graze"] as const), ...(kind === "rabbit" ? ["burrow"] as const : [])]
}
export const ACTION_LABELS: Record<AnimalClip, string> = { idle: "Idle", walk: "Walk", trot: "Trot", canter: "Lope", gallop: "Run", hop: "Hop", leap: "Leap", graze: "Graze", lie: "Lie down / rise", burrow: "Enter / leave burrow", fly: "Fly", glide: "Glide" }

/** Native camera and pixel size are identical to the person editor. */
export function AnimalPreview({ subject, lineup, motion, playing, row, zoom, rate, coat, wildlifeCoat = "natural", horseVariant, onSelect, directionCanvases, showRig, construction, frame: inspectedFrame, edits, joints, selected, onInspect, onJoint, onPose, onDrag }: {
  subject: AnimalSubject; lineup: boolean; motion: AnimalMotion; playing: boolean; row: number; zoom: number; rate: number; coat: string; wildlifeCoat?: string; horseVariant: HorseVariant; onSelect: (subject: AnimalSubject) => void
  directionCanvases: RefObject<(HTMLCanvasElement | null)[]>
  construction: boolean; showRig: boolean; frame: number; edits: AnimalRigEdits; joints: AnimalInspection; selected: AnimalJoint
  onInspect: (frame: number, joints: AnimalInspection) => void; onJoint: (joint: AnimalJoint) => void; onPose: (changes: [AnimalJoint, Point3][]) => void; onDrag: (active: boolean) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const state = useRef({ motion, playing, row, rate, showRig, inspectedFrame, edits, onInspect })
  state.current = { motion, playing, row, rate, showRig, inspectedFrame, edits, onInspect }
  useEffect(() => {
    const container = host.current
    if (!container) return
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1); renderer.setSize(BASE_PERSON.cellSize, BASE_PERSON.cellSize); renderer.localClippingEnabled = true
    renderer.setClearColor(0, 0)
    const scene = new THREE.Scene(), camera = personCamera()
    addSurfaceLighting(scene)
    const hole = createBurrowRig(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const actors = (lineup ? SUBJECTS : [subject]).map(kind => {
      const equine = kind === "donkey" || kind === "horse"
      const rig = equine ? createAnimalRig(kind, horseVariant, coat) : createWildlifeRig(kind, construction)
      const tinted = new Set<THREE.Material>()
      if (!equine && !construction) rig.root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return
        for (const material of [object.material].flat()) {
          if (!tinted.has(material) && material instanceof THREE.MeshLambertMaterial) {
            material.color.multiply(new THREE.Color(WILDLIFE_COATS.find(value => value.id === wildlifeCoat)?.tint ?? "#ffffff"))
            tinted.add(material)
          }
        }
      })
      rig.root.traverse(object => { if (object instanceof THREE.Mesh) (object.material as THREE.Material).clippingPlanes = [ground] })
      const canvas = container.querySelector<HTMLCanvasElement>(`[data-animal="${kind}"]`)!
      return { kind, rig, canvas, context: canvas.getContext("2d")!, equine, phase: 0, age: 0, motion: "" }
    })
    let request = 0, last = 0, inspectedAt = 0, directionsAt = 0
    const point = new THREE.Vector3()
    const draw = (now: number) => {
      const s = state.current, dt = s.playing && last ? Math.min((now - last) / 1000, 0.1) * s.rate : 0
      last = now
      for (const actor of actors) {
        const { rig, kind, equine, context, canvas } = actor
        const choices = animalActions(kind), action = choices.includes(s.motion) ? s.motion : kind === "rabbit" ? "hop" : kind === "fox" ? "trot" : !equine && isBird(kind as WildlifeKind) ? "fly" : "walk"
        const draft = kind === subject ? s.edits : EMPTY_ANIMAL_EDITS
        const bird = !equine && isBird(kind as WildlifeKind), moving = ["walk", "trot", "canter", "gallop", "hop", "leap", "fly", "glide"].includes(action)
        const gait = moving && !bird ? action as WildlifeGait : "walk"
        const cadence = (equine ? animalProfile(kind as Animal, horseVariant).cyclesPerSecond : bird ? action === "glide" ? 0.3 : kind === "hawk" ? 0.85 : 6 : moving ? gaitRecipe(kind as WildlifeKind, gait).cadence : action === "burrow" ? .32/BURROW_SECONDS : action === "lie" ? 0.125 : 0.8) * (draft.clips[action]?.cadence ?? 1)
        if (actor.motion !== action) { actor.phase = 0; actor.motion = action }
        actor.age += dt
        actor.phase = s.playing ? (actor.phase + dt * cadence) % 1 : s.inspectedFrame / ANIMAL_FRAMES
        const phase = actor.phase, restBlend = easeWing(Math.min(phase / 0.2, (1 - phase) / 0.2))
        if (equine) (rig as ReturnType<typeof createAnimalRig>).pose(phase, moving, action === "graze" ? 1 : 0, draft)
        else (rig as ReturnType<typeof createWildlifeRig>).pose(phase, moving, actor.age, action === "graze" ? 1 : 0, bird && moving, gait,
          { lying: action === "lie" ? restBlend : 0, edits: draft, clip: action })
        const shelter=action==="burrow"?burrowPreview(phase):null
        const face=(direction:number)=>{
          const heading=-direction*Math.PI/4
          rig.root.rotation.set(shelter?.pitch??0,heading+(shelter?.heading??0),0,"YXZ")
          rig.root.position.set(Math.sin(heading)*(shelter?.z??0),shelter?.y??(bird&&moving?.3:0),Math.cos(heading)*(shelter?.z??0))
          rig.root.visible=!shelter?.concealed
          hole.root.rotation.y=heading
        }
        face(s.row)
        if(shelter)scene.add(hole.root)
        scene.add(rig.root); renderer.render(scene, camera)
        context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(renderer.domElement, 0, 0)
        // Handles follow every frame while the rig is shown so a drag never trails the pointer.
        if (kind === subject && now - inspectedAt > (s.showRig ? 15 : 50)) {
          const inspection: AnimalInspection = {}
          for (const [name, joint] of Object.entries(s.showRig && rig.root.visible ? rig.joints() : {})) {
            point.set(...joint.position); rig.root.localToWorld(point); point.project(camera)
            inspection[name as AnimalJoint] = { ...joint, screen: [(point.x + 1) * 32, (1 - point.y) * 32], depth: point.z }
          }
          s.onInspect(Math.floor(phase * ANIMAL_FRAMES), inspection); inspectedAt = now
        }
        if (kind === subject && now - directionsAt > 100) {
          for (let direction = 0; direction < BASE_PERSON.directions.length; direction++) {
            const target = directionCanvases.current[direction], context = target?.getContext("2d")
            if (!target || !context) continue
            face(direction)
            renderer.render(scene, camera)
            context.clearRect(0, 0, target.width, target.height); context.drawImage(renderer.domElement, 0, 0)
          }
          face(s.row)
          directionsAt = now
        }
        scene.remove(rig.root, hole.root)
      }
      request = requestAnimationFrame(draw)
    }
    request = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(request); actors.forEach(actor => actor.rig.dispose()); hole.dispose(); renderer.dispose(); renderer.forceContextLoss() }
  }, [subject, lineup, coat, wildlifeCoat, horseVariant, directionCanvases, construction])
  return <div ref={host} className={lineup ? "animal-lineup" : "person-sprite"} style={lineup ? { gridTemplateColumns: `repeat(4, ${64 * zoom}px)` } : undefined}>
    {(lineup ? SUBJECTS : [subject]).map(kind => <div key={kind} style={{ width: 64 * zoom, height: 64 * zoom, position: "relative", flexShrink: 0 }}>
      <canvas data-animal={kind} width={64} height={64} role="img" aria-label={`${kind} model preview`} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />
      {showRig && !lineup && <AnimalRigOverlay joints={joints} selected={selected} row={row - (motion === "burrow" ? burrowPreview(inspectedFrame / ANIMAL_FRAMES).heading / (Math.PI / 4) : 0)} edits={edits} clip={motion} phase={inspectedFrame / ANIMAL_FRAMES} onSelect={onJoint} onChange={onPose} onDrag={onDrag} />}
      {lineup && <button className="hud-action animal-lineup-label" onClick={() => onSelect(kind)}>{kind === "deer" ? "Doe" : kind.charAt(0).toUpperCase() + kind.slice(1)}</button>}
    </div>)}
  </div>
}
