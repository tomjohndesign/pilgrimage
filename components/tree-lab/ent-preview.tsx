"use client"
import { useEffect, useRef, type RefObject } from "react"
import * as THREE from "three"
import { createEntRig, ENT_BONES, ENT_JOINT_LABELS, ENT_FRAMES, type EntDesign, type EntJoint } from "@/lib/game/trees/ent-rig"
import { createFoliageModel } from "@/lib/game/trees/foliage/model"
import { DEFAULT_FOLIAGE, FOLIAGE_FRAME, type FoliageSpecies } from "@/lib/game/trees/foliage/design"
import { addSurfaceLighting } from "@/lib/game/render/lighting"
import { personCamera } from "@/lib/game/base-person/camera"
import { BASE_PERSON, type Point3 } from "@/lib/game/base-person/pose"
import { poseOffset } from "@/lib/game/base-person/pose-edits"
import type { InspectedJoint } from "@/lib/game/base-person/rig-inspection"
import { JointOverlay } from "../character-rig-editor"

export type EntInspection = Partial<Record<EntJoint, InspectedJoint>>
export function EntPreview({ species, design, row, frame, playing, showRig, selected, joints, directions, onInspect, onJoint, onPose, onDrag }: {
  species: FoliageSpecies; design: EntDesign; row: number; frame: number; playing: boolean; showRig: boolean
  selected: EntJoint; joints: EntInspection; directions: RefObject<(HTMLCanvasElement | null)[]>
  onInspect: (frame: number, joints: EntInspection) => void; onJoint: (joint: EntJoint) => void
  onPose: (changes: [EntJoint, Point3][]) => void; onDrag: (active: boolean) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null), live = useRef({ design, row, frame, playing, showRig, onInspect })
  live.current = { design, row, frame, playing, showRig, onInspect }
  useEffect(() => {
    const target = canvas.current; if (!target) return
    const size = FOLIAGE_FRAME.cellSize, renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
    renderer.setPixelRatio(1); renderer.setSize(size, size); renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace
    const camera = personCamera({ ...BASE_PERSON, cellSize: size, anchor: [...FOLIAGE_FRAME.anchor], camera: { ...BASE_PERSON.camera, viewSize: FOLIAGE_FRAME.extent } })
    const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root); addSurfaceLighting(scene)
    const crown = createFoliageModel(species, 0, DEFAULT_FOLIAGE[species]); root.add(crown.root)
    let rig = createEntRig(species, live.current.design), recipe = live.current.design
    root.add(rig.root)
    const ctx = target.getContext("2d")!, point = new THREE.Vector3()
    let request = 0, previous = performance.now(), phase = 0, inspectedAt = 0, directionsAt = 0
    const draw = (now: number) => {
      const s = live.current, dt = Math.min(.1, (now - previous) / 1000); previous = now
      if (recipe !== s.design) { root.remove(rig.root); rig.dispose(); recipe = s.design; rig = createEntRig(species, recipe); root.add(rig.root) }
      phase = s.playing ? (phase + dt / s.design.seconds) % 1 : s.frame / ENT_FRAMES
      const step = Math.floor(phase * ENT_FRAMES), pose = rig.pose(step / ENT_FRAMES)
      crown.root.position.y = pose.height
      root.rotation.y = -s.row * Math.PI / 4
      renderer.render(scene, camera); ctx.clearRect(0, 0, size, size); ctx.drawImage(renderer.domElement, 0, 0)
      if (now - inspectedAt > 40) {
        const inspection: EntInspection = {}
        for (const [name, joint] of Object.entries(rig.joints())) {
          point.set(...joint.position); root.localToWorld(point); point.project(camera)
          inspection[name as EntJoint] = { ...joint, screen: [(point.x + 1) * 32, (1 - point.y) * 32], depth: point.z }
        }
        s.onInspect(step, inspection); inspectedAt = now
      }
      if (now - directionsAt > 250) {
        for (let row = 0; row < 8; row++) {
          const tile = directions.current[row], context = tile?.getContext("2d"); if (!tile || !context) continue
          root.rotation.y = -row * Math.PI / 4; renderer.render(scene, camera)
          context.clearRect(0, 0, 64, 64); context.imageSmoothingEnabled = false; context.drawImage(renderer.domElement, 0, 0, 64, 64)
        }
        directionsAt = now
      }
      request = requestAnimationFrame(draw)
    }
    request = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(request); rig.dispose(); crown.dispose(); renderer.dispose(); renderer.forceContextLoss() }
  }, [species, directions])
  return <div className="person-sprite" style={{ position: "relative", width: 576, height: 576, maxWidth: "100%", aspectRatio: "1" }}>
    <canvas ref={canvas} width={192} height={192} role="img" aria-label={`${species} Ent walking preview`} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />
    {showRig && <JointOverlay joints={joints} selected={selected} row={row} bones={ENT_BONES} labels={ENT_JOINT_LABELS} label="Ent rig"
      dragScale={FOLIAGE_FRAME.extent / BASE_PERSON.camera.viewSize} offset={joint => poseOffset(design.poseEdits, "walk", joint, frame / ENT_FRAMES)} onSelect={onJoint} onChange={onPose} onDrag={onDrag} />}
  </div>
}
