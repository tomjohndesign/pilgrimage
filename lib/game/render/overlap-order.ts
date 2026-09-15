/**
 * Painter's order for characters standing on one spot.
 *
 * Every sprite carries per-texel rig depth, so two bodies whose anchors nearly
 * coincide compete texel by texel: robe folds, hoods and limbs of one figure
 * win in some columns and lose in others, and the overlap ink then hatches the
 * whole body. Real intersections between figures further apart still resolve
 * through their baked relief; only near-coincident anchors need a tie-break.
 *
 * Resolve neighbours from back to front. Each figure clears the bias already
 * assigned to those behind it by both sprites' estimated relief thickness.
 * Counting neighbours independently can push a large animal
 * ahead of a nearer person, especially when their neighbour sets differ.
 * The colour and ID passes share the value, and it is zero for every figure
 * with nobody behind it on its spot.
 */

export interface OverlapParticipant {
  /** World anchor position. */
  x: number
  z: number
  /** Camera distance along the view axis, larger is farther. */
  distance: number
  /** Sprite world size; radius and step scale with it. */
  size: number
  /** Stable draw order, breaking exact distance ties the way the passes do. */
  order: number
}

/** Anchors closer than this fraction of the sprite size share a spot. */
export const OVERLAP_RADIUS = 0.3
/** Relief allowance for each sprite, as a fraction of its cell size. */
export const OVERLAP_STEP = 0.25

/** World-unit bias toward the camera for each participant, in input order. */
export function overlapBiases(participants: readonly OverlapParticipant[], out: Float32Array<ArrayBufferLike> = new Float32Array(participants.length)): Float32Array<ArrayBufferLike> {
  const count = participants.length
  if (out.length < count) out = new Float32Array(count)
  out.fill(0, 0, count)
  if (count < 2) return out
  let largest = 0
  for (let i = 0; i < count; i++) if (participants[i].size > largest) largest = participants[i].size
  const cell = Math.max(1e-6, OVERLAP_RADIUS * largest)
  const buckets = new Map<number, number[]>()
  // Unique integer per cell; a hashed key could alias two neighbouring cells
  // and count one figure twice.
  const key = (cx: number, cz: number) => (cx + 0x8000) * 0x10000 + (cz + 0x8000)
  for (let i = 0; i < count; i++) {
    const p = participants[i], k = key(Math.floor(p.x / cell), Math.floor(p.z / cell))
    const bucket = buckets.get(k)
    if (bucket) bucket.push(i); else buckets.set(k, [i])
  }
  const ordered = Array.from({ length: count }, (_, i) => i)
  ordered.sort((a, b) => participants[b].distance - participants[a].distance || participants[a].order - participants[b].order)
  for (const i of ordered) {
    const p = participants[i], cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell)
    let bias = 0
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const bucket = buckets.get(key(cx + dx, cz + dz))
      if (!bucket) continue
      for (const j of bucket) {
        if (j === i) continue
        const q = participants[j]
        const radius = OVERLAP_RADIUS * Math.max(p.size, q.size)
        if ((p.x - q.x) ** 2 + (p.z - q.z) ** 2 >= radius * radius) continue
        if (q.distance > p.distance || (q.distance === p.distance && q.order < p.order)) {
          bias = Math.max(bias, out[j] + OVERLAP_STEP * (p.size + q.size))
        }
      }
    }
    out[i] = bias
  }
  return out
}
