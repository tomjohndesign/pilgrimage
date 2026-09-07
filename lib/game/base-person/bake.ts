import * as THREE from "three"
import { personCamera } from "./camera"
import { BASE_PERSON, PERSON_CLIPS, WALK_CLIP_STRIDES, ACTION_CLIPS, SOCKET_NAMES, type BaseClip, type ActionClip, type SocketName } from "./pose"
import { DEFAULT_DESIGN, personRecipe, type PersonDesign } from "./design"
import { personCastShadow } from "./shadow"
import { inkPersonFrame } from "./ink"
import { createBasePersonRig } from "./rig"
import { spriteDepthBaker, SPRITE_DEPTH_ENCODING } from "../render/bake-depth"

export interface FrameRegistration {
  direction: string
  frame: number
  phase: number
  sockets: Record<SocketName, { x: number; y: number; depth: number }>
}
export interface BasePersonBake {
  walk: string
  idle: string
  debugWalk: string
  debugIdle: string
  shadowWalk: string
  shadowIdle: string
  depthWalk: string
  depthIdle: string
  actions: Record<ActionClip, { url: string; shadow: string; debug: string; depth: string }>
  metadata: {
    template: string
    depthEncoding: typeof SPRITE_DEPTH_ENCODING
    version: number
    cellSize: number
    nominalHeightPixels: number
    renderPalette: string[]
    anchor: number[]
    directions: string[]
    frameCount: number
    walkStrides: number
    camera: typeof BASE_PERSON.camera
    handedness: string
    design: PersonDesign
    safePadding: number
    clips: Record<BaseClip, FrameRegistration[]>
  }
}

let bakeRenderer: THREE.WebGLRenderer | undefined

/** Shared camera, ink and registration for both live previews and exported sheets. */
export function personFrameRenderer(design: PersonDesign, extraPalette: string[] = []) {
  const recipe = personRecipe(design)
  const size = recipe.cellSize
  // One small renderer per page, reused while adjusting parameters.
  const renderer = bakeRenderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true })
  renderer.localClippingEnabled = true
  renderer.setSize(size, size, false)
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0, 0)
  const scene = new THREE.Scene()
  const rig = createBasePersonRig(recipe)
  scene.add(rig.root)
  scene.add(new THREE.AmbientLight(0xffffff, 1.1))
  const light = new THREE.DirectionalLight(0xffffff, 1.8)
  light.position.set(-3, 7, 5)
  scene.add(light)
  const camera = personCamera(recipe)
  const depthBaker = spriteDepthBaker(renderer)
  const position = new THREE.Vector3()
  const palette = [...recipe.renderPalette, ...extraPalette].map((hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)))
  const canvas = document.createElement("canvas")
  canvas.width = size; canvas.height = size
  const context = canvas.getContext("2d", { willReadFrequently: true })!
  const maskCanvas = document.createElement("canvas")
  maskCanvas.width = size; maskCanvas.height = size
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true })!
  return {
    recipe,
    render(clip: BaseClip, phase: number, row: number, debug: boolean, poseOverride?: (rig: ReturnType<typeof createBasePersonRig>) => void) {
      rig.trackSides(debug)
      rig.view(row)
      rig.pose(phase * (clip === "walk" ? WALK_CLIP_STRIDES : 1), clip)
      poseOverride?.(rig)
      renderer.render(scene, camera)
      context.clearRect(0, 0, size, size)
      context.drawImage(renderer.domElement, 0, 0)
      let padding = size
      let depth: HTMLCanvasElement | null = null
      if (!debug) {
        rig.inkMask(true)
        renderer.render(scene, camera)
        maskContext.clearRect(0, 0, size, size)
        maskContext.drawImage(renderer.domElement, 0, 0)
        rig.inkMask(false)
        const colors = context.getImageData(0, 0, size, size)
        const inked = inkPersonFrame(colors.data, maskContext.getImageData(0, 0, size, size).data, size, palette, recipe.design.ink)
        depth = depthBaker.render(scene, camera, size, recipe.camera.viewSize, colors.data, inked.pixels)
        if (inked.padding < 4) throw new Error(`${clip}, ${recipe.directions[row]}, frame ${Math.round(phase * PERSON_CLIPS[clip].frames) + 1}: this design exceeds the four-pixel safe frame. Reduce the proportions.`)
        padding = inked.padding
        colors.data.set(inked.pixels)
        context.putImageData(colors, 0, 0)
      }
      const sockets = {} as FrameRegistration["sockets"]
      for (const name of SOCKET_NAMES) {
        rig.sockets[name].getWorldPosition(position).project(camera)
        sockets[name] = { x: (position.x + 1) * size / 2, y: (1 - position.y) * size / 2, depth: position.z }
      }
      return { canvas, depth, padding, sockets, shadow: debug ? null : personCastShadow(canvas, recipe.anchor, recipe.design.shadow) }
    },
    dispose() { depthBaker.dispose(); rig.dispose(); renderer.renderLists.dispose() },
  }
}

/** Export the animation's own block with the same camera, palette and pixel ink. */
export function bakeChoppingBlock() {
  const session = personFrameRenderer(DEFAULT_DESIGN)
  const size = session.recipe.cellSize
  const canvas = document.createElement("canvas")
  canvas.width = size; canvas.height = 8 * size
  const context = canvas.getContext("2d")!
  try {
    for (let row = 0; row < 8; row++) {
      const rendered = session.render("woodcutting", 0, row, false, rig => {
        rig.root.traverse(object => {
          if (object instanceof THREE.Mesh) object.visible = object.name === "chopping-block"
        })
        // The actor's block sits ahead of their feet; standalone remains anchor at the tree.
        rig.root.getObjectByName("woodcutting-log")!.position.z = 0
      })
      context.drawImage(rendered.canvas, 0, row * size)
    }
    return { url: canvas.toDataURL("image/png"), cellSize: size, anchor: session.recipe.anchor,
      rows: 8, templateVersion: session.recipe.version }
  } finally { session.dispose() }
}

export interface PersonPreview {
  url: string
  depthUrl: string
  shadowUrl: string
  design: PersonDesign
  clip: BaseClip
  frame: number
  sides: boolean
  sockets: FrameRegistration["sockets"][]
}

/** Only the eight currently visible poses; avoids rebuilding four atlases during a drag. */
export function renderPersonPreview(design: PersonDesign, clip: BaseClip, frame: number, sides: boolean): PersonPreview {
  const session = personFrameRenderer(design)
  const size = session.recipe.cellSize
  const canvas = document.createElement("canvas")
  canvas.width = size; canvas.height = 8 * size
  const context = canvas.getContext("2d")!
  const shadow = document.createElement("canvas")
  shadow.width = size; shadow.height = 8 * size
  const shadowContext = shadow.getContext("2d")!
  const depth = document.createElement("canvas")
  depth.width = size; depth.height = 8 * size
  const depthContext = depth.getContext("2d")!
  const sockets: PersonPreview["sockets"] = []
  try {
    for (let row = 0; row < 8; row++) {
      const rendered = session.render(clip, frame / PERSON_CLIPS[clip].frames, row, sides)
      context.drawImage(rendered.canvas, 0, row * size)
      if (rendered.shadow) shadowContext.drawImage(rendered.shadow, 0, row * size)
      if (rendered.depth) depthContext.drawImage(rendered.depth, 0, row * size)
      sockets.push(rendered.sockets)
    }
    return { url: canvas.toDataURL("image/png"), depthUrl: depth.toDataURL("image/png"), shadowUrl: shadow.toDataURL("image/png"), design, clip, frame, sides, sockets }
  } finally { session.dispose() }
}

/** Bake directly at final pixel resolution, without crops or per-pose resizing. */
export function bakeBasePerson(design: PersonDesign = DEFAULT_DESIGN, diagnostics = true): BasePersonBake {
  const session = personFrameRenderer(design)
  const recipe = session.recipe, size = recipe.cellSize
  const clips = Object.fromEntries(Object.keys(PERSON_CLIPS).map(clip => [clip, []])) as unknown as Record<BaseClip, FrameRegistration[]>
  let safePadding = size
  const shadows = {} as Record<BaseClip, string>
  const depths = {} as Record<BaseClip, string>
  const render = (clip: BaseClip, debug: boolean) => {
    const columns = PERSON_CLIPS[clip].frames
    const canvas = document.createElement("canvas")
    canvas.width = columns * size; canvas.height = 8 * size
    const context = canvas.getContext("2d")!
    const shadow = document.createElement("canvas")
    shadow.width = canvas.width; shadow.height = canvas.height
    const shadowContext = shadow.getContext("2d")!
    const depth = document.createElement("canvas")
    depth.width = canvas.width; depth.height = canvas.height
    const depthContext = depth.getContext("2d")!
    for (let row = 0; row < 8; row++) {
      for (let frame = 0; frame < columns; frame++) {
        const rendered = session.render(clip, frame / columns, row, debug)
        context.drawImage(rendered.canvas, frame * size, row * size)
        if (!debug) {
          if (rendered.shadow) shadowContext.drawImage(rendered.shadow, frame * size, row * size)
          if (rendered.depth) depthContext.drawImage(rendered.depth, frame * size, row * size)
          safePadding = Math.min(safePadding, rendered.padding)
          clips[clip].push({ direction: recipe.directions[row], frame, phase: frame / columns, sockets: rendered.sockets })
        }
      }
    }
    if (!debug) shadows[clip] = shadow.toDataURL("image/png")
    if (!debug) depths[clip] = depth.toDataURL("image/png")
    return canvas.toDataURL("image/png")
  }
  try {
    const actions = Object.fromEntries(ACTION_CLIPS.map(clip => {
      const url = render(clip, false)
      return [clip, { url, shadow: shadows[clip], depth: depths[clip], debug: diagnostics ? render(clip, true) : "" }]
    })) as BasePersonBake["actions"]
    return {
      actions,
      walk: render("walk", false), idle: render("idle", false),
      debugWalk: diagnostics ? render("walk", true) : "", debugIdle: diagnostics ? render("idle", true) : "",
      shadowWalk: shadows.walk, shadowIdle: shadows.idle,
      depthWalk: depths.walk, depthIdle: depths.idle,
      metadata: {
        template: recipe.id, depthEncoding: SPRITE_DEPTH_ENCODING, version: recipe.version, cellSize: size,
        nominalHeightPixels: recipe.nominalHeightPixels, renderPalette: recipe.renderPalette,
        anchor: recipe.anchor, directions: recipe.directions,
        frameCount: PERSON_CLIPS.walk.frames, walkStrides: WALK_CLIP_STRIDES, camera: recipe.camera,
        design: recipe.design, safePadding,
        handedness: "+X = anatomical left; +Z = forward. Never mirror a dressed sprite.", clips,
      },
    }
  } finally { session.dispose() }
}

const cache = new Map<string, BasePersonBake>()
export function cachedPersonBake(design: PersonDesign = DEFAULT_DESIGN): BasePersonBake {
  const key = JSON.stringify(personRecipe(design).design)
  const existing = cache.get(key)
  if (existing) return existing
  const result = bakeBasePerson(design)
  cache.set(key, result)
  if (cache.size > 4) cache.delete(cache.keys().next().value!)
  return result
}
