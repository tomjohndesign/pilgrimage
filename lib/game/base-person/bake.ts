import * as THREE from "three"
import { personCamera } from "./camera"
import { BASE_PERSON, PERSON_CLIPS, WALK_CLIP_STRIDES, ACTION_CLIPS, SOCKET_NAMES, type BaseClip, type ActionClip, type SocketName } from "./pose"
import { DEFAULT_DESIGN, personRecipe, type PersonDesign } from "./design"
import type { PoseEdits } from "./pose-edits"
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
export function personFrameRenderer(design: PersonDesign, extraPalette: string[] = [], framing?: {
  cellSize: number; anchor: readonly [number, number]; viewSize: number; occluder?: THREE.Object3D
}) {
  const recipe = personRecipe(design)
  const size = framing?.cellSize ?? recipe.cellSize
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
  if (framing?.occluder) scene.add(framing.occluder)
  scene.add(new THREE.AmbientLight(0xffffff, 1.1))
  const light = new THREE.DirectionalLight(0xffffff, 1.8)
  light.position.set(-3, 7, 5)
  scene.add(light)
  const camera = personCamera(framing ? { ...recipe, cellSize: size, anchor: [...framing.anchor],
    camera: { ...recipe.camera, viewSize: framing.viewSize } } : recipe)
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
    recipe, rig,
    /** `edits` lets a long-lived session preview pose drafts without rebuilding the rig. */
    render(clip: BaseClip, phase: number, row: number, debug: boolean, poseOverride?: (rig: ReturnType<typeof createBasePersonRig>) => void, edits: PoseEdits | undefined = recipe.design.poseEdits) {
      // A progressive bake and a live preview may interleave on the shared renderer.
      if (renderer.domElement.width !== size || renderer.domElement.height !== size) renderer.setSize(size, size, false)
      rig.trackSides(debug)
      rig.view(row)
      rig.pose(phase * (clip === "walk" ? WALK_CLIP_STRIDES : 1), clip, edits)
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
        depth = depthBaker.render(scene, camera, size, framing?.viewSize ?? recipe.camera.viewSize, colors.data, inked.pixels)
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
      return { canvas, depth, padding, sockets, shadow: debug ? null : personCastShadow(canvas, framing ? [...framing.anchor] : recipe.anchor, recipe.design.shadow) }
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
  /** Sheet rows that were rendered; a drag only refreshes the facing on screen. */
  rows: number[]
  sockets: FrameRegistration["sockets"][]
}

const ALL_ROWS = [0, 1, 2, 3, 4, 5, 6, 7]
export type PersonSession = ReturnType<typeof personFrameRenderer>
/** Everything but pose keys: sessions built for the same key can render any pose draft of that design. */
export const personSessionKey = (design: PersonDesign) => JSON.stringify({ ...personRecipe(design).design, poseEdits: undefined })
/** Only the currently visible poses; avoids rebuilding four atlases during a drag.
 * Pass a `session` made for the same `personSessionKey` to keep its rig and compiled shaders across drafts; it stays open. */
export function renderPersonPreview(design: PersonDesign, clip: BaseClip, frame: number, sides: boolean, rows: readonly number[] = ALL_ROWS, shared?: PersonSession): PersonPreview {
  const session = shared ?? personFrameRenderer(design)
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
    for (const row of rows) {
      const rendered = session.render(clip, frame / PERSON_CLIPS[clip].frames, row, sides, undefined, design.poseEdits)
      context.drawImage(rendered.canvas, 0, row * size)
      if (rendered.shadow) shadowContext.drawImage(rendered.shadow, 0, row * size)
      if (rendered.depth) depthContext.drawImage(rendered.depth, 0, row * size)
      sockets[row] = rendered.sockets
    }
    return { url: canvas.toDataURL("image/png"), depthUrl: depth.toDataURL("image/png"), shadowUrl: shadow.toDataURL("image/png"), design, clip, frame, sides, rows: [...rows], sockets }
  } finally { if (!shared) session.dispose() }
}

interface ClipBake { url: string; shadow: string; depth: string; debug: string; frames: FrameRegistration[]; padding: number }
export interface BakeProgress { done: number; total: number }
const BAKE_ORDER: BaseClip[] = [...ACTION_CLIPS, "walk", "idle"]
const clipCache = new Map<string, ClipBake>()
const CLIP_CACHE_LIMIT = 4 * BAKE_ORDER.length

/** A clip's frames depend on the design and only that clip's own pose keys, so editing one pose re-renders one sheet. */
export function personClipBakeKey(design: PersonDesign, clip: BaseClip) {
  return JSON.stringify([clip, { ...design, poseEdits: design.poseEdits?.[clip] ?? null }])
}

/** Bake directly at final pixel resolution, one sheet row per step so callers can paint progress or stop early. */
export function* bakePersonSteps(design: PersonDesign = DEFAULT_DESIGN, diagnostics = true): Generator<BakeProgress, BasePersonBake> {
  const recipe = personRecipe(design), size = recipe.cellSize
  const passes = diagnostics ? 2 : 1, total = BAKE_ORDER.length * 8 * passes
  let done = 0, session: ReturnType<typeof personFrameRenderer> | undefined
  const results = {} as Record<BaseClip, ClipBake>
  const sheet = (columns: number) => {
    const canvas = document.createElement("canvas")
    canvas.width = columns * size; canvas.height = 8 * size
    return { canvas, context: canvas.getContext("2d")! }
  }
  try {
    yield { done, total } // Announce the bake before the first row so the editor can show it starting.
    for (const clip of BAKE_ORDER) {
      const key = personClipBakeKey(recipe.design, clip), columns = PERSON_CLIPS[clip].frames
      let entry = clipCache.get(key)
      if (entry && (!diagnostics || entry.debug)) { results[clip] = entry; done += 8 * passes; yield { done, total }; continue }
      session ??= personFrameRenderer(design)
      if (!entry) {
        const color = sheet(columns), shadow = sheet(columns), depth = sheet(columns)
        const frames: FrameRegistration[] = []
        let padding = size
        for (let row = 0; row < 8; row++) {
          for (let frame = 0; frame < columns; frame++) {
            const rendered = session.render(clip, frame / columns, row, false)
            color.context.drawImage(rendered.canvas, frame * size, row * size)
            if (rendered.shadow) shadow.context.drawImage(rendered.shadow, frame * size, row * size)
            if (rendered.depth) depth.context.drawImage(rendered.depth, frame * size, row * size)
            padding = Math.min(padding, rendered.padding)
            frames.push({ direction: recipe.directions[row], frame, phase: frame / columns, sockets: rendered.sockets })
          }
          done++; yield { done, total }
        }
        entry = { url: color.canvas.toDataURL("image/png"), shadow: shadow.canvas.toDataURL("image/png"), depth: depth.canvas.toDataURL("image/png"), debug: "", frames, padding }
      } else done += 8
      if (diagnostics) {
        const debug = sheet(columns)
        for (let row = 0; row < 8; row++) {
          for (let frame = 0; frame < columns; frame++) debug.context.drawImage(session.render(clip, frame / columns, row, true).canvas, frame * size, row * size)
          done++; yield { done, total }
        }
        entry = { ...entry, debug: debug.canvas.toDataURL("image/png") }
      }
      clipCache.delete(key); clipCache.set(key, entry)
      if (clipCache.size > CLIP_CACHE_LIMIT) clipCache.delete(clipCache.keys().next().value!)
      results[clip] = entry
    }
  } finally { session?.dispose() }
  const clips = Object.fromEntries(BAKE_ORDER.map(clip => [clip, results[clip].frames])) as Record<BaseClip, FrameRegistration[]>
  const actions = Object.fromEntries(ACTION_CLIPS.map(clip => [clip, { url: results[clip].url, shadow: results[clip].shadow, depth: results[clip].depth, debug: results[clip].debug }])) as BasePersonBake["actions"]
  return {
    actions,
    walk: results.walk.url, idle: results.idle.url,
    debugWalk: results.walk.debug, debugIdle: results.idle.debug,
    shadowWalk: results.walk.shadow, shadowIdle: results.idle.shadow,
    depthWalk: results.walk.depth, depthIdle: results.idle.depth,
    metadata: {
      template: recipe.id, depthEncoding: SPRITE_DEPTH_ENCODING, version: recipe.version, cellSize: size,
      nominalHeightPixels: recipe.nominalHeightPixels, renderPalette: recipe.renderPalette,
      anchor: recipe.anchor, directions: recipe.directions,
      frameCount: PERSON_CLIPS.walk.frames, walkStrides: WALK_CLIP_STRIDES, camera: recipe.camera,
      design: recipe.design, safePadding: Math.min(...BAKE_ORDER.map(clip => results[clip].padding)),
      handedness: "+X = anatomical left; +Z = forward. Never mirror a dressed sprite.", clips,
    },
  }
}

export function bakeBasePerson(design: PersonDesign = DEFAULT_DESIGN, diagnostics = true): BasePersonBake {
  const steps = bakePersonSteps(design, diagnostics)
  for (;;) { const next = steps.next(); if (next.done) return next.value }
}

const cache = new Map<string, BasePersonBake>()
const bakeKey = (design: PersonDesign) => JSON.stringify(personRecipe(design).design)
function rememberBake(key: string, result: BasePersonBake) {
  cache.set(key, result)
  if (cache.size > 4) cache.delete(cache.keys().next().value!)
  return result
}
export function cachedPersonBake(design: PersonDesign = DEFAULT_DESIGN): BasePersonBake {
  const key = bakeKey(design)
  return cache.get(key) ?? rememberBake(key, bakeBasePerson(design))
}

/** Wait for a frame to paint (React commits its scheduled render first), then continue in a fresh task. */
const paintFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
const PAINT_BUDGET_MS = 40

/** Bake with regular paint breaks so the editor can show progress; cancelling resolves null and releases the renderer. */
export function bakePersonProgressively(design: PersonDesign, onProgress: (progress: BakeProgress) => void): { promise: Promise<BasePersonBake | null>; cancel: () => void } {
  const key = bakeKey(design), ready = cache.get(key)
  if (ready) return { promise: Promise.resolve(ready), cancel: () => {} }
  const steps = bakePersonSteps(design)
  let cancelled = false
  const promise = (async () => {
    let painted = performance.now()
    for (;;) {
      if (cancelled) { steps.return(undefined as unknown as BasePersonBake); return null }
      const next = steps.next()
      if (next.done) return rememberBake(key, next.value)
      onProgress(next.value)
      // Cached clips fly past; only real rendering earns a paint break, so the total stays close to a straight bake.
      if (next.value.done === 0 || performance.now() - painted > PAINT_BUDGET_MS) { await paintFrame(); painted = performance.now() }
    }
  })()
  return { promise, cancel: () => { cancelled = true } }
}
