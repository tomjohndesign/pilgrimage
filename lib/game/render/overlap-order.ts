/** Screen silhouette, physical pose depth range, and global rail sort key.
 * Distances grow away from the camera. Every drawable is independent. */
export interface OverlapParticipant {
  left: number; right: number; bottom: number; top: number
  near: number; far: number
  distance: number
  /** Stable identity breaks coincident rail depths. */
  order: number
}

export const OVERLAP_CLEARANCE = .001

/** Shared by rendering and the playground's recorded back-to-front baseline. */
export function overlapOrder(participants: readonly Pick<OverlapParticipant, "distance" | "order">[]): number[] {
  return Array.from({ length: participants.length }, (_, i) => i).sort((a, b) =>
    participants[b].distance - participants[a].distance || participants[a].order - participants[b].order)
}

/** One global back-to-front order. Bounds only limit which depth corrections
 * must propagate; they never change the order or combine convoy members.
 * An X sweep avoids comparing every pair in a dispersed crowd. */
export function overlapBiases(participants: readonly OverlapParticipant[], out: Float32Array<ArrayBufferLike> = new Float32Array(participants.length)): Float32Array<ArrayBufferLike> {
  const count = participants.length
  if (out.length < count) out = new Float32Array(count)
  out.fill(0, 0, count)
  if (count < 2) return out
  const ordered = overlapOrder(participants)
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
      if (p.top <= q.bottom || q.top <= p.bottom) continue
      if (rank[i] > rank[j]) behind[i].push(j)
      else behind[j].push(i)
    }
    active.length = keep; active.push(i)
  }
  for (const i of ordered) {
    let bias = 0
    for (const j of behind[i]) bias = Math.max(bias, participants[i].far - participants[j].near + out[j] + OVERLAP_CLEARANCE)
    out[i] = bias
  }
  return out
}
