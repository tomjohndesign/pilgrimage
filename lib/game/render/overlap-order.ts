/** Camera-space silhouette bounds and the actual depth range of its pose.
 * Distances grow away from the camera. Shared cart/passenger layers form one
 * participant, preserving their internal per-pixel depth. */
export interface OverlapParticipant {
  left: number; right: number; bottom: number; top: number
  near: number; far: number
  /** Logical ground-anchor depth, independent of animated foot planting. */
  distance: number
  order: number
  /** Connected sprites keep their local anchors: a walker beside the animal
   * must not be ordered against the distant cart axle. */
  parts?: OverlapParticipant[]
}

/** Clear float/depth-buffer rounding without an estimated body thickness. */
export const OVERLAP_CLEARANCE = .001

function intersection(a: OverlapParticipant, b: OverlapParticipant) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom))
}

/** Compare only the connected parts actually meeting on screen. Weight their
 * local anchor depths by overlap area when both animal and cart meet a figure.
 * Empty space between parts never creates an ordering constraint. */
function localOrder(a: OverlapParticipant, b: OverlapParticipant): number | undefined {
  let area = 0, difference = 0
  for (const p of a.parts ?? [a]) for (const q of b.parts ?? [b]) {
    const overlap = intersection(p, q)
    area += overlap; difference += overlap * (q.distance - p.distance)
  }
  if (!area) return undefined
  return Math.abs(difference / area) > 1e-6 ? difference : a.order - b.order
}

/** Separate intersecting silhouettes back to front. Connected parts retain one
 * bias (including their shafts/passengers), but use local overlap to order them
 * against neighbours. A dependency graph allows a walker beside either end of
 * a long convoy to use that end's anchor, regardless of the cart's direction.
 * Physically interpenetrating assemblies can form cycles; break those by stable
 * anchor/draw order, then enforce that same order for every involved pixel. */
export function overlapBiases(participants: readonly OverlapParticipant[], out: Float32Array<ArrayBufferLike> = new Float32Array(participants.length)): Float32Array<ArrayBufferLike> {
  const count = participants.length
  if (out.length < count) out = new Float32Array(count)
  out.fill(0, 0, count)
  if (count < 2) return out
  const ordered = Array.from({ length: count }, (_, i) => i)
  ordered.sort((a, b) => participants[b].distance - participants[a].distance || participants[a].order - participants[b].order)
  const neighbours: number[][] = Array.from({ length: count }, () => [])
  const inFront: number[][] = Array.from({ length: count }, () => [])
  const pending = new Int32Array(count), done = new Uint8Array(count)
  const sweep = ordered.slice().sort((a, b) => participants[a].left - participants[b].left)
  const active: number[] = []
  for (const i of sweep) {
    const p = participants[i]
    let keep = 0
    for (const j of active) {
      const q = participants[j]
      if (q.right <= p.left) continue
      active[keep++] = j
      if (!intersection(p, q)) continue
      const comparison = localOrder(p, q)
      if (comparison === undefined) continue
      neighbours[i].push(j); neighbours[j].push(i)
      const back = comparison < 0 ? i : j, front = comparison < 0 ? j : i
      inFront[back].push(front); pending[front]++
    }
    active.length = keep; active.push(i)
  }
  // Keep ready nodes in stable anchor order without rescanning the crowd for
  // every figure. Heap values are ranks, independent of batch visitation order.
  const rank = new Int32Array(count), ready: number[] = []
  ordered.forEach((index, i) => { rank[index] = i; if (!pending[index]) ready.push(i) })
  const push = (value: number) => {
    let at = ready.length; ready.push(value)
    while (at) {
      const parent = (at - 1) >> 1
      if (ready[parent] <= value) break
      ready[at] = ready[parent]; at = parent
    }
    ready[at] = value
  }
  const pop = () => {
    const first = ready[0], last = ready.pop()!
    if (ready.length) {
      let at = 0
      while (at * 2 + 1 < ready.length) {
        let child = at * 2 + 1
        if (child + 1 < ready.length && ready[child + 1] < ready[child]) child++
        if (last <= ready[child]) break
        ready[at] = ready[child]; at = child
      }
      ready[at] = last
    }
    return ordered[first]
  }
  let fallback = 0
  for (let remaining = count; remaining > 0; remaining--) {
    while (done[ordered[fallback]]) fallback++
    const i = ready.length ? pop() : ordered[fallback]
    const p = participants[i]
    let bias = 0
    for (const j of neighbours[i]) if (done[j]) bias = Math.max(bias, p.far - participants[j].near + out[j] + OVERLAP_CLEARANCE)
    out[i] = bias; done[i] = 1
    for (const j of inFront[i]) if (--pending[j] === 0 && !done[j]) push(rank[j])
  }
  return out
}
