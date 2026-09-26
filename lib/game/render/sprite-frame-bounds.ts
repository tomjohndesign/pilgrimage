import type * as THREE from "three"

export interface SpriteFrameBounds {
  left: number; right: number; bottom: number; top: number
  near: number; far: number
}
const frames = new WeakMap<object, { version: number; values: Map<string, SpriteFrameBounds> }>()
let context: CanvasRenderingContext2D | null | undefined
const full: SpriteFrameBounds = { left: 0, right: 1, bottom: 0, top: 1, near: -1, far: 1 }
const empty: SpriteFrameBounds = { left: 1, right: 0, bottom: 1, top: 0, near: 1, far: -1 }

/** Depth atlases mark exactly the opaque silhouette (including ink) in B.
 * Immutable image cells are shared across every instance: the first miss on an
 * atlas decodes it once and measures every cell on the same grid. Each separate
 * cell read redraws from the full image, so a crowd walking through hundreds of
 * new cells cost far more than one complete decode. Edited canvas frames read
 * only the displayed cell and invalidate by version. */
export function spriteFrameBounds(texture: THREE.Texture | null, uv: { x: number; y: number; z: number; w: number }): SpriteFrameBounds {
  const image = texture?.image as { width: number; height: number; data?: ArrayLike<number>; getContext?: unknown } | undefined
  if (!texture || !image?.width || !image?.height) return full
  let cache = frames.get(texture.source)
  if (!cache || cache.version !== texture.source.version) {
    cache = { version: texture.source.version, values: new Map() }; frames.set(texture.source, cache)
  }
  const width = Math.round(uv.x * image.width), height = Math.round(uv.y * image.height)
  const x = Math.round(uv.z * image.width), y = Math.round((texture.flipY ? 1 - uv.w - uv.y : uv.w) * image.height)
  const key = `${x}:${y}:${width}:${height}`
  const cached = cache.values.get(key)
  if (cached) return cached
  if (width < 1 || height < 1) return full
  if (image.data) return measure(cache.values, key, image.data, image.width, y * image.width + x, width, height, texture.flipY)
  if (typeof document === "undefined") return full
  context ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })
  if (!context) return full
  if (typeof image.getContext !== "function" && x >= 0 && y >= 0 && x + width <= image.width && y + height <= image.height) {
    context.canvas.width = image.width; context.canvas.height = image.height
    context.drawImage(image as CanvasImageSource, 0, 0)
    const data = context.getImageData(0, 0, image.width, image.height).data
    context.canvas.width = context.canvas.height = 1
    for (let top = y % height; top + height <= image.height; top += height) for (let left = x % width; left + width <= image.width; left += width) {
      const cell = `${left}:${top}:${width}:${height}`
      if (!cache.values.has(cell)) measure(cache.values, cell, data, image.width, top * image.width + left, width, height, texture.flipY)
    }
    return cache.values.get(key)!
  }
  context.canvas.width = width; context.canvas.height = height
  context.drawImage(image as CanvasImageSource, x, y, width, height, 0, 0, width, height)
  return measure(cache.values, key, context.getImageData(0, 0, width, height).data, width, 0, width, height, texture.flipY)
}

function measure(values: Map<string, SpriteFrameBounds>, key: string, data: ArrayLike<number>, stride: number, start: number, width: number, height: number, flipY: boolean): SpriteFrameBounds {
  let left = width, right = 0, bottom = height, top = 0, near = 1, far = -1
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    const at = (start + row * stride + column) * 4
    if (data[at + 2] < 128) continue
    left = Math.min(left, column); right = Math.max(right, column + 1)
    const v = flipY ? height - 1 - row : row
    bottom = Math.min(bottom, v); top = Math.max(top, v + 1)
    const distance = 1 - 2 * (data[at] * 256 + data[at + 1]) / 65535
    near = Math.min(near, distance); far = Math.max(far, distance)
  }
  const bounds = right ? { left: left / width, right: right / width, bottom: bottom / height, top: top / height, near, far } : empty
  values.set(key, bounds)
  return bounds
}
