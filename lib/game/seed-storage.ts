/**
 * The player's saved seed. The URL is the primary channel for sharing a map
 * (?seed=…); this is the fallback the shell reads when the URL names none, so
 * "Save" makes a seed the default for future sessions on this machine.
 */

const SEED_STORAGE_KEY = "pilgrimage.seed"

/** Null when nothing is saved or outside a browser. Call from effects, not render. */
export function loadSavedSeed(): number | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(SEED_STORAGE_KEY)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value >>> 0 : null
}

export function saveSeed(seed: number): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(SEED_STORAGE_KEY, String(seed >>> 0))
}
