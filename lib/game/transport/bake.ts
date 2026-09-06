import * as THREE from "three"
import { BASE_PERSON, PERSON_CLIPS } from "../base-person/pose"
import { personFrameRenderer, renderPersonPreview } from "../base-person/bake"
import { KEEPER_CLIPS, KEEPER_COLUMNS } from "./keeper"
import { merchantGesture } from "./merchant-poses"
import { COATS } from "./coats"
import { populationDesign } from "../base-person/population"
import { TRAVELER_TYPES } from "../travelers"
import { CARGO, CART, SHOP, SHOP_SECONDS, CART_MODES, TRANSPORT, ANIMAL_COLUMNS, CART_COLUMNS, ANIMAL_PROFILES, HORSE_VARIANTS, pullingDesign } from "./assets"
import { createAnimalRig, createCartRig } from "./rig"

function canvas(width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height
  return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true })! }
}
async function decode(url: string) { const image = new Image(); image.src = url; await image.decode(); return image }

/** Deterministic native-pixel exports, at the person's camera and pixel density. */
export async function bakeTransport() {
  let size: number = TRANSPORT.cellSize
  const extent = TRANSPORT.viewSize, anchor = TRANSPORT.anchor
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true })
  renderer.setSize(size, size, false); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0, 0)
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 1.1))
  const light = new THREE.DirectionalLight(0xffffff, 1.8); light.position.set(-3, 7, 5); scene.add(light)
  const pitch = BASE_PERSON.camera.pitch * Math.PI / 180
  const targetY = ((anchor[1] - size / 2) / size * extent) / Math.cos(pitch)
  const camera = new THREE.OrthographicCamera(-extent / 2, extent / 2, extent / 2, -extent / 2, 0.1, 30)
  camera.position.set(0, targetY + 10 * Math.sin(pitch), 10 * Math.cos(pitch)); camera.lookAt(0, targetY, 0)
  let frame = canvas(size, size)
  function configure(cell: number, at: readonly number[]) {
    size = cell
    const view = extent * cell / TRANSPORT.cellSize
    renderer.setSize(cell, cell, false)
    camera.left = camera.bottom = -view / 2; camera.right = camera.top = view / 2
    const target = ((at[1] - cell / 2) / cell * view) / Math.cos(pitch)
    camera.position.set(0, target + 10 * Math.sin(pitch), 10 * Math.cos(pitch)); camera.lookAt(0, target, 0); camera.updateProjectionMatrix()
    frame = canvas(cell, cell)
  }
  let safePadding: number = size
  function render(root: THREE.Group, row: number, target: ReturnType<typeof canvas>, col: number, targetRow = row, directions = 8) {
    root.rotation.y = -row * Math.PI * 2 / directions
    renderer.render(scene, camera)
    frame.ctx.clearRect(0, 0, size, size); frame.ctx.drawImage(renderer.domElement, 0, 0)
    const data = frame.ctx.getImageData(0, 0, size, size)
    for (let i = 0; i < data.data.length; i += 4) {
      if (data.data[i + 3] < 128) { data.data.fill(0, i, i + 4); continue }
      data.data[i + 3] = 255
      // Small color clusters, binary silhouettes, no filtered pixel edges.
      for (let c = 0; c < 3; c++) data.data[i + c] = Math.min(255, Math.round(data.data[i + c] / 12) * 12)
      const x = i / 4 % size, y = Math.floor(i / 4 / size)
      safePadding = Math.min(safePadding, x, y, size - 1 - x, size - 1 - y)
    }
    frame.ctx.putImageData(data, 0, 0); target.ctx.drawImage(frame.canvas, col * size, targetRow * size)
  }
  const images: Record<string, string> = {}
  try {
    for (const cargo of CARGO) for (const mode of CART_MODES) for (const side of mode === "shop" ? [1, -1] : [1]) for (const compact of mode === "shop" ? [false, true] : [false]) {
      configure(mode === "shop" ? SHOP.cellSize : CART.cellSize, mode === "shop" ? SHOP.anchor : CART.anchor)
      const frames = mode === "shop" ? TRANSPORT.shopFrames : CART_COLUMNS
      const sheet = canvas(size * frames, size * CART.directions)
      const rig = createCartRig(cargo, mode, compact); rig.root.scale.x = side; scene.add(rig.root)
      for (let row = 0; row < CART.directions; row++) for (let f = 0; f < frames; f++) {
        rig.pose(mode === "shop" ? 0 : f / frames, mode === "shop" ? f / (frames - 1) : 1)
        render(rig.root, row, sheet, f, row, CART.directions)
      }
      scene.remove(rig.root); rig.dispose()
      images[`cart-${cargo}-${mode}${compact ? "-small" : ""}${side < 0 ? "-mirrored" : ""}`] = sheet.canvas.toDataURL()
    }
    configure(TRANSPORT.cellSize, TRANSPORT.anchor)
    for (const kind of ["donkey", "horse"] as const) for (const coat of COATS[kind]) for (const hitched of [false, true]) {
      const variants = kind === "horse" ? HORSE_VARIANTS : ["common"] as const
      const sheet = canvas(size * ANIMAL_COLUMNS, size * 8 * variants.length)
      for (const [index, variant] of variants.entries()) {
        const rig = createAnimalRig(kind, variant, coat.id, hitched); scene.add(rig.root)
        for (let row = 0; row < 8; row++) for (let f = 0; f < ANIMAL_COLUMNS; f++) {
          const walking = f >= 1 && f <= TRANSPORT.animalFrames
          const lowerStart = 1 + TRANSPORT.animalFrames, grazeStart = lowerStart + TRANSPORT.lowerFrames
          const grazing = f >= grazeStart ? 1 : f >= lowerStart ? (f - lowerStart) / (TRANSPORT.lowerFrames - 1) : 0
          const phase = walking ? (f - 1) / TRANSPORT.animalFrames : f >= grazeStart ? (f - grazeStart) / TRANSPORT.grazeFrames : 0
          rig.pose(phase, walking, grazing); render(rig.root, row, sheet, f, index * 8 + row)
        }
        scene.remove(rig.root); rig.dispose()
      }
      images[`${kind}-${coat.id}${hitched ? "-hitched" : ""}`] = sheet.canvas.toDataURL()
    }
    if (safePadding < 4) throw new Error(`Transport exceeds its safe frame (${safePadding}px).`)
    // A new carrying pose uses the unmodified population rig, camera and foot contacts.
    const designs = Array.from({ length: 6 }, (_, i) => pullingDesign(i))
    for (const clip of ["idle", "walk"] as const) {
      const frames = clip === "walk" ? BASE_PERSON.framesPerCycle : 1
      const sheet = canvas(BASE_PERSON.cellSize * frames, BASE_PERSON.cellSize * 8 * designs.length)
      for (const [variant, design] of designs.entries()) for (let f = 0; f < frames; f++) {
        const preview = renderPersonPreview(design, clip, f, false)
        sheet.ctx.drawImage(await decode(preview.url), f * BASE_PERSON.cellSize, variant * 8 * BASE_PERSON.cellSize)
      }
      images[`puller-${clip}`] = sheet.canvas.toDataURL()
    }
    // A basket-unloading action reuses the person's existing reaching/kneeling rig.
    const setup = canvas(BASE_PERSON.cellSize * PERSON_CLIPS.gathering.frames, BASE_PERSON.cellSize * 8 * designs.length)
    for (let variant = 0; variant < designs.length; variant++) for (let f = 0; f < PERSON_CLIPS.gathering.frames; f++) {
      const preview = renderPersonPreview(populationDesign(TRAVELER_TYPES.vendor, variant), "gathering", f, false)
      setup.ctx.drawImage(await decode(preview.url), f * BASE_PERSON.cellSize, variant * 8 * BASE_PERSON.cellSize)
    }
    images["merchant-setup"] = setup.canvas.toDataURL()
    const selling = canvas(BASE_PERSON.cellSize * KEEPER_COLUMNS, BASE_PERSON.cellSize * 48)
    for (let variant = 0; variant < designs.length; variant++) {
      const session = personFrameRenderer(populationDesign(TRAVELER_TYPES.vendor, variant))
      try {
        for (const [name, clip] of Object.entries(KEEPER_CLIPS)) for (let frame = 0; frame < clip.frames; frame++) for (let row = 0; row < 8; row++) {
          const phase = frame / (clip.frames - 1)
          const result = session.render(name === "sit" ? "sitting" : "idle", phase, row, false,
            name === "sit" ? undefined : rig => merchantGesture(rig.root, name as "wave" | "offer", phase))
          selling.ctx.drawImage(result.canvas, (clip.start + frame) * BASE_PERSON.cellSize, (variant * 8 + row) * BASE_PERSON.cellSize)
        }
      } finally { session.dispose() }
    }
    images["merchant-selling"] = selling.canvas.toDataURL()
    return { images, metadata: { ...TRANSPORT, keeperClips: KEEPER_CLIPS, keeperColumns: KEEPER_COLUMNS, directions: BASE_PERSON.directions, camera: { ...BASE_PERSON.camera, viewSize: extent },
      safePadding, cartFrame: CART, shop: { ...SHOP, seconds: SHOP_SECONDS, frames: TRANSPORT.shopFrames }, coats: COATS, merchantSetupFrames: PERSON_CLIPS.gathering.frames, cargo: CARGO, modes: CART_MODES, cartColumns: CART_COLUMNS, animalColumns: ANIMAL_COLUMNS,
      wheelCycleRadians: Math.PI * 2,
      animalProfiles: ANIMAL_PROFILES,
      animalRows: { donkey: 8, horse: 16 }, horseVariants: { common: { rowOffset: 0 }, noble: { rowOffset: 8 } },
      animalClips: { idle: { start: 0, frames: 1 }, walk: { start: 1, frames: TRANSPORT.animalFrames }, lower: { start: 1 + TRANSPORT.animalFrames, frames: TRANSPORT.lowerFrames }, graze: { start: 1 + TRANSPORT.animalFrames + TRANSPORT.lowerFrames, frames: TRANSPORT.grazeFrames, fps: 4 } },
      puller: { templateVersion: BASE_PERSON.version, cellSize: BASE_PERSON.cellSize, anchor: BASE_PERSON.anchor,
        frames: BASE_PERSON.framesPerCycle, idleFrames: 1, rows: 48, camera: BASE_PERSON.camera, designs } } }
  } finally { renderer.dispose() }
}
