import * as THREE from "three"
import type { CharacterBatchEntry } from "./character-batch"
import { overlapBiases, type OverlapParticipant } from "./overlap-order"
import { isWorldVisible } from "./visibility"

/** Resolve every visible sprite in one order, including custom cart shaders and
 * selected figures. A seated party shares one correction so its internal relief
 * cannot separate or flicker as neighboring walkers enter the overlap. */
export class CharacterOverlap {
  private participants: OverlapParticipant[] = []
  private entries: CharacterBatchEntry[] = []
  private indices: number[] = []
  private shared = new Map<object, number>()
  private biases = new Float32Array(0)
  private anchor = new THREE.Vector3()

  update(entries: Iterable<CharacterBatchEntry>, groups: Iterable<{ entries: CharacterBatchEntry[] }>, camera: THREE.Camera) {
    const { participants, anchor, shared } = this
    participants.length = this.entries.length = this.indices.length = 0
    shared.clear()
    const view = camera.matrixWorldInverse.elements
    const admit = (entry: CharacterBatchEntry) => {
      if (!entry.depthBias) return
      let index = entry.shared ? shared.get(entry.shared) : undefined
      if (index === undefined) {
        index = participants.length
        // Animation moves the rendered feet around the logical ground position.
        // Sorting by that motion swaps near-coincident people every half stride.
        // Batch.write (or getWorldPosition below) already refreshed this matrix.
        const logical = entry.overlapAnchor?.matrixWorld.elements
        const x = logical?.[12] ?? entry.anchorX!, z = logical?.[14] ?? entry.anchorZ!
        const distance = logical ? -(view[2] * x + view[6] * logical[13] + view[10] * z + view[14]) : entry.anchorDistance!
        participants.push({ x, z, distance, size: entry.anchorSize!, order: entry.sprite.renderOrder })
        if (entry.shared) shared.set(entry.shared, index)
      } else {
        const participant = participants[index]
        participant.size = Math.max(participant.size, entry.anchorSize!)
        participant.order = Math.min(participant.order, entry.sprite.renderOrder)
      }
      this.entries.push(entry); this.indices.push(index)
    }
    // Batches already computed their anchors, even though their sources are hidden.
    for (const group of groups) for (const entry of group.entries) admit(entry)
    for (const entry of entries) {
      const sprite = entry.sprite
      if (!entry.depthBias || !sprite.visible) continue
      if (!isWorldVisible(sprite.parent)) { entry.depthBias.value = 0; continue }
      sprite.getWorldPosition(anchor)
      entry.anchorX = anchor.x; entry.anchorZ = anchor.z
      entry.anchorDistance = -(view[2] * anchor.x + view[6] * anchor.y + view[10] * anchor.z + view[14])
      const world = sprite.matrixWorld.elements
      entry.anchorSize = Math.hypot(world[0], world[1], world[2])
      admit(entry)
    }
    if (this.biases.length < participants.length) this.biases = new Float32Array(Math.max(64, 2 ** Math.ceil(Math.log2(participants.length))))
    overlapBiases(participants, this.biases)
    for (let i = 0; i < this.entries.length; i++) this.entries[i].depthBias!.value = this.biases[this.indices[i]]
  }
}
