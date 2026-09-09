/** Stable population sampling: changing the budget changes only its boundary,
 * never reshuffles the crowd on each frame or camera movement. */
export function densityHash(id: number): number {
  let value = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b)
  value = Math.imul(value ^ (value >>> 16), 0xc2b2ae35)
  return (value ^ (value >>> 16)) >>> 0
}

export function crowdRanks(ids: readonly number[]): Uint32Array {
  const order = ids.map((id, index) => ({ index, hash: densityHash(id) })).sort((a, b) => a.hash - b.hash || a.index - b.index)
  const ranks = new Uint32Array(ids.length)
  order.forEach(({ index }, rank) => { ranks[index] = rank })
  return ranks
}

// Extreme thinning is a diagnostic only; ordinary gameplay keeps the visible crowd.
export const crowdRenderControl = { enabled: false }
export const crowdRenderStatus = { active: false, budget: 0, rendered: 0, population: 0 }

/** Reserve frame time for input under sustained pressure. Simulation keeps every
 * person; only visual admission is reduced. Use whole observation windows,
 * fast reductions and slow recovery, and hold the boundary through zooming. */
export class CrowdBudget {
  active = false
  budget = 0
  private elapsed = 0
  private frames = 0
  private slow = 0
  private headroom = 0

  update(population: number, enabled: boolean, delta: number, hold = false): number {
    if (hold) return this.active ? Math.min(population, this.budget) : population
    if (!enabled || population <= 256) {
      this.active = false; this.budget = population; this.reset()
      return population
    }
    if (!this.active) { this.active = true; this.budget = Math.min(population, 1024); this.reset() }
    this.budget = Math.min(population, this.budget)
    // Background-tab stalls do not represent sustained rendering throughput.
    if (delta <= 0 || delta > .2) return this.budget
    this.elapsed += delta; this.frames++; if (delta > .040) this.slow++
    if (this.elapsed < 1) return this.budget
    const mean = this.elapsed / this.frames
    if (mean > 1 / 30 || this.slow / this.frames > .1) {
      this.budget = Math.max(128, Math.floor(this.budget * .75 / 32) * 32)
      this.headroom = 0
    } else if (mean < 1 / 35 && this.slow === 0) {
      if (++this.headroom >= 3) { this.budget = Math.min(population, this.budget + 64); this.headroom = 0 }
    } else this.headroom = 0
    this.elapsed = 0; this.frames = 0; this.slow = 0
    return this.budget
  }

  private reset() { this.elapsed = 0; this.frames = 0; this.slow = 0; this.headroom = 0 }
}
