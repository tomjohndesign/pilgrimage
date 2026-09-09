import { inkAnimalFrame } from "../base-person/ink"
import * as THREE from "three"
import { addSurfaceLighting } from "../render/lighting"
import { spriteDepthBaker } from "../render/bake-depth"
import { configureSpriteDepthTexture } from "../render/sprite-depth"
import { KNIGHT, knightDesign } from "../knight/design"
import { createRidingTack, equipKnight, seatKnight } from "../knight/rig"
import { createBasePersonRig } from "../base-person/rig"
import { personRecipe } from "../base-person/design"
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
  renderer.localClippingEnabled = true
  renderer.setPixelRatio(1); renderer.setSize(TRANSPORT.cellSize, TRANSPORT.cellSize); renderer.setClearColor(0, 0)
  const scene = new THREE.Scene(); addSurfaceLighting(scene)
  const pitch = BASE_PERSON.camera.pitch * Math.PI / 180, extent = TRANSPORT.viewSize
  const target = ((TRANSPORT.anchor[1] - TRANSPORT.cellSize / 2) / TRANSPORT.cellSize * extent) / Math.cos(pitch)
  const camera = new THREE.OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, 0.1, 30)
  camera.position.set(0, target + 10 * Math.sin(pitch), 10 * Math.cos(pitch)); camera.lookAt(0, target, 0)
  return { renderer, scene, camera, depth: spriteDepthBaker(renderer) }
}
export function createEditedAnimalFrame(kind: Animal, variant: HorseVariant, coat?: string, knight?: { kind: "mounted" | "saddled"; variant: number }, pack = false) {
  const render = shared ??= frameScene(); users++
  const free = createAnimalRig(kind, variant, animalCoat(kind, coat).id, false, pack), hitched = createAnimalRig(kind, variant, animalCoat(kind, coat).id, true, pack)
  const tack = knight ? createRidingTack(free.root) : null
  const rider = knight?.kind === "mounted" ? createBasePersonRig(personRecipe(knightDesign(knight.variant))) : null
  const gear = rider ? equipKnight(rider, knight!.variant) : null
  if (rider) free.root.add(rider.root)
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = TRANSPORT.cellSize
  const context = canvas.getContext("2d")!, texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false
  const depthCanvas = document.createElement("canvas"); depthCanvas.width = depthCanvas.height = TRANSPORT.cellSize
  const depthContext = depthCanvas.getContext("2d")!, depthTexture = configureSpriteDepthTexture(new THREE.CanvasTexture(depthCanvas))
  return { texture, depthTexture, draw(phase: number, moving: boolean, grazing: number, row: number, edits: AnimalRigEdits, harness: boolean) {
    const rig = harness && !knight ? hitched : free
    rig.root.rotation.y = 0
    rig.pose(phase, moving, knight ? 0 : grazing, edits)
    if (tack) {
      let hands: [number, number, number][] | undefined
      if (rider) {
        seatKnight(rider, knight!.variant, phase, moving)
        hands = ["leftHand", "rightHand"].map(name => rig.root.worldToLocal(rider.sockets[name as "leftHand" | "rightHand"].getWorldPosition(new THREE.Vector3())).toArray())
      }
      tack.pose(phase, moving, hands)
    }
    rig.root.rotation.y = -row * Math.PI / 4
    const pitch = BASE_PERSON.camera.pitch * Math.PI / 180, anchor = knight ? KNIGHT.anchor : TRANSPORT.anchor
    const target = (anchor[1] - TRANSPORT.cellSize / 2) / TRANSPORT.cellSize * TRANSPORT.viewSize / Math.cos(pitch)
    render.camera.position.set(0, target + 10 * Math.sin(pitch), 10 * Math.cos(pitch)); render.camera.lookAt(0, target, 0)
    render.scene.add(rig.root)
    try {
      render.renderer.render(render.scene, render.camera)
      context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(render.renderer.domElement, 0, 0)
      const colors = context.getImageData(0, 0, canvas.width, canvas.height), pixels = new Uint8ClampedArray(colors.data)
      colors.data.set(inkAnimalFrame(pixels, canvas.width)); context.putImageData(colors, 0, 0)
      depthContext.drawImage(render.depth.render(render.scene, render.camera, TRANSPORT.cellSize, TRANSPORT.viewSize, pixels, colors.data), 0, 0)
      texture.needsUpdate = true; depthTexture.needsUpdate = true
    } finally { render.scene.remove(rig.root) }
  }, dispose() {
    texture.dispose(); depthTexture.dispose(); gear?.dispose(); rider?.dispose(); tack?.dispose(); free.dispose(); hitched.dispose(); users--
    if (!users && shared === render) { render.depth.dispose(); render.renderer.dispose(); render.renderer.forceContextLoss(); shared = null }
  } }
}
