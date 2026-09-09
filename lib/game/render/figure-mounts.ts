/** Admit rigs gradually and retain recently visited neighborhoods up to a
 * bounded cache size. Hidden figures skip posing; revisiting them needs no new
 * materials or frame subscriptions. Selection bypasses the admission budget. */
export function figureMounts(current: number[], desired: number[], selected = -1, budget = 16, cacheLimit = 0): number[] {
  const mounted = new Set(current)
  if (current.length <= Math.max(cacheLimit, desired.length) && desired.every(index => mounted.has(index))) return current
  const wanted = new Set(desired)
  const added: number[] = []
  for (const index of desired) {
    if (mounted.has(index)) continue
    if (index !== selected && added.length >= budget) continue
    added.push(index)
  }
  let excess = current.length + added.length - Math.max(cacheLimit, desired.length), removed = 0
  const next = current.filter(index => {
    if (wanted.has(index) || excess <= 0 || removed >= budget) return true
    excess--; removed++
    return false
  })
  next.push(...added)
  next.sort((a, b) => a - b)
  return next.length === current.length && next.every((index, i) => index === current[i]) ? current : next
}
