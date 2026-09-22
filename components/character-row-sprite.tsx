"use client"

import { useEffect, useRef, useState } from "react"
import { BASE_PERSON, PERSON_CLIPS, type BaseClip, type ActionClip } from "@/lib/game/base-person/pose"
import { PERSON_PRESETS, type PersonDesign } from "@/lib/game/base-person/design"
import knightMetadata from "@/public/textures/knights/v14/manifest.json"
import { CHARACTER_PIXEL_SIZE } from "@/lib/game/render/pixel-scale"
import { BASE_CHARACTER_SCALE } from "@/lib/game/base-person/gait"
import { POPULATION_PROFILES } from "@/lib/game/base-person/population"

export type CharacterSpriteFrames = { worldSize: number; center: [number, number]; idle: HTMLCanvasElement; walk: HTMLCanvasElement; size: number; frames: number; fps: number; bounds: [number, number, number, number] }
const cache = new Map<string, Promise<CharacterSpriteFrames>>()
let queue = Promise.resolve()
const nextPaint = () => new Promise<void>(resolve => setTimeout(resolve, 0))
function canvas(w: number, h: number) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c }
async function image(url: string) { const i = new Image(); i.src = url; await i.decode(); return i }
function bounds(idle: HTMLCanvasElement, walk: HTMLCanvasElement, size: number): CharacterSpriteFrames["bounds"] {
  let l = size, t = size, r = 0, b = 0
  for (const sheet of [idle, walk]) { const pixels = sheet.getContext("2d")!.getImageData(0, 0, sheet.width, size).data
    for (let y = 0; y < size; y++) for (let x = 0; x < sheet.width; x++) if (pixels[(y * sheet.width + x) * 4 + 3] > 32) { const col = x % size; l = Math.min(l, col); r = Math.max(r, col); t = Math.min(t, y); b = Math.max(b, y) }
  }
  return r >= l ? [l, t, r - l + 1, b - t + 1] : [0, 0, size, size]
}
async function loadSprite(id: string, draft?: PersonDesign, sequence: BaseClip = "walk"): Promise<CharacterSpriteFrames> {
  const preset = draft ?? (id.startsWith("preset/") ? PERSON_PRESETS[id.slice(7)] : undefined)
  let size = BASE_PERSON.cellSize, frames = PERSON_CLIPS[sequence].frames, fps = BASE_PERSON.defaultFps
  let center: [number, number] = [BASE_PERSON.anchor[0] / size, 1 - BASE_PERSON.anchor[1] / size]
  let worldSize = size * CHARACTER_PIXEL_SIZE
  let idle: HTMLCanvasElement, walk: HTMLCanvasElement
  if (preset) {
    const { personFrameRenderer } = await import("@/lib/game/base-person/bake")
    const { actionPlaybackRate } = await import("@/lib/game/base-person/activity")
    const session = personFrameRenderer(preset); size = session.recipe.cellSize
    idle = canvas(size, size); walk = canvas(size * frames, size); fps *= actionPlaybackRate(sequence, preset)
    try { idle.getContext("2d")!.drawImage(session.render("idle", 0, 1, false).canvas, 0, 0)
      for (let frame = 0; frame < frames; frame++) { await nextPaint(); walk.getContext("2d")!.drawImage(session.render(sequence, frame / frames, 1, false).canvas, frame * size, 0) }
    } finally { session.dispose() }
  } else {
    let idleUrl: string, walkUrl: string, row: number
    if (id === "cart") {
      const { cartUrl, CART, TRANSPORT } = await import("@/lib/game/transport/assets")
      size = CART.cellSize; center = [CART.anchor[0] / size, 1 - CART.anchor[1] / size]; worldSize = size * CHARACTER_PIXEL_SIZE; frames = TRANSPORT.wheelFrames; fps = 12; row = 2
      idleUrl = walkUrl = cartUrl("produce", "hand", 1, true)
    } else if (id.startsWith("knight/")) {
      const { KNIGHT } = await import("@/lib/game/knight/design")
      const variant = Math.max(0, POPULATION_PROFILES.findIndex(p => id === `knight/${p.id}`)) % KNIGHT.variants
      row = variant * 8 + 1; size = knightMetadata.person.cellSize; center = [knightMetadata.person.anchor[0] / size, 1 - knightMetadata.person.anchor[1] / size]; worldSize = size * CHARACTER_PIXEL_SIZE; frames = knightMetadata.person.frameCounts[sequence as keyof typeof knightMetadata.person.frameCounts] ?? knightMetadata.person.frameCounts.walk
      const { knightPersonClip } = await import("@/lib/game/knight/visual")
      idleUrl = knightPersonClip("idle").url; walkUrl = knightPersonClip(sequence in knightMetadata.person.frameCounts ? sequence : "walk").url
    } else {
      const parts = id.split("/"); let visual
      if (parts[0] === "job") {
        const { jobVisual } = await import("@/lib/game/jobs/assets")
        const { SETTLEMENT_JOBS } = await import("@/lib/game/jobs/design")
        if (!(parts[1] in SETTLEMENT_JOBS)) throw new Error("Unknown job sprite")
        visual = jobVisual(parts[1] as keyof typeof SETTLEMENT_JOBS, Math.max(0, POPULATION_PROFILES.findIndex(p => p.id === parts[2])))
      } else {
        const { populationVisual, DEFAULT_POPULATION } = await import("@/lib/game/base-person/population-assets")
        if (!(parts[0] in DEFAULT_POPULATION.callings)) throw new Error("Unknown character sprite")
        visual = populationVisual(parts[0] as keyof typeof DEFAULT_POPULATION.callings, Math.max(0, POPULATION_PROFILES.findIndex(p => p.id === parts[1])), null)
      }
      center = visual.center; worldSize = visual.scale * BASE_CHARACTER_SCALE
      const motion = sequence === "idle" ? visual.idle : sequence === "walk" ? visual.walk : visual.actions[sequence as ActionClip] ?? visual.walk
      idleUrl = visual.idle.url; walkUrl = motion.url; row = visual.rowOffset + 1; frames = motion.columns; fps = visual.fps * ("playbackRate" in motion ? motion.playbackRate ?? 1 : 1)
    }
    const [still, moving] = await Promise.all([image(idleUrl), image(walkUrl)])
    size = moving.width / frames; idle = canvas(size, size); walk = canvas(size * frames, size)
    idle.getContext("2d")!.drawImage(still, 0, row * size, size, size, 0, 0, size, size)
    walk.getContext("2d")!.drawImage(moving, 0, row * size, size * frames, size, 0, 0, size * frames, size)
  }
  return { idle, walk, frames, size, fps, center, worldSize, bounds: bounds(idle!, walk!, size) }
}
export function characterSprite(id: string, design?: PersonDesign, sequence: BaseClip = "walk") {
  const key = id + sequence + (design ? JSON.stringify(design) : "")
  let result = cache.get(key)
  if (!result) { result = id.startsWith("preset/") || design ? queue.then(() => loadSprite(id, design, sequence)) : loadSprite(id, design, sequence); if (id.startsWith("preset/") || design) queue = result.then(() => {}, () => {}); cache.set(key, result); if (cache.size > 96) cache.delete(cache.keys().next().value!) }
  return result
}

/** Actual 16 px sprites; only visible hovered/focused rows animate, using the existing clips.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/CCL-0
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/CTF-0
 */
export function CharacterRowSprite({ id, active, design, sequence = "walk", size = 16 }: { id: string; active: boolean; design?: PersonDesign; sequence?: "random" | "walk"; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [randomClip] = useState<BaseClip>(() => (["walk", "wearyWalk", "praying", "sitting", "preaching"] as const)[Math.floor(Math.random() * 5)])
  const [phase] = useState(() => Math.random() * 2000)
  const clip = sequence === "random" ? randomClip : "walk"
  const [visible, setVisible] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => { const query = matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReducedMotion(query.matches); update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update) }, [])
  const [idleSource, setIdleSource] = useState<CharacterSpriteFrames | null>(null)
  const [movingSource, setMovingSource] = useState<CharacterSpriteFrames | null>(null)
  const source = active && movingSource ? movingSource : idleSource
  useEffect(() => { const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting)); if (ref.current) observer.observe(ref.current); return () => observer.disconnect() }, [])
  useEffect(() => { if (!visible) return; let cancelled = false
    characterSprite(id, design, "idle").then(result => { if (!cancelled) setIdleSource(result) }).catch(error => console.warn(`Character preview ${id}:`, error))
    return () => { cancelled = true }
  }, [id, visible, design])
  useEffect(() => { if (!visible || !active || reducedMotion || !idleSource) return; let cancelled = false
    characterSprite(id, design, clip).then(result => { if (!cancelled) setMovingSource(result) }).catch(error => console.warn(`Character animation ${id}:`, error))
    return () => { cancelled = true }
  }, [id, visible, active, idleSource, design, clip, reducedMotion])

  useEffect(() => {
    if (!source || !ref.current) return
    let request = 0, start = performance.now(), last = -1
    const reduced = matchMedia("(prefers-reduced-motion: reduce)")
    const draw = (frame: number, walking: boolean) => { const ctx = ref.current?.getContext("2d"); if (!ctx) return
      const sheet = walking ? source : idleSource ?? source
      const [x,y,w,h] = sheet.bounds, scale = 16 / Math.max(w,h)
      ctx.clearRect(0,0,16,16); ctx.imageSmoothingEnabled = false
      ctx.drawImage(walking ? sheet.walk : sheet.idle, (walking ? frame * sheet.size : 0) + x, y, w, h, Math.round((16-w*scale)/2), Math.round(16-h*scale), Math.round(w*scale), Math.round(h*scale))
    }
    const tick = (time: number) => { if (!active || !visible || document.hidden || reduced.matches) { draw(0,false); return }
      const frame = Math.floor((time-start)/1000*source.fps)%source.frames
      if (frame !== last) { last = frame; draw(frame,true) }; request = requestAnimationFrame(tick)
    }
    const resume = () => { cancelAnimationFrame(request); start = performance.now() - (sequence === "random" ? phase : 0); last = -1; tick(performance.now()) }
    resume(); document.addEventListener("visibilitychange",resume); reduced.addEventListener("change",resume)
    return () => { cancelAnimationFrame(request); document.removeEventListener("visibilitychange",resume); reduced.removeEventListener("change",resume) }
  }, [source, idleSource, active, visible, phase, sequence])
  return <canvas ref={ref} width={16} height={16} aria-hidden="true" data-sprite-id={id} data-sequence={clip} style={{ width:size,height:size,imageRendering:"pixelated" }} />
}
