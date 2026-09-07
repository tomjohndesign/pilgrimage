import * as THREE from "three"
import { BASE_PERSON } from "../base-person/pose"
import { animalCoat } from "./coats"
import { createAnimalRig } from "./animal-rig"
import { TRANSPORT, type Animal, type HorseVariant } from "./assets"
import type { AnimalRigEdits } from "../wildlife/rig-edits"

// Edited equines share one small renderer; no context or target per map animal.
let shared: ReturnType<typeof frameScene> | null = null
let users = 0
function frameScene() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1); renderer.setSize(TRANSPORT.cellSize, TRANSPORT.cellSize); renderer.setClearColor(0, 0)
  const scene = new THREE.Scene(), light = new THREE.DirectionalLight("#ffffff", 1.8)
  scene.add(new THREE.AmbientLight("#ffffff", 1.1)); light.position.set(-3, 7, 5); scene.add(light)
  const pitch = BASE_PERSON.camera.pitch * Math.PI / 180, extent = TRANSPORT.viewSize
  const target = ((TRANSPORT.anchor[1] - TRANSPORT.cellSize / 2) / TRANSPORT.cellSize * extent) / Math.cos(pitch)
  const camera = new THREE.OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, 0.1, 30)
  camera.position.set(0, target + 10 * Math.sin(pitch), 10 * Math.cos(pitch)); camera.lookAt(0, target, 0)
  return { renderer, scene, camera }
}
export function createEditedAnimalFrame(kind: Animal, variant: HorseVariant, coat?: string) {
  const render = shared ??= frameScene(); users++
  const free = createAnimalRig(kind, variant, animalCoat(kind, coat).id), hitched = createAnimalRig(kind, variant, animalCoat(kind, coat).id, true)
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = TRANSPORT.cellSize
  const context = canvas.getContext("2d")!, texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false
  return { texture, draw(phase: number, moving: boolean, grazing: number, row: number, edits: AnimalRigEdits, harness: boolean) {
    const rig = harness ? hitched : free
    rig.pose(phase, moving, grazing, edits); rig.root.rotation.y = -row * Math.PI / 4
    render.scene.add(rig.root); render.renderer.render(render.scene, render.camera); render.scene.remove(rig.root)
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(render.renderer.domElement, 0, 0); texture.needsUpdate = true
  }, dispose() {
    texture.dispose(); free.dispose(); hitched.dispose(); users--
    if (!users && shared === render) { render.renderer.dispose(); render.renderer.forceContextLoss(); shared = null }
  } }
}
