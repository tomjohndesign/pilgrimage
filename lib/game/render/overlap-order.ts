/** Camera-space silhouette bounds and the actual depth range of its pose.
 * Distances grow away from the camera. Shared cart/passenger layers form one
 * participant, preserving their internal per-pixel depth. */
export interface OverlapParticipant {
  left: number; right: number; bottom: number; top: number
  near: number; far: number
  /** Logical ground-anchor depth, independent of animated foot planting. */
  distance: number
  order: number
}

/** Clear float/depth-buffer rounding without an estimated body thickness. */
export const OVERLAP_CLEARANCE = .001

/** Separate intersecting silhouettes back to front. Screen-space bounds catch
 * the ends of long carts/animals even when their ground anchors are far apart.
 * Every constraint includes previously applied corrections, so moving a body
 * forward cannot slice through a third figure outside its original neighbourhood.
 * A sweep avoids comparing figures in disjoint screen columns. */
export function overlapBiases(participants: readonly OverlapParticipant[], out: Float32Array<ArrayBufferLike> = new Float32Array(participants.length)): Float32Array<ArrayBufferLike> {
  const count = participants.length
  if (out.length < count) out = new Float32Array(count)
  out.fill(0, 0, count)
  const ordered = Array.from({ length: count }, (_, i) => i)
  ordered.sort((a, b) => participants[b].distance - participants[a].distance || participants[a].order - participants[b].order)
  const rank = new Int32Array(count)
  ordered.forEach((index, i) => { rank[index] = i })
  const behind: number[][] = Array.from({ length: count }, () => [])
  const sweep = ordered.slice().sort((a, b) => participants[a].left - participants[b].left)
  const active: number[] = []
  for (const i of sweep) {
    const p = participants[i]
    let keep = 0
    for (const j of active) {
      const q = participants[j]
      if (q.right <= p.left) continue
      active[keep++] = j
      if (q.top <= p.bottom || p.top <= q.bottom) continue
      if (rank[j] < rank[i]) behind[i].push(j)
      else behind[j].push(i)
    }
    active.length = keep; active.push(i)
  }
  for (const i of ordered) {
    const p = participants[i]
    let bias = 0
    for (const j of behind[i]) bias = Math.max(bias, p.far - participants[j].near + out[j] + OVERLAP_CLEARANCE)
    out[i] = bias
  }
  return out
}
