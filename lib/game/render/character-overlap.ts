import * as THREE from "three"
import type { CharacterBatchEntry } from "./character-batch"
import { overlapBiases, type OverlapParticipant } from "./overlap-order"
import { spriteFrameBounds } from "./sprite-frame-bounds"
import { isWorldVisible } from "./visibility"

const uv = new THREE.Vector4()

/** Match the shader's pose/ground depth, in camera-space world units. */
export function characterOverlapBounds(entry: CharacterBatchEntry, camera: THREE.Camera, worldTexel = 0): OverlapParticipant {
  const sprite = entry.sprite, world = sprite.matrixWorld.elements, view = camera.matrixWorldInverse.elements
  const x = world[12], y = world[13], z = world[14]
  const vx = view[0] * x + view[4] * y + view[8] * z + view[12]
  const vy = view[1] * x + view[5] * y + view[9] * z + view[13]
  const distance = -(view[2] * x + view[6] * y + view[10] * z + view[14])
  const sx = Math.hypot(world[0], world[1], world[2]), sy = Math.hypot(world[4], world[5], world[6])
  const map = entry.color ?? sprite.material.map
  const frame = entry.uv ?? uv.set(map?.repeat.x ?? 1, map?.repeat.y ?? 1, map?.offset.x ?? 0, map?.offset.y ?? 0)
  const bounds = spriteFrameBounds(entry.depth.map.value, frame)
  let { left, right, bottom, top, near, far } = bounds
  // Vendor carts composite the seated driver's independently indexed atlas.
  for (const layer of entry.depthLayers ?? []) {
    if (!layer.visible.value) continue
    const extra = spriteFrameBounds(layer.map, { x: layer.frame.value.z, y: layer.frame.value.w, z: layer.frame.value.x, w: layer.frame.value.y })
    left = Math.min(left, extra.left); right = Math.max(right, extra.right)
    bottom = Math.min(bottom, extra.bottom); top = Math.max(top, extra.top)
    near = Math.min(near, extra.near); far = Math.max(far, extra.far)
  }
  left = vx + (left - sprite.center.x) * sx; right = vx + (right - sprite.center.x) * sx
  bottom = vy + (bottom - sprite.center.y) * sy; top = vy + (top - sprite.center.y) * sy
  near = distance + near * sx - .005; far = distance + far * sx - .005
  const ground = entry.ground.value
  if (ground.y > 0) {
    const nx = view[0] * ground.x + view[4] * ground.y + view[8] * ground.z
    const ny = view[1] * ground.x + view[5] * ground.y + view[9] * ground.z
    const nz = Math.max(.05, view[2] * ground.x + view[6] * ground.y + view[10] * ground.z)
    const gx = nx / nz, gy = ny / nz
    const plane = distance + (ground.x * x + ground.y * y + ground.z * z + ground.w) / nz - .005
      - .5 * worldTexel * (Math.abs(gx) + Math.abs(gy))
    near = Math.min(near, plane + Math.min((left - vx) * gx, (right - vx) * gx) + Math.min((bottom - vy) * gy, (top - vy) * gy))
  }
  const logical = entry.overlapAnchor?.matrixWorld.elements
  return { left, right, bottom, top, near, far, order: sprite.renderOrder,
    distance: logical ? -(view[2] * logical[12] + view[6] * logical[13] + view[10] * logical[14] + view[14]) : distance }
}

/** Resolve custom shaders, selected figures and batches in the same order. */
export class CharacterOverlap {
  private participants: OverlapParticipant[] = []
  private entries: CharacterBatchEntry[] = []
  private indices: number[] = []
  private shared = new Map<object, number>()
  private biases = new Float32Array(0)

  update(entries: Iterable<CharacterBatchEntry>, groups: Iterable<{ entries: CharacterBatchEntry[] }>, camera: THREE.Camera, worldTexel = 0) {
    const { participants, shared } = this
    participants.length = this.entries.length = this.indices.length = 0
    shared.clear()
    const admit = (entry: CharacterBatchEntry) => {
      if (!entry.depthBias) return
      const bounds = characterOverlapBounds(entry, camera, worldTexel)
      if (bounds.right <= bounds.left || bounds.top <= bounds.bottom) { entry.depthBias.value = 0; return }
      const assembly = typeof entry.shared === "function" ? entry.shared() : entry.shared
      let index = assembly ? shared.get(assembly) : undefined
      if (index === undefined) {
        index = participants.length; participants.push(bounds)
        if (assembly) shared.set(assembly, index)
      } else {
        const p = participants[index]
        p.left = Math.min(p.left, bounds.left); p.right = Math.max(p.right, bounds.right)
        p.bottom = Math.min(p.bottom, bounds.bottom); p.top = Math.max(p.top, bounds.top)
        p.near = Math.min(p.near, bounds.near); p.far = Math.max(p.far, bounds.far)
        // Selection can change which member is visited first. Pick the same
        // logical anchor regardless of atlas grouping or batch membership.
        if (bounds.order < p.order) { p.order = bounds.order; p.distance = bounds.distance }
      }
      this.entries.push(entry); this.indices.push(index)
    }
    for (const group of groups) for (const entry of group.entries) admit(entry)
    for (const entry of entries) {
      const sprite = entry.sprite
      if (!entry.depthBias || !sprite.visible) continue
      if (!isWorldVisible(sprite.parent)) { entry.depthBias.value = 0; continue }
      sprite.updateWorldMatrix(true, false)
      admit(entry)
    }
    if (this.biases.length < participants.length) this.biases = new Float32Array(Math.max(64, 2 ** Math.ceil(Math.log2(participants.length))))
    overlapBiases(participants, this.biases)
    for (let i = 0; i < this.entries.length; i++) this.entries[i].depthBias!.value = this.biases[this.indices[i]]
  }
}
