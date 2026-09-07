import * as THREE from "three"
import { BASE_PERSON, PERSON_CLIPS, type BaseClip } from "../base-person/pose"
import { personFrameRenderer } from "../base-person/bake"
import { personRecipe } from "../base-person/design"
import { createBasePersonRig } from "../base-person/rig"
import { createAnimalRig } from "../transport/animal-rig"
import { COATS } from "../transport/coats"
import { TRANSPORT, ANIMAL_RIG_VERSION, animalProfile } from "../transport/assets"
import { spriteDepthBaker, SPRITE_DEPTH_ENCODING } from "../render/bake-depth"
import { KNIGHT, knightDesign, squireDesign } from "./design"
import { createRidingTack, equipKnight, seatKnight } from "./rig"
import { equipSquire, SQUIRE_PALETTE } from "./squire-rig"

function sheet(width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height
  const depth = document.createElement("canvas"); depth.width = width; depth.height = height
  return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true })!, depth, depthCtx: depth.getContext("2d")! }
}

/** A separate immutable outfit family; the shared template and published packs stay intact. */
export async function bakeKnights() {
  const images: Record<string, string> = {}, designs = Array.from({ length: KNIGHT.variants }, (_, i) => knightDesign(i))
  const save = (name: string, target: ReturnType<typeof sheet>) => {
    images[name] = target.canvas.toDataURL()
    images[`depth-${name}`] = target.depth.toDataURL()
  }
  let safePadding: number = KNIGHT.cellSize
  const clips = Object.keys(PERSON_CLIPS) as BaseClip[]
  for (const clip of clips) {
    const frames = PERSON_CLIPS[clip].frames, size = BASE_PERSON.cellSize
    const target = sheet(size * frames, size * 8 * designs.length)
    for (const [variant, design] of designs.entries()) {
      const session = personFrameRenderer(design, ["#42494b", "#626a6d", "#858c8d", "#a4b4b5"])
      let gear: ReturnType<typeof equipKnight> | undefined
      try {
        for (let row = 0; row < 8; row++) for (let f = 0; f < frames; f++) {
          const rendered = session.render(clip, f / frames, row, false, rig => { gear ??= equipKnight(rig, variant) })
          target.ctx.drawImage(rendered.canvas, f * size, (variant * 8 + row) * size)
          target.depthCtx.drawImage(rendered.depth!, f * size, (variant * 8 + row) * size)
        }
      } finally { gear?.dispose(); session.dispose() }
    }
    save(`knight-${clip}`, target)
  }
  for (const clip of ["walk", "idle"] as const) {
    const session = personFrameRenderer(squireDesign(), SQUIRE_PALETTE)
    const frames = PERSON_CLIPS[clip].frames, size = BASE_PERSON.cellSize, target = sheet(size * frames, size * 8)
    let gear: ReturnType<typeof equipSquire> | undefined
    try {
      for (let row = 0; row < 8; row++) for (let f = 0; f < frames; f++) {
        const rendered = session.render(clip, f / frames, row, false, rig => { gear ??= equipSquire(rig); gear.pose() })
        target.ctx.drawImage(rendered.canvas, f * size, row * size)
        target.depthCtx.drawImage(rendered.depth!, f * size, row * size)
      }
      save(`squire-${clip}`, target)
    } finally { gear?.dispose(); session.dispose() }
  }
  const size = KNIGHT.cellSize, extent = TRANSPORT.viewSize
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true })
  const depthBaker = spriteDepthBaker(renderer)
  renderer.localClippingEnabled = true
  renderer.setSize(size, size, false); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0, 0)
  const scene = new THREE.Scene(); scene.add(new THREE.AmbientLight(0xffffff, 1.1))
  const light = new THREE.DirectionalLight(0xffffff, 1.8); light.position.set(-3, 7, 5); scene.add(light)
  const pitch = BASE_PERSON.camera.pitch * Math.PI / 180
  const y = (KNIGHT.anchor[1] - size / 2) / size * extent / Math.cos(pitch)
  const camera = new THREE.OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, 0.1, 30)
  camera.position.set(0, y + 10 * Math.sin(pitch), 10 * Math.cos(pitch)); camera.lookAt(0, y, 0)
  const frame = sheet(size, size)
  try {
    for (const coat of COATS.horse) for (const mounted of [false, true]) {
      const target = sheet(size * (KNIGHT.frames + 1), size * 8 * (mounted ? designs.length : 1))
      for (let variant = 0; variant < (mounted ? designs.length : 1); variant++) {
        const horse = createAnimalRig("horse", "noble", coat.id), tack = createRidingTack(horse.root)
        const rider = createBasePersonRig(personRecipe(designs[variant])), gear = equipKnight(rider, variant)
        if (mounted) horse.root.add(rider.root)
        scene.add(horse.root)
        for (let row = 0; row < 8; row++) for (let f = 0; f <= KNIGHT.frames; f++) {
          const phase = f ? (f - 1) / KNIGHT.frames : 0
          horse.root.rotation.y = 0
          horse.pose(phase, f > 0)
          let hands: [number, number, number][] | undefined
          if (mounted) {
            seatKnight(rider, variant, phase, f > 0)
            hands = ["leftHand", "rightHand"].map(name => horse.root.worldToLocal(rider.sockets[name as "leftHand" | "rightHand"].getWorldPosition(new THREE.Vector3())).toArray())
          }
          tack.pose(phase, f > 0, hands)
          horse.root.rotation.y = -row * Math.PI / 4
          renderer.render(scene, camera)
          frame.ctx.clearRect(0, 0, size, size); frame.ctx.drawImage(renderer.domElement, 0, 0)
          const data = frame.ctx.getImageData(0, 0, size, size)
          for (let i = 0; i < data.data.length; i += 4) {
            if (data.data[i + 3] < 128) { data.data.fill(0, i, i + 4); continue }
            data.data[i + 3] = 255
            for (let c = 0; c < 3; c++) data.data[i + c] = Math.min(255, Math.round(data.data[i + c] / 12) * 12)
            const x = i / 4 % size, y = Math.floor(i / 4 / size)
            safePadding = Math.min(safePadding, x, y, size - 1 - x, size - 1 - y)
          }
          frame.ctx.putImageData(data, 0, 0); target.ctx.drawImage(frame.canvas, f * size, (variant * 8 + row) * size)
          target.depthCtx.drawImage(depthBaker.render(scene, camera, size, extent, data.data, data.data), f * size, (variant * 8 + row) * size)
        }
        scene.remove(horse.root); gear.dispose(); rider.dispose(); tack.dispose(); horse.dispose()
      }
      save(`${mounted ? "mounted" : "saddled"}-${coat.id}`, target)
    }
    if (safePadding < 4) throw new Error(`Knight mount exceeds safe frame: ${safePadding}px`)
    return { images, metadata: { ...KNIGHT, depthEncoding: SPRITE_DEPTH_ENCODING, templateVersion: BASE_PERSON.version, safePadding, designs,
      animalRigVersion: ANIMAL_RIG_VERSION, horseProfile: animalProfile("horse", "noble"),
      camera: { ...BASE_PERSON.camera, viewSize: extent }, scale: TRANSPORT.scale,
      person: { cellSize: BASE_PERSON.cellSize, anchor: BASE_PERSON.anchor, rows: designs.length * 8, frameCounts: Object.fromEntries(clips.map(clip => [clip, PERSON_CLIPS[clip].frames])) },
      squire: { cellSize: BASE_PERSON.cellSize, anchor: BASE_PERSON.anchor, rows: 8,
        frameCounts: { walk: PERSON_CLIPS.walk.frames, idle: PERSON_CLIPS.idle.frames }, design: squireDesign(),
        equipment: "wooden kite shield with painted leather face, rolled wool cloak and leather supply satchel" },
      equipment: "c.1066 mail hauberk and open coif, conical nasal helmet, leather belt and sheathed sword; wooden saddle, short bordered wool saddlecloth, leather tack and iron stirrups",
      reference: "https://www.bayeuxmuseum.com/en/the-bayeux-tapestry/discover-the-bayeux-tapestry/what-is-the-bayeux-tapestry-about/" } }
  } finally { depthBaker.dispose(); renderer.dispose() }
}
