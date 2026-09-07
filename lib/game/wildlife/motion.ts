/** Quintic easing holds the extremes softly, with zero velocity and acceleration. */
export function easeWing(t: number) {
  t = Math.max(0, Math.min(1, t))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** A brisk power stroke and a longer recovery; the feather tips trail the shoulder. */
export function wingBeat(phase: number) {
  const sample = (offset: number) => {
    const t = ((phase - offset) % 1 + 1) % 1
    return t < 0.42 ? 0.95 - 1.65 * easeWing(t / 0.42) : -0.7 + 1.65 * easeWing((t - 0.42) / 0.58)
  }
  const lift = sample(0), trailing = sample(0.085)
  return { lift, sweep: -0.12 + 0.18 * trailing, wrist: (trailing - lift) * 0.45 }
}


/** Cruising glides are long in hawks and brief in sparrows, clear of takeoff/landing. */
export function birdGlide(kind: "hawk" | "sparrow", elapsed: number, duration: number) {
  const t=elapsed/duration, cruise=easeWing((t-.18)/.07)*easeWing((.82-t)/.07)
  const cycle=(elapsed%(kind==="hawk"?8:2.2))/(kind==="hawk"?8:2.2)
  return cruise*easeWing((cycle-(kind==="hawk"?.27:.68))/.08)*easeWing((.98-cycle)/.08)
}
