/** Opt-in timings for the real game loop; no samples are kept during normal play. */
let active = false
const samples = new Map<string, number[]>()
export const frameProfile = {
  start: () => active ? performance.now() : 0,
  end: (name: string, start: number) => {
    if (!active || !start) return
    let values = samples.get(name)
    if (!values) samples.set(name, values = [])
    if (values.length < 20000) values.push(performance.now() - start)
  },
  capture: (enabled: boolean) => {
    active = enabled
    if (enabled) { samples.clear(); return {} }
    return Object.fromEntries([...samples].map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b)
      return [name, { count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
        p95: sorted[Math.floor(sorted.length * .95)], max: sorted[sorted.length - 1] }]
    }))
  },
}
