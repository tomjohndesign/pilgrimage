import * as THREE from "three"
import { spriteDepthBaker } from "../render/bake-depth"
import { configureSpriteDepthTexture } from "../render/sprite-depth"
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
  return { renderer, scene, camera, depth: spriteDepthBaker(renderer) }
}
export function createEditedAnimalFrame(kind: Animal, variant: HorseVariant, coat?: string) {
  const render = shared ??= frameScene(); users++
  const free = createAnimalRig(kind, variant, animalCoat(kind, coat).id), hitched = createAnimalRig(kind, variant, animalCoat(kind, coat).id, true)
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = TRANSPORT.cellSize
  const context = canvas.getContext("2d")!, texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false
  const depthCanvas = document.createElement("canvas"); depthCanvas.width = depthCanvas.height = TRANSPORT.cellSize
  const depthContext = depthCanvas.getContext("2d")!, depthTexture = configureSpriteDepthTexture(new THREE.CanvasTexture(depthCanvas))
  return { texture, depthTexture, draw(phase: number, moving: boolean, grazing: number, row: number, edits: AnimalRigEdits, harness: boolean) {
    const rig = harness ? hitched : free
    rig.pose(phase, moving, grazing, edits); rig.root.rotation.y = -row * Math.PI / 4
    render.scene.add(rig.root)
    try {
      render.renderer.render(render.scene, render.camera)
      context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(render.renderer.domElement, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      depthContext.drawImage(render.depth.render(render.scene, render.camera, TRANSPORT.cellSize, TRANSPORT.viewSize, pixels, pixels), 0, 0)
      texture.needsUpdate = true; depthTexture.needsUpdate = true
    } finally { render.scene.remove(rig.root) }
  }, dispose() {
    texture.dispose(); depthTexture.dispose(); free.dispose(); hitched.dispose(); users--
    if (!users && shared === render) { render.depth.dispose(); render.renderer.dispose(); render.renderer.forceContextLoss(); shared = null }
  } }
}
