import * as THREE from "three"
import { characterBatchEntry } from "./character-batch"

/**
 * Figure sprites are square billboards much larger than the person, animal or
 * cart drawn on them. Three's sprite picking accepts the whole quad, so the
 * transparent margin of a nearer figure swallowed clicks meant for a cart, its
 * draught animal or a walker drawn behind it. Match the renderer instead: a
 * hit only counts where the current atlas frame is opaque at the material's
 * alpha test, the same approach tree foliage picking uses.
 */

interface OpaqueMask { threshold: number; width: number; height: number; bits: Uint8Array }
interface MaskImage { width: number; height: number; data?: ArrayLike<number> }
interface LiveCanvas extends MaskImage { getContext(kind: "2d"): CanvasRenderingContext2D | null }

const masks = new WeakMap<object, OpaqueMask | null>()
const readers = new WeakMap<object, CanvasRenderingContext2D | null>()
const pending = new WeakSet<object>()

function buildMask(width: number, height: number, data: ArrayLike<number>, threshold: number): OpaqueMask {
  const bits = new Uint8Array(Math.ceil(width * height / 8))
  for (let texel = 0, count = width * height; texel < count; texel++) {
    if (data[texel * 4 + 3] >= threshold) bits[texel >> 3] |= 1 << (texel & 7)
  }
  return { threshold, width, height, bits }
}

function decodeImage(image: MaskImage, threshold: number): OpaqueMask | null {
  const canvas = document.createElement("canvas")
  canvas.width = image.width; canvas.height = image.height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return null
  try {
    context.drawImage(image as unknown as CanvasImageSource, 0, 0)
    return buildMask(image.width, image.height, context.getImageData(0, 0, image.width, image.height).data, threshold)
  } catch { return null }
}

/** Reading a full cart atlas back takes long enough to drop frames, so image
 * decodes wait for idle time; the pointer usually crosses a figure well before
 * it clicks one. Until then the sprite stays fully clickable, as before. */
function scheduleDecode(image: MaskImage, threshold: number) {
  if (pending.has(image)) return
  pending.add(image)
  const run = () => { pending.delete(image); masks.set(image, decodeImage(image, threshold)) }
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 250 })
  else setTimeout(run, 0)
}

/** One bit per texel per shared atlas image. Unreadable images stay fully clickable. */
function opaqueMask(image: MaskImage, threshold: number): OpaqueMask | null {
  const cached = masks.get(image)
  if (cached !== undefined && (cached === null || cached.threshold === threshold)) return cached
  if (image.data) {
    const mask = buildMask(image.width, image.height, image.data, threshold)
    masks.set(image, mask)
    return mask
  }
  if (typeof document === "undefined") { masks.set(image, null); return null }
  scheduleDecode(image, threshold)
  return cached ?? null
}

/** Start decoding a figure's atlases as soon as they load, so masks are ready
 * before its first click rather than after its first hover. */
export function prepareSpritePicking(textures: Iterable<THREE.Texture>, alphaTest = .5): void {
  if (typeof document === "undefined") return
  for (const texture of textures) {
    const image = texture.image as MaskImage | undefined
    if (image && image.width > 0 && image.height > 0 && !image.data && !isLiveCanvas(image) && masks.get(image) === undefined) {
      scheduleDecode(image, Math.max(1, Math.ceil(alphaTest * 255)))
    }
  }
}

const isLiveCanvas = (image: MaskImage): image is LiveCanvas => typeof (image as LiveCanvas).getContext === "function"

/** Edited rig frames redraw a canvas every frame; read the texel as it is now. */
function liveAlpha(canvas: LiveCanvas, x: number, y: number): number | null {
  let context = readers.get(canvas)
  if (context === undefined) { context = canvas.getContext("2d"); readers.set(canvas, context) }
  if (!context) return null
  return context.getImageData(x, y, 1, 1).data[3]
}

/** Whether the sprite draws an opaque texel at quad coordinates `uv` (0,0 bottom-left). */
export function spriteTexelOpaque(sprite: THREE.Sprite, uv: { x: number; y: number }): boolean {
  const material = sprite.material, entry = characterBatchEntry(sprite)
  const texture = entry?.color ?? material.map
  const image = texture?.image as MaskImage | undefined
  if (!texture || !image || !(image.width > 0) || !(image.height > 0)) return true
  // Batched figures publish their frame beside the shared atlas; every other
  // sprite advances the frame through its own texture view's repeat and offset.
  const frame = entry?.uv
  const u = frame ? frame.z + uv.x * frame.x : texture.offset.x + uv.x * texture.repeat.x
  const v = frame ? frame.w + uv.y * frame.y : texture.offset.y + uv.y * texture.repeat.y
  const x = Math.min(image.width - 1, Math.max(0, Math.floor(u * image.width)))
  const y = Math.min(image.height - 1, Math.max(0, Math.floor((texture.flipY ? 1 - v : v) * image.height)))
  const threshold = Math.max(1, Math.ceil(material.alphaTest * 255))
  if (isLiveCanvas(image)) {
    const alpha = liveAlpha(image, x, y)
    return alpha === null || alpha >= threshold
  }
  const mask = opaqueMask(image, threshold)
  if (!mask) return true
  const texel = y * mask.width + x
  return (mask.bits[texel >> 3] & (1 << (texel & 7))) !== 0
}

/** Drop-in `raycast` for figure sprites: three's quad test, then the drawn-texel test. */
export function spriteTexelRaycast(this: THREE.Sprite, raycaster: THREE.Raycaster, intersections: THREE.Intersection[]): void {
  const quad: THREE.Intersection[] = []
  THREE.Sprite.prototype.raycast.call(this, raycaster, quad)
  for (const hit of quad) if (!hit.uv || spriteTexelOpaque(this, hit.uv)) intersections.push(hit)
}
