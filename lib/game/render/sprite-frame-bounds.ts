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
 * Read only a newly displayed cell, never the full atlas. Immutable image cells
 * are shared across every instance; edited canvas frames invalidate by version. */
export function spriteFrameBounds(texture: THREE.Texture | null, uv: { x: number; y: number; z: number; w: number }): SpriteFrameBounds {
  const image = texture?.image as { width: number; height: number; data?: ArrayLike<number> } | undefined
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
  let data: ArrayLike<number>, stride: number, start: number
  if (image.data) { data = image.data; stride = image.width; start = y * stride + x }
  else {
    if (typeof document === "undefined") return full
    context ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })
    if (!context) return full
    context.canvas.width = width; context.canvas.height = height
    context.drawImage(image as CanvasImageSource, x, y, width, height, 0, 0, width, height)
    data = context.getImageData(0, 0, width, height).data; stride = width; start = 0
  }
  let left = width, right = 0, bottom = height, top = 0, near = 1, far = -1
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    const at = (start + row * stride + column) * 4
    if (data[at + 2] < 128) continue
    left = Math.min(left, column); right = Math.max(right, column + 1)
    const v = texture.flipY ? height - 1 - row : row
    bottom = Math.min(bottom, v); top = Math.max(top, v + 1)
    const distance = 1 - 2 * (data[at] * 256 + data[at + 1]) / 65535
    near = Math.min(near, distance); far = Math.max(far, distance)
  }
  const bounds = right ? { left: left / width, right: right / width, bottom: bottom / height, top: top / height, near, far } : empty
  cache.values.set(key, bounds)
  return bounds
}
